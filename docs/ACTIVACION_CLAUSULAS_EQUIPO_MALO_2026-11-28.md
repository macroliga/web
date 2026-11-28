# Activación real: compra por cláusula del Equipo Malo (28/11/2026)

## Resultado
- Alcance: solo Equipo Malo de MACROLIGA, proyecto piloto `xuwjbfnhvvbdargcohfe`, temporada 2026_27, división PILOTO.
- Fuente y pruebas: PR #4, commit probado `db9ecef007c98c32bb398bfcd43004dd7f9e7d41`; ejecución local PostgreSQL 17.11 anterior registrada en RESULTADOS_CLAUSULAS_EQUIPO_MALO_2026-11-27.md. GitHub Actions run 46010272549: success (sintaxis, Node, simulación sin credenciales). Fusionado en main `93e8064c0dd6b614c2740a24931ea523e0a05152`.
- Migraciones alojadas aplicadas con éxito: `20261128095921 macroliga_equipo_malo_clausulas_funciones_v28` y `20261128095943 macroliga_equipo_malo_clausulas_tramos_ventanas_2026_27`. SQL exacto más abajo; NO volver a ejecutar.
- Antes: función contable MD5 a264413ab28e495f64e046ad942072fc y ACL {postgres=X/postgres} coincidentes con la reversión ensayada; no había reglas ni ventanas ni RPC.
- Después: 388 reglas, 215 ventanas, una abierta a las 11:00 Madrid, cierre diario 01:00 y apertura 06:00, hasta última ventana del 30/06/2027 (cierre 01/07 a 01:00). Sin cron nuevo ni cambio en el mercado general. Los cinco jugadores activos recibieron una cotización disponible por la RPC real con una identidad existente simulada en claims de una consulta de lectura (sin login HTTP, sin exponer identidad); importes 624000 € dos jugadores, 702000 €, 1014000 €, 1406000 €. Cero compras de cláusula al verificar. No se crearon fixtures, usuarios ni traspasos. No se tocó Comunio Laviana.
- Permisos verificados: solo authenticated puede ejecutar las dos RPC; no anon, macroliga_runner ni service_role. Contabilidad privada sin acceso a esos roles. RLS y cero acceso directo cliente a tablas críticas confirmados antes del cambio; el linter posterior informa dos advertencias de SECURITY DEFINER autenticadas intencionadas, con autorización interna por auth.uid/división. No se cambian permisos de otros módulos.
- Límites: valores sin tramo o fracciones de céntimo se bloquean; extensión MACROLIGA 101–200 M solo en anclajes aprobados. No se hizo compra alojada de prueba por prohibición explícita. Fecha de fin de ventanas acotada conservadoramente a la temporada 2026/27, sin nueva automatización; revisar antes de la siguiente temporada.

## Desactivación reversible si se necesita (no ejecutada)
Suspender solo nuevas compras: retirar el EXECUTE de authenticated de la RPC de pago, o eliminar solo las ventanas identificadas por reason='MACROLIGA Equipo Malo v28 06-01 Madrid' para la división piloto. La reversión de funciones ensayada está en docs/propuestas/20261127_clausulas_equipo_malo_rollback.sql. No borrar ni revertir fichajes confirmados. Si se retiran reglas, restringir a la temporada PILOTO y source_ref exacta; hacerlo junto con la desactivación de ventanas y tras confirmar que no hay otros usos. No ejecutar ninguna reversión automáticamente.

## SQL aplicado — funciones
```sql
-- MACROLIGA piloto: funciones verificadas localmente, activación autorizada.
begin;
do $preflight$ begin
 if md5(pg_get_functiondef('app_private._contabilizar_traspaso(uuid,uuid,uuid,uuid,text,text,bigint,text,text)'::regprocedure)) <> 'a264413ab28e495f64e046ad942072fc' or
 (select proacl::text from pg_proc where oid='app_private._contabilizar_traspaso(uuid,uuid,uuid,uuid,text,text,bigint,text,text)'::regprocedure) is distinct from '{postgres=X/postgres}' or
 md5(pg_get_functiondef('app_private.equipo_manager_activo(uuid)'::regprocedure)) <> '823f4e7188c9a376313b6e8924d21449' then raise exception 'Definición/permiso contable distinto al ensayado'; end if;
 if exists(select 1 from public.clause_rules) or exists(select 1 from public.clause_windows) then raise exception 'Configuración de cláusulas cambió; abortar'; end if;
end $preflight$;

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
revoke all on function app_private._contabilizar_traspaso(uuid,uuid,uuid,uuid,text,text,bigint,text,text) from public,anon,authenticated,service_role,macroliga_runner;

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
revoke all on function public.macroliga_cotizar_clausula_equipo_malo(uuid,uuid) from public,anon,authenticated,service_role,macroliga_runner;
revoke all on function public.macroliga_pagar_clausula_equipo_malo(uuid,uuid,bigint,uuid) from public,anon,authenticated,service_role,macroliga_runner;
grant execute on function public.macroliga_cotizar_clausula_equipo_malo(uuid,uuid) to authenticated;
grant execute on function public.macroliga_pagar_clausula_equipo_malo(uuid,uuid,bigint,uuid) to authenticated;
commit;

```

## SQL aplicado — configuración piloto
```sql
begin;
create temporary table _ml_clause_seed(start_cents bigint,end_cents bigint,multiplier numeric) on commit drop;
insert into _ml_clause_seed values
 (16000000,34999999,3.9),
 (35000000,44999999,3.7),
 (45000000,49999999,3.6),
 (50000000,54999999,3.55),
 (55000000,59999999,3.5),
 (60000000,64999999,3.45),
 (65000000,69999999,3.4),
 (70000000,74999999,3.35),
 (75000000,79999999,3.3),
 (80000000,84999999,3.25),
 (85000000,89999999,3.2),
 (90000000,94999999,3.15),
 (95000000,99999999,3.1),
 (100000000,104999999,3),
 (105000000,109999999,2.9),
 (110000000,114999999,2.85),
 (115000000,119999999,2.8),
 (120000000,124999999,2.7),
 (125000000,129999999,2.65),
 (130000000,134999999,2.6),
 (135000000,139999999,2.55),
 (140000000,144999999,2.5),
 (145000000,149999999,2.45),
 (150000000,154999999,2.4),
 (155000000,159999999,2.35),
 (160000000,164999999,2.3),
 (165000000,169999999,2.25),
 (170000000,174999999,2.2),
 (175000000,179999999,2.15),
 (180000000,184999999,2.1),
 (185000000,189999999,2.1),
 (190000000,194999999,2.05),
 (195000000,199999999,2),
 (200000000,209999999,2),
 (210000000,219999999,2),
 (220000000,229999999,2),
 (230000000,239999999,2),
 (240000000,249999999,1.95),
 (250000000,259999999,1.9),
 (260000000,269999999,1.85),
 (270000000,279999999,1.85),
 (280000000,289999999,1.8),
 (290000000,299999999,1.75),
 (300000000,309999999,1.7),
 (310000000,319999999,1.69),
 (320000000,329999999,1.68),
 (330000000,339999999,1.67),
 (340000000,349999999,1.66),
 (350000000,359999999,1.65),
 (360000000,369999999,1.64),
 (370000000,379999999,1.63),
 (380000000,389999999,1.62),
 (390000000,399999999,1.61),
 (400000000,409999999,1.6),
 (410000000,419999999,1.59),
 (420000000,429999999,1.58),
 (430000000,439999999,1.57),
 (440000000,449999999,1.56),
 (450000000,459999999,1.55),
 (460000000,469999999,1.54),
 (470000000,479999999,1.53),
 (480000000,489999999,1.52),
 (490000000,499999999,1.51),
 (500000000,509999999,1.5),
 (510000000,519999999,1.49),
 (520000000,529999999,1.48),
 (530000000,539999999,1.47),
 (540000000,549999999,1.465),
 (550000000,559999999,1.46),
 (560000000,569999999,1.455),
 (570000000,579999999,1.45),
 (580000000,589999999,1.45),
 (590000000,599999999,1.4),
 (600000000,609999999,1.435),
 (610000000,619999999,1.43),
 (620000000,629999999,1.425),
 (630000000,639999999,1.42),
 (640000000,649999999,1.415),
 (650000000,659999999,1.41),
 (660000000,669999999,1.405),
 (670000000,679999999,1.4),
 (680000000,689999999,1.395),
 (690000000,699999999,1.39),
 (700000000,709999999,1.386),
 (710000000,719999999,1.385),
 (720000000,729999999,1.38),
 (730000000,739999999,1.375),
 (740000000,749999999,1.37),
 (750000000,759999999,1.365),
 (760000000,769999999,1.365),
 (770000000,779999999,1.36),
 (780000000,789999999,1.355),
 (790000000,799999999,1.355),
 (800000000,809999999,1.353),
 (810000000,819999999,1.351),
 (820000000,829999999,1.349),
 (830000000,839999999,1.347),
 (840000000,849999999,1.34),
 (850000000,859999999,1.33),
 (860000000,869999999,1.329),
 (870000000,879999999,1.328),
 (880000000,889999999,1.324),
 (890000000,899999999,1.32),
 (900000000,909999999,1.322225),
 (910000000,919999999,1.32),
 (920000000,929999999,1.318),
 (930000000,939999999,1.316),
 (940000000,949999999,1.314),
 (950000000,959999999,1.312),
 (960000000,969999999,1.31),
 (970000000,979999999,1.309),
 (980000000,989999999,1.307),
 (990000000,999999999,1.305),
 (1000000000,1009999999,1.3),
 (1010000000,1019999999,1.298),
 (1020000000,1029999999,1.296),
 (1030000000,1039999999,1.294),
 (1040000000,1049999999,1.292),
 (1050000000,1059999999,1.29),
 (1060000000,1069999999,1.288),
 (1070000000,1079999999,1.286),
 (1080000000,1089999999,1.284),
 (1090000000,1099999999,1.282),
 (1100000000,1109999999,1.2819),
 (1110000000,1119999999,1.279),
 (1120000000,1129999999,1.277),
 (1130000000,1139999999,1.275),
 (1140000000,1149999999,1.274),
 (1150000000,1159999999,1.273),
 (1160000000,1169999999,1.272),
 (1170000000,1179999999,1.271),
 (1180000000,1189999999,1.27),
 (1190000000,1199999999,1.269),
 (1200000000,1209999999,1.2667),
 (1210000000,1219999999,1.265),
 (1220000000,1229999999,1.264),
 (1230000000,1239999999,1.263),
 (1240000000,1249999999,1.262),
 (1250000000,1259999999,1.259),
 (1260000000,1269999999,1.258),
 (1270000000,1279999999,1.257),
 (1280000000,1289999999,1.256),
 (1290000000,1299999999,1.255),
 (1300000000,1309999999,1.2539),
 (1310000000,1319999999,1.252),
 (1320000000,1329999999,1.251),
 (1330000000,1339999999,1.25),
 (1340000000,1349999999,1.25),
 (1350000000,1359999999,1.249),
 (1360000000,1369999999,1.248),
 (1370000000,1379999999,1.247),
 (1380000000,1389999999,1.246),
 (1390000000,1399999999,1.245),
 (1400000000,1409999999,1.243),
 (1410000000,1419999999,1.242),
 (1420000000,1429999999,1.241),
 (1430000000,1439999999,1.24),
 (1440000000,1449999999,1.239),
 (1450000000,1459999999,1.238),
 (1460000000,1469999999,1.237),
 (1470000000,1479999999,1.236),
 (1480000000,1489999999,1.235),
 (1490000000,1499999999,1.234),
 (1500000000,1509999999,1.23334),
 (1510000000,1519999999,1.233),
 (1520000000,1529999999,1.232),
 (1530000000,1539999999,1.231),
 (1540000000,1549999999,1.23),
 (1550000000,1559999999,1.229),
 (1560000000,1569999999,1.228),
 (1570000000,1579999999,1.227),
 (1580000000,1589999999,1.227),
 (1590000000,1599999999,1.226),
 (1600000000,1619999999,1.225),
 (1620000000,1629999999,1.224),
 (1630000000,1639999999,1.224),
 (1640000000,1649999999,1.223),
 (1650000000,1659999999,1.222),
 (1660000000,1669999999,1.221),
 (1670000000,1679999999,1.22),
 (1680000000,1689999999,1.219),
 (1690000000,1699999999,1.218),
 (1700000000,1709999999,1.21765),
 (1710000000,1719999999,1.217),
 (1720000000,1729999999,1.216),
 (1730000000,1739999999,1.215),
 (1740000000,1749999999,1.215),
 (1750000000,1759999999,1.214),
 (1760000000,1769999999,1.214),
 (1770000000,1779999999,1.214),
 (1780000000,1789999999,1.213),
 (1790000000,1799999999,1.212),
 (1800000000,1809999999,1.211115),
 (1810000000,1819999999,1.21),
 (1820000000,1829999999,1.21),
 (1830000000,1839999999,1.209),
 (1840000000,1849999999,1.209),
 (1850000000,1859999999,1.208),
 (1860000000,1869999999,1.205),
 (1870000000,1879999999,1.204),
 (1880000000,1889999999,1.203),
 (1890000000,1899999999,1.202),
 (1900000000,1909999999,1.20651),
 (1910000000,1919999999,1.205),
 (1920000000,1929999999,1.204),
 (1930000000,1939999999,1.204),
 (1940000000,1949999999,1.203),
 (1950000000,1959999999,1.203),
 (1960000000,1969999999,1.202),
 (1970000000,1979999999,1.201),
 (1980000000,1989999999,1.201),
 (1990000000,1999999999,1.201),
 (2000000000,2009999999,1.2),
 (2010000000,2019999999,1.199),
 (2020000000,2029999999,1.199),
 (2030000000,2039999999,1.198),
 (2040000000,2049999999,1.198),
 (2050000000,2059999999,1.197),
 (2060000000,2069999999,1.196),
 (2070000000,2079999999,1.196),
 (2080000000,2089999999,1.195),
 (2090000000,2099999999,1.195),
 (2100000000,2109999999,1.195239),
 (2110000000,2119999999,1.194),
 (2120000000,2129999999,1.194),
 (2130000000,2139999999,1.194),
 (2140000000,2149999999,1.193),
 (2150000000,2159999999,1.193),
 (2160000000,2169999999,1.193),
 (2170000000,2179999999,1.192),
 (2180000000,2189999999,1.192),
 (2190000000,2199999999,1.192),
 (2200000000,2209999999,1.191),
 (2210000000,2219999999,1.19),
 (2220000000,2229999999,1.19),
 (2230000000,2239999999,1.19),
 (2240000000,2249999999,1.189),
 (2250000000,2259999999,1.189),
 (2260000000,2269999999,1.189),
 (2270000000,2279999999,1.188),
 (2280000000,2289999999,1.187),
 (2290000000,2299999999,1.187),
 (2300000000,2309999999,1.187),
 (2310000000,2329999999,1.187),
 (2330000000,2339999999,1.185),
 (2340000000,2349999999,1.185),
 (2350000000,2359999999,1.185),
 (2360000000,2369999999,1.185),
 (2370000000,2379999999,1.184),
 (2380000000,2389999999,1.184),
 (2390000000,2399999999,1.184),
 (2400000000,2409999999,1.1835),
 (2410000000,2419999999,1.1834),
 (2420000000,2429999999,1.1833),
 (2430000000,2439999999,1.1832),
 (2440000000,2449999999,1.1831),
 (2450000000,2459999999,1.1829),
 (2460000000,2469999999,1.1829),
 (2470000000,2479999999,1.181),
 (2480000000,2489999999,1.181),
 (2490000000,2499999999,1.18),
 (2500000000,2509999999,1.18),
 (2510000000,2519999999,1.179),
 (2520000000,2529999999,1.179),
 (2530000000,2539999999,1.179),
 (2540000000,2549999999,1.179),
 (2550000000,2559999999,1.179),
 (2560000000,2569999999,1.178),
 (2570000000,2579999999,1.178),
 (2580000000,2589999999,1.176),
 (2590000000,2599999999,1.175),
 (2600000000,2609999999,1.177),
 (2610000000,2619999999,1.177),
 (2620000000,2629999999,1.177),
 (2630000000,2639999999,1.175),
 (2640000000,2649999999,1.1758),
 (2650000000,2659999999,1.1758),
 (2660000000,2669999999,1.1756),
 (2670000000,2679999999,1.1754),
 (2680000000,2689999999,1.1752),
 (2690000000,2699999999,1.1751),
 (2700000000,2709999999,1.1741),
 (2710000000,2719999999,1.1741),
 (2720000000,2729999999,1.1741),
 (2730000000,2739999999,1.1741),
 (2740000000,2749999999,1.174),
 (2750000000,2759999999,1.174),
 (2760000000,2769999999,1.173),
 (2770000000,2779999999,1.172),
 (2780000000,2789999999,1.172),
 (2790000000,2799999999,1.171),
 (2800000000,2809999999,1.1715),
 (2810000000,2819999999,1.1715),
 (2820000000,2829999999,1.1714),
 (2830000000,2839999999,1.1714),
 (2840000000,2849999999,1.1713),
 (2850000000,2859999999,1.1713),
 (2860000000,2869999999,1.1712),
 (2870000000,2879999999,1.171),
 (2880000000,2899999999,1.17),
 (2900000000,2909999999,1.169),
 (2910000000,2919999999,1.1685),
 (2920000000,2929999999,1.1683),
 (2930000000,2939999999,1.1675),
 (2940000000,2949999999,1.1672),
 (2950000000,2959999999,1.167),
 (2960000000,2969999999,1.1676),
 (2970000000,2979999999,1.1674),
 (2980000000,2989999999,1.167),
 (2990000000,2999999999,1.1669),
 (3000000000,3099999999,1.1667),
 (3100000000,3199999999,1.165),
 (3200000000,3299999999,1.164),
 (3300000000,3399999999,1.163),
 (3400000000,3499999999,1.161),
 (3500000000,3599999999,1.159),
 (3600000000,3699999999,1.157),
 (3700000000,3799999999,1.156),
 (3800000000,3899999999,1.155),
 (3900000000,3999999999,1.153),
 (4000000000,4099999999,1.15),
 (4100000000,4199999999,1.15),
 (4200000000,4299999999,1.145),
 (4300000000,4399999999,1.144),
 (4400000000,4499999999,1.143),
 (4500000000,4599999999,1.142),
 (4600000000,4699999999,1.14),
 (4700000000,4799999999,1.139),
 (4800000000,4899999999,1.138),
 (4900000000,4999999999,1.137),
 (5000000000,5099999999,1.137),
 (5100000000,5199999999,1.135),
 (5200000000,5299999999,1.134),
 (5300000000,5399999999,1.133),
 (5400000000,5499999999,1.131),
 (5500000000,5599999999,1.131),
 (5600000000,5699999999,1.125),
 (5700000000,5799999999,1.125),
 (5800000000,5899999999,1.123),
 (5900000000,5999999999,1.121),
 (6000000000,6099999999,1.12),
 (6100000000,6199999999,1.119),
 (6200000000,6299999999,1.1165),
 (6300000000,6399999999,1.115),
 (6400000000,6499999999,1.114),
 (6500000000,6599999999,1.113),
 (6600000000,6699999999,1.113),
 (6700000000,6799999999,1.11),
 (6800000000,6899999999,1.109),
 (6900000000,6999999999,1.108),
 (7000000000,7099999999,1.1072),
 (7100000000,7199999999,1.106),
 (7200000000,7299999999,1.1057),
 (7300000000,7399999999,1.1054),
 (7400000000,7499999999,1.105),
 (7500000000,7599999999,1.104),
 (7600000000,7699999999,1.1035),
 (7700000000,7799999999,1.103),
 (7800000000,7899999999,1.1025),
 (7900000000,7999999999,1.101),
 (8000000000,8099999999,1.1),
 (8100000000,8199999999,1.1),
 (8200000000,8299999999,1.1),
 (8300000000,8399999999,1.1),
 (8400000000,8499999999,1.1),
 (8500000000,8599999999,1.1),
 (8600000000,8699999999,1.1),
 (8700000000,8799999999,1.1),
 (8800000000,8899999999,1.1),
 (8900000000,8999999999,1.1),
 (9000000000,9099999999,1.1),
 (9100000000,9199999999,1.1),
 (9200000000,9299999999,1.1),
 (9300000000,9399999999,1.1),
 (9400000000,9499999999,1.1),
 (9500000000,9599999999,1.1),
 (9600000000,9699999999,1.1),
 (9700000000,9799999999,1.1),
 (9800000000,9899999999,1.1),
 (9900000000,9999999999,1.1),
 (10000000000,10099999999,1.1),
 (10100000000,10100000000,1.1),
 (11000000000,11000000000,1.099),
 (12000000000,12000000000,1.098),
 (13000000000,13000000000,1.097),
 (15000000000,15000000000,1.095),
 (17500000000,17500000000,1.0925),
 (20000000000,20000000000,1.090);

do $activate$
declare v_season uuid; v_division uuid; v_count int; v_today date:=(clock_timestamp() at time zone 'Europe/Madrid')::date;
begin
 select s.id,d.id into strict v_season,v_division from public.seasons s join public.divisions d on d.season_id=s.id
 where s.code='2026_27' and s.status='active' and d.code='PILOTO' and d.timezone='Europe/Madrid';
 perform 1 from public.divisions d where d.season_id=v_season order by id for update;
 if exists(select 1 from public.clause_rules where season_id=v_season) or exists(select 1 from public.clause_windows where division_id=v_division) then raise exception 'La configuración ya existe; no sobrescribir'; end if;
 if (select count(*) from pg_temp._ml_clause_seed) <> 388 or exists(select 1 from pg_temp._ml_clause_seed a join pg_temp._ml_clause_seed b on a.start_cents<b.start_cents and a.end_cents>=b.start_cents) then raise exception 'Tabla de tramos incorrecta'; end if;
 if not has_function_privilege('authenticated','public.macroliga_pagar_clausula_equipo_malo(uuid,uuid,bigint,uuid)','execute') or has_function_privilege('anon','public.macroliga_pagar_clausula_equipo_malo(uuid,uuid,bigint,uuid)','execute') then raise exception 'Permisos de compra incorrectos'; end if;
 if v_today > date '2027-06-30' then raise exception 'Fuera de temporada piloto'; end if;
 insert into public.clause_rules(season_id,from_value_cents,to_value_cents,multiplier,source_ref,version)
 select v_season,start_cents,end_cents,multiplier,'MACROLIGA tabla original/extension aprobada - 2026-11-27',1 from pg_temp._ml_clause_seed order by start_cents;
 get diagnostics v_count = row_count;
 if v_count<>388 then raise exception 'No se han activado todos los tramos'; end if;
 -- Ventanas exclusivas del módulo de cláusulas, de 06:00 a 01:00 (Madrid).
 -- Precalculadas para temporada 2026/27; no requieren cron ni abren el mercado general.
 insert into public.clause_windows(division_id,opens_at,closes_at,reason)
 select v_division,(day::date+time '06:00') at time zone 'Europe/Madrid',
 ((day::date+1)+time '01:00') at time zone 'Europe/Madrid','MACROLIGA Equipo Malo v28 06-01 Madrid'
 from generate_series((v_today-1)::timestamp,date '2027-06-30'::timestamp,interval '1 day') day
 where ((day::date+1)+time '01:00') at time zone 'Europe/Madrid' > clock_timestamp();
 if not exists(select 1 from public.clause_windows where division_id=v_division) then raise exception 'No se han configurado ventanas'; end if;
end $activate$;
commit;
```
