-- PROPUESTA económica NO DESPLEGADA: requiere los selectores de mercado variado.
begin;
create or replace function app_private.preparar_mercado_diario(p_division_id uuid,p_dia date)
returns table(ciclo_id uuid,arrastrados integer,nuevos integer)
language plpgsql security definer set search_path=''
as $$
declare
 v_tz text;v_open timestamptz;v_close timestamptz;v_publish timestamptz;
 v_expected timestamptz;v_prev_id uuid;v_prev_open timestamptz;v_prev_status text;
 v_id uuid;v_carried int:=0;v_fresh int:=0;v_carried_ids uuid[];v_excluded uuid[];
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
 select coalesce(array_agg(l.player_id),'{}') into v_carried_ids from public.market_lots l where l.cycle_id=v_id;
 select coalesce(array_agg(l.player_id),'{}') into v_excluded from public.market_lots l where l.cycle_id=v_prev_id;
 insert into public.market_lots(cycle_id,player_id,minimum_bid_cents,day_number,status,division_id)
 select v_id,p.id,p.current_market_value_cents,1,'available',p_division_id
 from app_private.seleccionar_mercado_variado(p_division_id,v_id::text,v_excluded,v_carried_ids) s
 join public.players p on p.id=s.jugador_id order by s.orden;
 get diagnostics v_fresh=row_count;
 return query select v_id,v_carried,v_fresh;
end;
$$;
revoke all on function app_private.preparar_mercado_diario(uuid,date)
 from public,anon,authenticated,service_role;
grant execute on function app_private.preparar_mercado_diario(uuid,date) to service_role;
create or replace function app_private.abrir_mercado_diario(p_ciclo_id uuid)
returns integer language plpgsql security definer set search_path=''
as $$
declare v_cycle public.market_cycles%rowtype;v_count int;v_positions int;
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
 select count(*)::int,count(distinct p.position)::int into v_count,v_positions
 from public.market_lots l join public.players p on p.id=l.player_id
 where l.cycle_id=p_ciclo_id and l.division_id=v_cycle.division_id
 and l.status='available' and p.active and p.current_market_value_cents>0
 and not exists(select 1 from public.roster_ownership o
     where o.division_id=v_cycle.division_id and o.player_id=l.player_id);
 if v_count<>15 or v_positions<>4 or
    (select count(*) from public.market_lots where cycle_id=p_ciclo_id)<>15
 then raise exception 'Mercado debe contener 15 jugadores elegibles y las cuatro posiciones'
    using errcode='22023'; end if;
 update public.market_cycles set status='open' where id=p_ciclo_id;
 return v_count;
end;
$$;
revoke all on function app_private.abrir_mercado_diario(uuid)
 from public,anon,authenticated,service_role;
grant execute on function app_private.abrir_mercado_diario(uuid) to service_role;
commit;
