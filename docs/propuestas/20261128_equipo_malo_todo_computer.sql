-- MACROLIGA PILOTO: compra de todo Computer libre <750.000 EUR tras resolver pujas.
-- Sustituye solamente la función existente. No ejecutar el runner al instalar.
-- Comprobar que nadie ha cambiado el motor desde la captura verificada.
do $guard$
begin
  if pg_catalog.md5(pg_catalog.pg_get_functiondef('app_private.publicar_ciclo(uuid)'::regprocedure)) <> 'f825e88c050abb8940aa1c8576a5fcc2' then
    raise exception 'Motor modificado desde la revisión; no se aplica el cambio';
  end if;
end
$guard$;
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
  v_compra_catalogo boolean;
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
  -- Regla autorizada solo para la competición, temporada y división piloto.
  -- Resolver por claves de negocio, no por IDs generados.
  select exists(
    select 1 from public.divisions d
    join public.seasons s on s.id=d.season_id
    join public.competitions c on c.id=s.competition_id
    join app_private.market_runner_divisions a on a.division_id=d.id
    where d.id=v_ciclo.division_id and c.code='MACROLIGA_PILOTO_INVIERNO_2026'
      and s.code='2026_27' and s.status='active' and d.code='PILOTO'
      and d.timezone='Europe/Madrid' and a.enabled
  ) into v_compra_catalogo;
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
    if not v_compra_catalogo and (v_unsold.day_number=2 or v_arranque) and v_unsold.activo and v_unsold.value_cents>0
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
  -- En PILOTO se compran TODOS los futbolistas libres de Computer,
  -- no solo los 15 del escaparate ni los que llevan dos jornadas.
  -- Los ganadores ya son propietarios; los lotes de esta jornada ya han
  -- expirado o sido adjudicados. Se protege cualquier otro lote disponible
  -- o puja activa anómala antes de cambiar propiedad.
  if v_compra_catalogo then
    for v_unsold in
      select p.id as player_id,p.current_market_value_cents as value_cents
        from public.players p
       where p.active and p.current_market_value_cents>0
         and p.current_market_value_cents<75000000
         and not exists(
           select 1 from public.roster_ownership r
            where r.division_id=v_ciclo.division_id and r.player_id=p.id)
         and not exists(
           select 1 from public.market_lots l
            where l.division_id=v_ciclo.division_id and l.player_id=p.id
              and (l.status='available' or exists(
                select 1 from public.bids b where b.lot_id=l.id and b.status='active')))
       order by p.id
       for share of p
    loop
      insert into public.transfer_operations(
        division_id,player_id,seller_team_id,buyer_team_id,seller_kind,buyer_kind,
        amount_cents,kind,effective_at,status,idempotency_key)
      values(v_ciclo.division_id,v_unsold.player_id,null,null,'computer','bad_team',
             v_unsold.value_cents,'bad_team_sale',pg_catalog.clock_timestamp(),
             'committed','mercado:equipo-malo:catalogo:'||p_ciclo_id||':'||v_unsold.player_id)
      returning id into v_operation;
      insert into public.roster_ownership(division_id,player_id,owner_kind,team_id)
        values(v_ciclo.division_id,v_unsold.player_id,'bad_team',null);
      insert into public.roster_events(operation_id,player_id,division_id,team_id,action)
        values(v_operation,v_unsold.player_id,v_ciclo.division_id,null,'acquire');
    end loop;
  end if;
  update public.market_cycles set status='published',
         published_at=pg_catalog.clock_timestamp() where id=p_ciclo_id;
  return v_num;
end;
$function$
;
