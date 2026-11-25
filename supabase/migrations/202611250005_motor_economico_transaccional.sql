-- MACROLIGA · Fase 3. Motor económico transaccional v0.1.
-- OBJETIVO EXCLUSIVO: proyecto Supabase macroliga-piloto.
-- Funciones privadas invocables solo por backend con service_role.
-- NO IMPLEMENTA todavía compraventas entre managers, cláusulas ni descuentos de premios.
-- Este módulo NO crea cuentas ni futbolistas ni activa el mercado.
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
  v_op uuid;
begin
  if p_clave is null or length(btrim(p_clave)) < 8 or length(p_clave)>200 then
    raise exception 'Clave de operación inválida' using errcode='22023';
  end if;
  if p_importe is null or p_importe <= 0 then
    raise exception 'Importe inválido' using errcode='22023';
  end if;
  if p_tipo not in ('market','computer_sale','bad_team_sale') then
    raise exception 'Tipo aún no habilitado' using errcode='22023';
  end if;
  if (p_tipo='market' and
      (p_origen<>'computer' or p_destino<>'team' or p_vendedor is not null or p_comprador is null))
     or (p_tipo='computer_sale' and
      (p_origen<>'team' or p_destino<>'computer' or p_vendedor is null or p_comprador is not null))
     or (p_tipo='bad_team_sale' and
      (p_origen<>'team' or p_destino<>'bad_team' or p_vendedor is null or p_comprador is not null)) then
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

  if not exists(select 1 from public.players p where p.id=p_jugador_id and p.active) then
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
  else
    insert into public.roster_ownership(division_id,player_id,owner_kind,team_id)
    values(p_division_id,p_jugador_id,'team',p_comprador);
  end if;
  return v_op;
end;
$$;
revoke all on function app_private._contabilizar_traspaso(uuid,uuid,uuid,uuid,text,text,bigint,text,text)
  from public,anon,authenticated,service_role;

-- Aceptar exactamente la oferta del Computer registrada en el anuncio.
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
begin
  select * into v_anuncio from public.sale_listings where id=p_anuncio_id;
  if not found then raise exception 'Anuncio no encontrado' using errcode='22023'; end if;
  select * into v_prev from public.transfer_operations where idempotency_key=p_clave;
  if found and v_prev.status='committed' and v_prev.kind='computer_sale'
    and v_prev.player_id=v_anuncio.player_id
    and v_prev.seller_team_id=v_anuncio.seller_team_id
    and v_prev.division_id=v_anuncio.division_id then
    return v_prev.id;
  end if;
  if v_anuncio.status<>'open' or v_anuncio.computer_offer_cents is null
    or v_anuncio.computer_offer_cents <= 0
    or v_anuncio.computer_offer_at is null
    or v_anuncio.computer_offer_at>pg_catalog.clock_timestamp()
    or v_anuncio.expires_at<=pg_catalog.clock_timestamp() then
    raise exception 'No existe una oferta vigente del Computer' using errcode='22023';
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

-- Venta inmediata a Equipo Malo, siempre al valor de mercado y de 12:00 a 00:00.
create or replace function app_private.vender_equipo_malo(
  p_equipo_id uuid,p_jugador_id uuid,p_clave text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_division uuid;
  v_zona text;
  v_importe bigint;
  v_prev public.transfer_operations%rowtype;
begin
  select * into v_prev from public.transfer_operations where idempotency_key=p_clave;
  if found and v_prev.status='committed' and v_prev.kind='bad_team_sale'
    and v_prev.player_id=p_jugador_id and v_prev.seller_team_id=p_equipo_id then
    return v_prev.id;
  end if;
  select t.division_id,d.timezone into v_division,v_zona
    from public.teams t join public.divisions d on d.id=t.division_id
   where t.id=p_equipo_id;
  if not found then raise exception 'Equipo inexistente'; end if;
  if (pg_catalog.clock_timestamp() at time zone v_zona)::time < time '12:00' then
    raise exception 'Equipo Malo cerrado hasta las 12:00' using errcode='22023';
  end if;
  select p.current_market_value_cents into v_importe
    from public.players p where p.id=p_jugador_id;
  if not found or v_importe<=0 then raise exception 'Valor de mercado no válido'; end if;
  return app_private._contabilizar_traspaso(
    v_division,p_jugador_id,p_equipo_id,null,
    'team','bad_team',v_importe,'bad_team_sale',p_clave
  );
end;
$$;

-- Publicación completa de un ciclo en UNA transacción; sin ganador sustituto.
-- El cierre y cálculo previo (status=calculated) los hará una tarea futura.
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
           b.id as puja_id,b.team_id,b.amount_cents
      from public.market_lots l
      left join lateral (
        select x.id,x.team_id,x.amount_cents
        from public.bids x
        where x.lot_id=l.id and x.status='active'
        order by x.amount_cents desc,x.accepted_at asc,x.submission_order asc
        limit 1
      ) b on true
     where l.cycle_id=p_ciclo_id
     order by l.id
  loop
    if v_lote.puja_id is null then continue; end if;
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
  update public.market_cycles set status='published',
         published_at=pg_catalog.clock_timestamp() where id=p_ciclo_id;
  return v_num;
end;
$$;

-- Ningún usuario puede llamar funciones económicas desde un navegador.
revoke all on function app_private.vender_computer(uuid,text) from public,anon,authenticated,service_role;
revoke all on function app_private.vender_equipo_malo(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function app_private.publicar_ciclo(uuid) from public,anon,authenticated,service_role;
grant usage on schema app_private to service_role;
grant execute on function app_private.vender_computer(uuid,text) to service_role;
grant execute on function app_private.vender_equipo_malo(uuid,uuid,text) to service_role;
grant execute on function app_private.publicar_ciclo(uuid) to service_role;

commit;
