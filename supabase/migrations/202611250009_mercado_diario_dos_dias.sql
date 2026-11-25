-- MACROLIGA 0009: 15 visibles, segundo día, salida y Equipo Malo <750.000 €.
-- EXCLUSIVO macroliga-piloto; sin cron ni cambios en Comunio Laviana.
begin;
create unique index market_lots_one_available_per_division
 on public.market_lots(division_id,player_id) where status='available';

create or replace function app_private.publicar_ciclo(
  p_ciclo_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ciclo public.market_cycles%rowtype;
  v_lote record;
  v_num integer:=0;
  v_unsold record;
  v_operation uuid;
begin
  select * into v_ciclo from public.market_cycles
    where id=p_ciclo_id for update;
  if not found then raise exception 'Ciclo inexistente' using errcode='22023'; end if;
  if v_ciclo.status='published' then return 0; end if;
  if v_ciclo.status<>'calculated' or
     pg_catalog.clock_timestamp()<v_ciclo.publishes_at then
    raise exception 'Ciclo aún no publicable' using errcode='22023';
  end if;
  -- El bloqueo de división se toma antes de cualquier operación económica.
  perform 1 from public.divisions where id=v_ciclo.division_id for update;
  for v_lote in
    select l.id as lote_id,l.player_id,l.status as lote_estado,
           w.bid_id as puja_id,w.team_id,w.amount_cents
      from public.market_lots l
      left join app_private.market_winners w
        on w.lot_id=l.id and w.cycle_id=p_ciclo_id
     where l.cycle_id=p_ciclo_id
     order by l.id
  loop
    if v_lote.puja_id is null then
      if exists(select 1 from public.bids b
                where b.lot_id=v_lote.lote_id and b.status='active') then
        raise exception 'Pujas activas sin ganador congelado' using errcode='22023';
      end if;
      continue;
    end if;
    if not exists (
      select 1 from public.bids b
       where b.id=v_lote.puja_id and b.lot_id=v_lote.lote_id
         and b.team_id=v_lote.team_id and b.amount_cents=v_lote.amount_cents
         and b.status='active'
    ) then
      raise exception 'Instantánea de ganador inconsistente' using errcode='22023';
    end if;
    if v_lote.lote_estado<>'available' then
      raise exception 'Lote con ofertas pero estado incorrecto' using errcode='22023';
    end if;
    perform app_private._contabilizar_traspaso(
      v_ciclo.division_id,v_lote.player_id,null,v_lote.team_id,
      'computer','team',v_lote.amount_cents,'market',
      'mercado:'||p_ciclo_id::text||':'||v_lote.lote_id::text
    );
    update public.bids
       set status=case when id=v_lote.puja_id then 'won' else 'lost' end
     where lot_id=v_lote.lote_id and status='active';
    update public.market_lots set status='awarded' where id=v_lote.lote_id;
    v_num:=v_num+1;
  end loop;
  for v_unsold in
    select l.id,l.player_id,l.day_number,p.current_market_value_cents as value_cents
    from public.market_lots l join public.players p on p.id=l.player_id
    where l.cycle_id=p_ciclo_id and l.status='available' order by l.id
  loop
    if exists(select 1 from public.bids b
              where b.lot_id=v_unsold.id and b.status='active') then
      raise exception 'Lote sin adjudicar tiene pujas activas' using errcode='22023';
    end if;
    if exists(select 1 from public.roster_ownership r
              where r.division_id=v_ciclo.division_id and r.player_id=v_unsold.player_id) then
      raise exception 'Futbolista sin adjudicar tiene propietario' using errcode='22023';
    end if;
    if v_unsold.day_number=2 and v_unsold.value_cents>0
       and v_unsold.value_cents<75000000 then
      insert into public.transfer_operations(
        division_id,player_id,seller_team_id,buyer_team_id,seller_kind,buyer_kind,
        amount_cents,kind,effective_at,status,idempotency_key)
      values(v_ciclo.division_id,v_unsold.player_id,null,null,'computer','bad_team',
             v_unsold.value_cents,'bad_team_sale',pg_catalog.clock_timestamp(),
             'committed','mercado:equipo-malo:'||p_ciclo_id||':'||v_unsold.id)
      returning id into v_operation;
      insert into public.roster_ownership(division_id,player_id,owner_kind,team_id)
        values(v_ciclo.division_id,v_unsold.player_id,'bad_team',null);
      insert into public.roster_events(operation_id,player_id,division_id,team_id,action)
        values(v_operation,v_unsold.player_id,v_ciclo.division_id,null,'acquire');
    end if;
    update public.market_lots set status='expired' where id=v_unsold.id;
  end loop;
  update public.market_cycles set status='published',
         published_at=pg_catalog.clock_timestamp() where id=p_ciclo_id;
  return v_num;
end;
$$;

revoke all on function app_private.publicar_ciclo(uuid)
 from public,anon,authenticated,service_role;
grant execute on function app_private.publicar_ciclo(uuid) to service_role;

create or replace function app_private.preparar_mercado_diario(p_division_id uuid,p_dia date)
returns table(ciclo_id uuid,arrastrados integer,nuevos integer)
language plpgsql security definer set search_path=''
as $$
declare
 v_tz text;v_open timestamptz;v_close timestamptz;v_publish timestamptz;
 v_expected timestamptz;v_prev_id uuid;v_prev_open timestamptz;v_prev_status text;
 v_id uuid;v_carried int:=0;v_fresh int:=0;
begin
 if p_dia is null then raise exception 'Fecha obligatoria' using errcode='22023'; end if;
 select timezone into v_tz from public.divisions
   where id=p_division_id for update;
 if not found then raise exception 'División inexistente' using errcode='22023'; end if;
 v_open:=(p_dia::timestamp+time '06:00') at time zone v_tz;
 v_close:=((p_dia+1)::timestamp+time '01:00') at time zone v_tz;
 v_publish:=((p_dia+1)::timestamp+time '06:00') at time zone v_tz;
 v_expected:=((p_dia-1)::timestamp+time '06:00') at time zone v_tz;
 if not (v_open<v_close and v_close<v_publish) then
   raise exception 'Ventana horaria incoherente' using errcode='22023'; end if;
 select id into v_id from public.market_cycles
    where division_id=p_division_id and opens_at=v_open;
 if found then
   select count(*)::int into v_carried from public.market_lots
      where cycle_id=v_id and day_number=2;
   select count(*)::int into v_fresh from public.market_lots
      where cycle_id=v_id and day_number=1;
   return query select v_id,v_carried,v_fresh;return;
 end if;
 select id,opens_at,status into v_prev_id,v_prev_open,v_prev_status
    from public.market_cycles
    where division_id=p_division_id and opens_at<v_open
    order by opens_at desc limit 1;
 if found and (v_prev_open<>v_expected or v_prev_status<>'published') then
   raise exception 'Mercado anterior sin publicar o calendario interrumpido'
       using errcode='22023';
 end if;
 if exists(select 1 from public.market_cycles
           where division_id=p_division_id and opens_at>v_open) then
   raise exception 'No preparar mercados antiguos' using errcode='22023';
 end if;
 insert into public.market_cycles(division_id,opens_at,closes_at,publishes_at,status)
   values(p_division_id,v_open,v_close,v_publish,'draft') returning id into v_id;
 if v_prev_id is not null then
   insert into public.market_lots(cycle_id,player_id,minimum_bid_cents,
                                  day_number,status,division_id)
   select v_id,l.player_id,p.current_market_value_cents,2,'available',p_division_id
     from public.market_lots l join public.players p on p.id=l.player_id
    where l.cycle_id=v_prev_id and l.day_number=1 and l.status='expired'
      and p.active and p.current_market_value_cents>0
      and not exists(select 1 from public.roster_ownership o
        where o.division_id=p_division_id and o.player_id=l.player_id)
    order by l.id limit 15;
   get diagnostics v_carried=row_count;
 end if;
 if v_carried<15 then
   insert into public.market_lots(cycle_id,player_id,minimum_bid_cents,
                                  day_number,status,division_id)
   select v_id,p.id,p.current_market_value_cents,1,'available',p_division_id
     from public.players p where p.active and p.current_market_value_cents>0
      and not exists(select 1 from public.roster_ownership o
        where o.division_id=p_division_id and o.player_id=p.id)
      and not exists(select 1 from public.market_lots l
        where l.cycle_id=v_id and l.player_id=p.id)
      and not exists(select 1 from public.market_lots l
        where l.cycle_id=v_prev_id and l.player_id=p.id)
    order by pg_catalog.md5(v_id::text||':'||p.id::text)
    limit (15-v_carried);
   get diagnostics v_fresh=row_count;
 end if;
 return query select v_id,v_carried,v_fresh;
end;
$$;
revoke all on function app_private.preparar_mercado_diario(uuid,date)
 from public,anon,authenticated,service_role;
grant execute on function app_private.preparar_mercado_diario(uuid,date) to service_role;

create or replace function app_private.abrir_mercado_diario(p_ciclo_id uuid)
returns integer language plpgsql security definer set search_path=''
as $$
declare v_cycle public.market_cycles%rowtype;v_count int;
begin
 select * into v_cycle from public.market_cycles where id=p_ciclo_id for update;
 if not found then raise exception 'Ciclo inexistente' using errcode='22023'; end if;
 if v_cycle.status='open' then return 0; end if;
 if v_cycle.status<>'draft' then
   raise exception 'Mercado no preparado' using errcode='22023'; end if;
 if pg_catalog.clock_timestamp()<v_cycle.opens_at
    or pg_catalog.clock_timestamp()>=v_cycle.closes_at then
   raise exception 'Fuera de la ventana de apertura' using errcode='22023';
 end if;
 select count(*)::int into v_count from public.market_lots where cycle_id=p_ciclo_id;
 if v_count>15 then raise exception 'Más de 15 jugadores' using errcode='22023'; end if;
 update public.market_cycles set status='open' where id=p_ciclo_id;
 return v_count;
end;
$$;
revoke all on function app_private.abrir_mercado_diario(uuid)
 from public,anon,authenticated,service_role;
grant execute on function app_private.abrir_mercado_diario(uuid) to service_role;
commit;
