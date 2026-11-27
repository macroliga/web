-- BORRADOR: no aplicar a Supabase alojado. Solo base local desechable.
-- No crea reglas, ventanas, usuarios ni operaciones reales.
-- Requiere validar contra el esquema completo de MACROLIGA y aprobar reglas/horario.
begin;
CREATE OR REPLACE FUNCTION app_private._contabilizar_traspaso(p_division_id uuid, p_jugador_id uuid, p_vendedor uuid, p_comprador uuid, p_origen text, p_destino text, p_importe bigint, p_tipo text, p_clave text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
begin
  if p_clave is null or length(btrim(p_clave)) < 8 or length(p_clave)>200 then
    raise exception 'Clave de operación inválida' using errcode='22023';
  end if;
  if p_importe is null or p_importe <= 0 then
    raise exception 'Importe inválido' using errcode='22023';
  end if;
  if p_tipo not in ('market','computer_sale','bad_team_sale','manager_sale','bad_team_clause') then
    raise exception 'Tipo aún no habilitado' using errcode='22023';
  end if;
  if (p_tipo='market' and
      (p_origen<>'computer' or p_destino<>'team' or p_vendedor is not null or p_comprador is null))
     or (p_tipo='computer_sale' and
      (p_origen<>'team' or p_destino<>'computer' or p_vendedor is null or p_comprador is not null))
     or (p_tipo='bad_team_sale' and
      (p_origen<>'team' or p_destino<>'bad_team' or p_vendedor is null or p_comprador is not null))
     or (p_tipo='bad_team_clause' and
      (p_origen is distinct from 'bad_team' or p_destino is distinct from 'team'
       or p_vendedor is not null or p_comprador is null))
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
  elsif p_origen='bad_team' then
    if not v_habia_propietario or v_tipo_propietario is distinct from 'bad_team'
       or v_equipo_propietario is not null then
      raise exception 'El jugador ya no pertenece al Equipo Malo' using errcode='22023';
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
  elsif p_origen in ('team','bad_team') then
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
$function$;

-- La función privada conserva propietario y permisos; explícitamente sin acceso cliente.
revoke all on function app_private._contabilizar_traspaso(uuid,uuid,uuid,uuid,text,text,bigint,text,text) from public,anon,authenticated;

create function public.macroliga_cotizar_clausula_equipo_malo(p_division_id uuid,p_jugador_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_team uuid:=app_private.equipo_manager_activo(p_division_id);
 v_season uuid; v_value bigint; v_count int; v_factor numeric; v_price numeric;
 v_balance bigint; v_max int; v_debt numeric; v_roster int; v_assets bigint;
 v_bids int; v_reserved bigint;
begin
 select season_id,max_roster,max_debt_percent into v_season,v_max,v_debt
   from public.divisions where id=p_division_id;
 select p.current_market_value_cents into v_value
   from public.roster_ownership r join public.players p on p.id=r.player_id
   where r.division_id=p_division_id and r.player_id=p_jugador_id
     and r.owner_kind='bad_team' and r.team_id is null and p.active;
 if not found or v_value<=0 then
   return jsonb_build_object('disponible',false,'motivo','Jugador no disponible en Equipo Malo.');
 end if;
 -- Solo reglas explícitas de la versión más reciente. Sin extrapolar, redondear
 -- ni recurrir a versiones antiguas. Los límites cerrados deben configurarse sin solapamiento.
 select count(*)::int,min(multiplier) into v_count,v_factor from public.clause_rules
   where season_id=v_season and version=(select max(version) from public.clause_rules where season_id=v_season)
     and source_ref is not null and btrim(source_ref)<>'' and to_value_cents is not null
     and v_value between from_value_cents and to_value_cents;
 if v_count<>1 then
   return jsonb_build_object('disponible',false,'motivo','Importe de cláusula pendiente de regla aprobada.');
 end if;
 v_price:=v_value::numeric*v_factor;
 if v_price<1 or v_price>9223372036854775807::numeric or trunc(v_price)<>v_price then
   return jsonb_build_object('disponible',false,'motivo','Importe de cláusula no válido o redondeo pendiente.');
 end if;
 if not exists(select 1 from public.clause_windows w where w.division_id=p_division_id
   and w.opens_at<=clock_timestamp() and w.closes_at>clock_timestamp()) then
   return jsonb_build_object('disponible',false,'importe_centimos',v_price::bigint::text,'motivo','Las cláusulas están cerradas.');
 end if;
 select balance_cents into v_balance from public.teams where id=v_team;
 select count(*)::int,coalesce(sum(p.current_market_value_cents),0)::bigint
   into v_roster,v_assets from public.roster_ownership r join public.players p on p.id=r.player_id
   where r.division_id=p_division_id and r.team_id=v_team and r.owner_kind='team';
 select count(*)::int,coalesce(sum(amount_cents),0)::bigint into v_bids,v_reserved
   from public.bids where division_id=p_division_id and team_id=v_team and status='active';
 if v_roster+v_bids>=v_max then
   return jsonb_build_object('disponible',false,'importe_centimos',v_price::bigint::text,'motivo','No hay plazas libres.');
 end if;
 -- Misma comprobación previa de margen y reservas que las ofertas entre managers.
 if v_price+v_reserved>v_balance::numeric+floor(v_assets::numeric*v_debt/100) then
   return jsonb_build_object('disponible',false,'importe_centimos',v_price::bigint::text,'motivo','No tienes margen económico suficiente.');
 end if;
 return jsonb_build_object('disponible',true,'importe_centimos',v_price::bigint::text);
end $$;

create function public.macroliga_pagar_clausula_equipo_malo(p_division_id uuid,p_jugador_id uuid,p_importe_centimos bigint,p_clave uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_team uuid:=app_private.equipo_manager_activo(p_division_id);
 v_prev public.transfer_operations%rowtype; v_key text; v_quote jsonb; v_season uuid;
begin
 if p_jugador_id is null or p_clave is null or p_importe_centimos is null or p_importe_centimos<=0 then
   raise exception 'Confirmación de cláusula inválida' using errcode='22023';
 end if;
 v_key:='bad-team-clause:'||v_team::text||':'||p_clave::text;
 -- Serializa con las operaciones económicas actuales (división -> equipos -> jugador).
 select season_id into v_season from public.divisions where id=p_division_id for update;
 if not found then raise exception 'División no disponible' using errcode='42501'; end if;
 perform 1 from public.teams where division_id=p_division_id order by id for update;
 if app_private.equipo_manager_activo(p_division_id)<>v_team then
   raise exception 'Equipo no disponible' using errcode='42501';
 end if;
 select * into v_prev from public.transfer_operations where idempotency_key=v_key;
 if found then
   if v_prev.status='committed' and v_prev.kind='bad_team_clause' and v_prev.division_id=p_division_id
     and v_prev.player_id=p_jugador_id and v_prev.buyer_team_id=v_team
     and v_prev.amount_cents=p_importe_centimos then return v_prev.id;
   end if;
   raise exception 'Clave de confirmación reutilizada' using errcode='23505';
 end if;
 perform 1 from public.players where id=p_jugador_id for share;
 perform 1 from public.clause_rules where season_id=v_season order by id for share;
 perform 1 from public.clause_windows where division_id=p_division_id order by id for share;
 v_quote:=public.macroliga_cotizar_clausula_equipo_malo(p_division_id,p_jugador_id);
 if v_quote->>'disponible' is distinct from 'true'
    or (v_quote->>'importe_centimos')::bigint is distinct from p_importe_centimos then
   raise exception 'Cláusula cerrada, no disponible o precio actualizado' using errcode='22023';
 end if;
 return app_private._contabilizar_traspaso(p_division_id,p_jugador_id,null,v_team,
   'bad_team','team',p_importe_centimos,'bad_team_clause',v_key);
end $$;
revoke all on function public.macroliga_cotizar_clausula_equipo_malo(uuid,uuid) from public,anon,authenticated;
revoke all on function public.macroliga_pagar_clausula_equipo_malo(uuid,uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.macroliga_cotizar_clausula_equipo_malo(uuid,uuid) to authenticated;
grant execute on function public.macroliga_pagar_clausula_equipo_malo(uuid,uuid,bigint,uuid) to authenticated;
commit;
