-- PROPUESTA NO DESPLEGADA. Bajas: oferta y venta a Computer al último valor verificado, sin otras ventas ni compras.
begin;
create or replace function app_private._contabilizar_traspaso(
  p_division_id uuid,
  p_jugador_id uuid,
  p_vendedor uuid,
  p_comprador uuid,
  p_origen text,
  p_destino text,
  p_importe bigint,
  p_tipo text,
  p_clave text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev public.transfer_operations%rowtype;
  v_tipo_propietario text;
  v_equipo_propietario uuid;
  v_habia_propietario boolean;
  v_max smallint;
  v_estado text;
  v_num integer;
  v_check_team uuid;
  v_check_balance bigint;
  v_check_max smallint;
  v_check_debt numeric(6,3);
  v_check_roster integer;
  v_check_value bigint;
  v_check_bids integer;
  v_check_reserved bigint;
  v_check_limit bigint;
  v_op uuid;
  v_activo boolean;
  v_ultimo_valor bigint;
begin
  if p_clave is null or length(btrim(p_clave)) < 8 or length(p_clave)>200 then
    raise exception 'Clave de operación inválida' using errcode='22023';
  end if;
  if p_importe is null or p_importe < 0 then
    raise exception 'Importe inválido' using errcode='22023';
  end if;
  if p_tipo not in ('market','computer_sale','bad_team_sale','manager_sale') then
    raise exception 'Tipo aún no habilitado' using errcode='22023';
  end if;
  if (p_tipo='market' and
      (p_origen<>'computer' or p_destino<>'team' or p_vendedor is not null or p_comprador is null))
     or (p_tipo='computer_sale' and
      (p_origen<>'team' or p_destino<>'computer' or p_vendedor is null or p_comprador is not null))
     or (p_tipo='bad_team_sale' and
      (p_origen<>'team' or p_destino<>'bad_team' or p_vendedor is null or p_comprador is not null))
     or (p_tipo='manager_sale' and
      (p_origen<>'team' or p_destino<>'team' or p_vendedor is null
       or p_comprador is null or p_vendedor=p_comprador)) then
    raise exception 'Actores incompatibles con la operación' using errcode='22023';
  end if;

  -- Un bloqueo por división serializa todos los cambios de dinero y propiedad.
  select d.max_roster into v_max from public.divisions d
   where d.id=p_division_id for update;
  if not found then raise exception 'División inexistente'; end if;

  -- Repetición de la misma operación: no descuenta ni paga por segunda vez.
  select * into v_prev from public.transfer_operations
   where idempotency_key=p_clave;
  if found then
    if v_prev.status='committed'
       and v_prev.division_id=p_division_id
       and v_prev.player_id=p_jugador_id
       and v_prev.seller_team_id is not distinct from p_vendedor
       and v_prev.buyer_team_id is not distinct from p_comprador
       and v_prev.seller_kind=p_origen and v_prev.buyer_kind=p_destino
       and v_prev.amount_cents=p_importe and v_prev.kind=p_tipo then
      return v_prev.id;
    end if;
    raise exception 'Clave repetida con contenido distinto' using errcode='23505';
  end if;

  -- El importador conserva la fotografía del último día activo. La división
  -- ya está bloqueada y el importador también bloquea todas las divisiones.
  select p.active,p.current_market_value_cents into v_activo,v_ultimo_valor
    from public.players p where p.id=p_jugador_id;
  if not found or (not v_activo and p_tipo<>'computer_sale') then
    raise exception 'Futbolista inexistente o inactivo' using errcode='22023';
  end if;

  select r.owner_kind,r.team_id into v_tipo_propietario,v_equipo_propietario
    from public.roster_ownership r
   where r.division_id=p_division_id and r.player_id=p_jugador_id
   for update;
  v_habia_propietario:=found;
  if p_origen='computer' then
    if v_habia_propietario then
      raise exception 'Computer no es el propietario libre de este futbolista' using errcode='22023';
    end if;
  elsif p_origen='team' then
    if not v_habia_propietario
       or v_tipo_propietario<>'team'
       or v_equipo_propietario is distinct from p_vendedor then
      raise exception 'El vendedor no es propietario del futbolista' using errcode='22023';
    end if;
    select t.status into v_estado from public.teams t
     where t.id=p_vendedor and t.division_id=p_division_id;
    if not found or v_estado<>'active' then
      raise exception 'Vendedor inválido o inactivo' using errcode='22023';
    end if;
  end if;

  -- Solo una baja vendida por su titular a Computer admite valor cero, y
  -- únicamente el último valor exacto. Todos los demás traspasos mantienen
  -- las condiciones anteriores. Ni primas ni descuentos sobre las bajas.
  if not v_activo and p_tipo='computer_sale' then
    if p_importe is distinct from v_ultimo_valor then
      raise exception 'La oferta de la baja debe coincidir con el último valor verificado'
        using errcode='22023';
    end if;
  elsif p_importe<=0 then
    raise exception 'Importe inválido' using errcode='22023';
  end if;

  if p_destino='team' then
    select t.status into v_estado from public.teams t
     where t.id=p_comprador and t.division_id=p_division_id;
    if not found or v_estado<>'active' then
      raise exception 'Comprador inválido o inactivo' using errcode='22023';
    end if;
    select count(*) into v_num from public.roster_ownership r
      where r.division_id=p_division_id
        and r.owner_kind='team' and r.team_id=p_comprador;
    if v_num >= v_max then
      raise exception 'El comprador alcanzaría más de % futbolistas',v_max using errcode='22023';
    end if;
  end if;

  -- Dos meses sin recomprar por compraventa entre managers.
  -- Una eventual cláusula es un tipo distinto y tendrá su propia excepción.
  if p_tipo='manager_sale' and exists (
    select 1 from public.transfer_operations x
     where x.player_id=p_jugador_id and x.seller_team_id=p_comprador
       and x.buyer_kind='team' and x.kind='manager_sale'
       and x.status='committed'
       and x.effective_at > pg_catalog.clock_timestamp()-interval '2 months'
  ) then
    raise exception 'Recompra entre managers prohibida durante dos meses' using errcode='22023';
  end if;

  insert into public.transfer_operations(
    division_id,player_id,seller_team_id,buyer_team_id,
    seller_kind,buyer_kind,amount_cents,kind,effective_at,status,idempotency_key
  ) values (
    p_division_id,p_jugador_id,p_vendedor,p_comprador,
    p_origen,p_destino,p_importe,p_tipo,pg_catalog.clock_timestamp(),
    'committed',p_clave
  ) returning id into v_op;

  if p_origen='team' then
    update public.teams set balance_cents=balance_cents+p_importe where id=p_vendedor;
    insert into public.wallet_entries(team_id,operation_key,kind,delta_cents,note)
    values(p_vendedor,p_clave,'sale',p_importe,p_tipo);
    insert into public.roster_events(operation_id,player_id,division_id,team_id,action)
    values(v_op,p_jugador_id,p_division_id,p_vendedor,'release');
  end if;

  if p_destino='team' then
    update public.teams set balance_cents=balance_cents-p_importe where id=p_comprador;
    insert into public.wallet_entries(team_id,operation_key,kind,delta_cents,note)
    values(p_comprador,p_clave,'purchase',-p_importe,p_tipo);
    insert into public.roster_events(operation_id,player_id,division_id,team_id,action)
    values(v_op,p_jugador_id,p_division_id,p_comprador,'acquire');
  end if;

  if p_destino='computer' then
    delete from public.roster_ownership
     where division_id=p_division_id and player_id=p_jugador_id;
  elsif p_destino='bad_team' then
    update public.roster_ownership
       set owner_kind='bad_team',team_id=null,acquired_at=pg_catalog.clock_timestamp()
     where division_id=p_division_id and player_id=p_jugador_id;
    insert into public.roster_events(operation_id,player_id,division_id,team_id,action)
    values(v_op,p_jugador_id,p_division_id,null,'acquire');
  elsif p_origen='team' then
    update public.roster_ownership
      set owner_kind='team',team_id=p_comprador,acquired_at=pg_catalog.clock_timestamp()
      where division_id=p_division_id and player_id=p_jugador_id;
  else
    insert into public.roster_ownership(division_id,player_id,owner_kind,team_id)
    values(p_division_id,p_jugador_id,'team',p_comprador);
  end if;

  -- Ventas instantáneas: comprobar que la venta o compra no invalida
  -- LAS PUJAS YA ADMITIDAS. Si invalida, deshacer TODA la transferencia.
  -- Para la publicación market se verifica por otra vía: la propia puja
  -- ganadora aún figura activa durante el movimiento y no debe contarse
  -- artificialmente dos veces.
  if p_tipo<>'market' then
    for v_check_team in
      select p_vendedor where p_vendedor is not null
      union select p_comprador where p_comprador is not null
    loop
      select t.balance_cents,d.max_roster,d.max_debt_percent
        into v_check_balance,v_check_max,v_check_debt
        from public.teams t join public.divisions d on d.id=t.division_id
       where t.id=v_check_team and t.division_id=p_division_id;
      if not found then raise exception 'Equipo incoherente tras operación'; end if;
      select count(*)::integer,coalesce(sum(p.current_market_value_cents),0)::bigint
        into v_check_roster,v_check_value
        from public.roster_ownership r
        join public.players p on p.id=r.player_id
       where r.team_id=v_check_team and r.division_id=p_division_id and r.owner_kind='team';
      select count(*)::integer,coalesce(sum(b.amount_cents),0)::bigint
        into v_check_bids,v_check_reserved
        from public.bids b
       where b.team_id=v_check_team and b.division_id=p_division_id and b.status='active';
      if v_check_roster+v_check_bids>v_check_max then
        raise exception 'La operación comprometería más plazas que las permitidas'
          using errcode='22023';
      end if;
      v_check_limit:=v_check_balance+
        pg_catalog.floor(v_check_value::numeric*v_check_debt/100)::bigint;
      if v_check_reserved>v_check_limit then
        raise exception 'La operación dejaría pujas sin cobertura económica'
          using errcode='22023';
      end if;
    end loop;
  end if;
  return v_op;
end;
$$;
revoke all on function app_private._contabilizar_traspaso(uuid,uuid,uuid,uuid,text,text,bigint,text,text)
  from public,anon,authenticated,service_role;
-- El runner no puede invocar directamente el núcleo contable.
revoke all on function app_private._contabilizar_traspaso(uuid,uuid,uuid,uuid,text,text,bigint,text,text) from macroliga_runner;

-- Conserva los permisos de la función existente.
create or replace function app_private.vender_computer(
  p_anuncio_id uuid, p_clave text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anuncio public.sale_listings%rowtype;
  v_prev public.transfer_operations%rowtype;
  v_operacion uuid;
  v_division uuid;
  v_activo boolean;
  v_valor bigint;
begin
  select division_id into v_division from public.sale_listings where id=p_anuncio_id;
  if not found then raise exception 'Anuncio no encontrado' using errcode='22023'; end if;
  perform 1 from public.divisions d where d.id=v_division for update;
  select * into v_anuncio from public.sale_listings where id=p_anuncio_id and division_id=v_division for update;
  if not found then raise exception 'Anuncio no encontrado' using errcode='22023'; end if;
  select * into v_prev from public.transfer_operations where idempotency_key=p_clave;
  if found and v_prev.status='committed' and v_prev.kind='computer_sale'
    and v_prev.player_id=v_anuncio.player_id
    and v_prev.seller_team_id=v_anuncio.seller_team_id
    and v_prev.division_id=v_anuncio.division_id then
    return v_prev.id;
  end if;
  select p.active,p.current_market_value_cents into v_activo,v_valor
    from public.players p where p.id=v_anuncio.player_id;
  if not found then raise exception 'Futbolista inexistente' using errcode='22023'; end if;
  if v_anuncio.status<>'open' or v_anuncio.computer_offer_cents is null
    or (v_activo and v_anuncio.computer_offer_cents <= 0)
    or v_anuncio.computer_offer_at is null
    or v_anuncio.computer_offer_at>pg_catalog.clock_timestamp()
    or v_anuncio.expires_at<=pg_catalog.clock_timestamp() then
    raise exception 'No existe una oferta vigente del Computer' using errcode='22023';
  end if;
  -- No aceptar una oferta antigua a otro precio ni modificarla a escondidas.
  -- El operador debe preparar la oferta fija y el usuario confirmarla.
  if not v_activo and v_anuncio.computer_offer_cents is distinct from v_valor then
    raise exception 'Oferta antigua de Computer: actualizar al último valor verificado antes de confirmar'
      using errcode='22023';
  end if;
  v_operacion:=app_private._contabilizar_traspaso(
    v_anuncio.division_id,v_anuncio.player_id,v_anuncio.seller_team_id,
    null,'team','computer',v_anuncio.computer_offer_cents,'computer_sale',p_clave
  );
  update public.sale_listings set status='accepted'
   where id=p_anuncio_id and status='open';
  if not found then raise exception 'Anuncio modificado simultáneamente' using errcode='40001'; end if;
  return v_operacion;
end;
$$;

-- El operador privado prepara la oferta visible a precio fijo, sobre un
-- anuncio vigente del titular. No vende, no paga, no amplía permisos.
create function app_private.preparar_oferta_baja_computer(p_anuncio_id uuid)
returns bigint
language plpgsql security invoker set search_path=''
as $$
declare
  v_division uuid;
  v_anuncio public.sale_listings%rowtype;
  v_valor bigint;
begin
  select division_id into v_division from public.sale_listings where id=p_anuncio_id;
  if not found then raise exception 'Anuncio no encontrado' using errcode='22023'; end if;
  perform 1 from public.divisions d where d.id=v_division for update;
  select * into v_anuncio from public.sale_listings where id=p_anuncio_id and division_id=v_division for update;
  if not found or v_anuncio.status<>'open' or v_anuncio.expires_at<=pg_catalog.clock_timestamp() then
    raise exception 'Anuncio no vigente' using errcode='22023';
  end if;
  select p.current_market_value_cents into v_valor from public.players p
    join public.roster_ownership r on r.player_id=p.id
    join public.teams t on t.id=r.team_id and t.division_id=r.division_id
    where p.id=v_anuncio.player_id and not p.active
      and r.division_id=v_division and r.owner_kind='team'
      and r.team_id=v_anuncio.seller_team_id and t.status='active';
  if not found then raise exception 'La baja no pertenece al equipo vendedor' using errcode='22023'; end if;
  update public.sale_listings set computer_offer_cents=v_valor,computer_offer_at=pg_catalog.clock_timestamp()
    where id=p_anuncio_id;
  return v_valor;
end;
$$;
revoke all on function app_private.preparar_oferta_baja_computer(uuid)
 from public,anon,authenticated,service_role,macroliga_runner;
commit;
