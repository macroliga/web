-- MACROLIGA: planificador privado y excepción de compra en el primer cierre.
-- No activa ni modifica ciclos por sí mismo. Mantiene cierre 01:00, apertura 06:00.
begin;
alter table app_private.market_runner_divisions
  add column if not exists bootstrap_cycle_id uuid references public.market_cycles(id) on delete restrict;
CREATE OR REPLACE FUNCTION app_private.publicar_ciclo(p_ciclo_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ciclo public.market_cycles%rowtype;
  v_lote record;
  v_num integer:=0;
  v_unsold record;
  v_operation uuid;
  v_arranque boolean;
begin
  select * into v_ciclo from public.market_cycles
    where id=p_ciclo_id for update;
  if not found then raise exception 'Ciclo inexistente' using errcode='22023'; end if;
  if v_ciclo.status='published' then return 0; end if;
  if v_ciclo.status<>'calculated' or
     pg_catalog.clock_timestamp()<v_ciclo.publishes_at then
    raise exception 'Ciclo aún no publicable' using errcode='22023';
  end if;
  -- Una única excepción autorizada de arranque, identificada por ciclo real.
  select exists(select 1 from app_private.market_runner_divisions a
    where a.division_id=v_ciclo.division_id and a.bootstrap_cycle_id=p_ciclo_id) into v_arranque;
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
    select l.id,l.player_id,l.day_number,p.current_market_value_cents as value_cents,p.active as activo
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
    if (v_unsold.day_number=2 or v_arranque) and v_unsold.activo and v_unsold.value_cents>0
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
$function$;
revoke all on function app_private.publicar_ciclo(uuid) from public,anon,authenticated,service_role,macroliga_runner;
grant execute on function app_private.publicar_ciclo(uuid) to service_role;

-- Se ejecuta exclusivamente por el programador interno de PostgreSQL.
-- Usa las funciones transaccionales existentes y la lista blanca de divisiones.
create or replace function app_private.procesar_mercado_programado(p_division_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_ahora timestamptz:=pg_catalog.clock_timestamp();
 v_local timestamp:=v_ahora at time zone 'Europe/Madrid';
 v_dia date:=v_local::date;
 v_ciclo public.market_cycles%rowtype;
 v_id uuid; v_cerrados int:=0;v_publicados int:=0;v_abiertos int:=0;v_preparados int:=0;
begin
 perform app_private._runner_exigir_division(p_division_id);
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('macroliga:mercado:'||p_division_id::text,0)) then
   return jsonb_build_object('estado','otra ejecución en curso');
 end if;
 for v_ciclo in select c.* from public.market_cycles c
    where c.division_id=p_division_id and c.status<>'published' order by c.opens_at
 loop
   if v_ciclo.status='failed' or (v_ciclo.status='draft' and v_ahora>=v_ciclo.closes_at) then
     raise exception 'Ciclo fallido o borrador vencido; revisión manual';
   end if;
   if v_ciclo.status in ('open','closed') and v_ahora>=v_ciclo.closes_at then
     perform app_private.runner_cerrar(v_ciclo.id);
     v_ciclo.status:='calculated';v_cerrados:=v_cerrados+1;
   end if;
   if v_ciclo.status='calculated' and v_ahora>=v_ciclo.publishes_at then
     perform app_private.runner_publicar(v_ciclo.id);
     v_publicados:=v_publicados+1;
   end if;
 end loop;
 -- No crear el mercado siguiente hasta las 06:00 de Madrid.
 if v_local::time>=time '06:00' then
   select c.id into v_id from public.market_cycles c where c.division_id=p_division_id
     and c.opens_at=(v_dia::timestamp+time '06:00') at time zone 'Europe/Madrid';
   if not found then
     select x.ciclo_id into strict v_id from app_private.runner_preparar(p_division_id,v_dia) x;
     v_preparados:=v_preparados+1;
   end if;
   select * into strict v_ciclo from public.market_cycles where id=v_id;
   if v_ciclo.status='draft' and v_ahora>=v_ciclo.opens_at and v_ahora<v_ciclo.closes_at then
     perform app_private.runner_abrir(v_id);v_abiertos:=v_abiertos+1;
   end if;
 end if;
 return jsonb_build_object('cerrados',v_cerrados,'publicados',v_publicados,'preparados',v_preparados,'abiertos',v_abiertos);
end;
$$;
revoke all on function app_private.procesar_mercado_programado(uuid) from public,anon,authenticated,service_role,macroliga_runner;
commit;
