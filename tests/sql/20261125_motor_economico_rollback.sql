-- MACROLIGA · PRUEBA DE INTEGRACIÓN sobre PostgreSQL real.
-- El bloque DO se revierte deliberadamente al completarse, sin dejar datos.
-- No ejecutar sobre ningún proyecto distinto de macroliga-piloto.
DO $test$
DECLARE
  u_a uuid:=gen_random_uuid(); u_b uuid:=gen_random_uuid();
  competencia uuid:=gen_random_uuid(); temporada uuid:=gen_random_uuid(); division uuid:=gen_random_uuid();
  manager_a uuid:=gen_random_uuid(); manager_b uuid:=gen_random_uuid();
  equipo_a uuid:=gen_random_uuid(); equipo_b uuid:=gen_random_uuid();
  jugador_a uuid:=gen_random_uuid(); jugador_b uuid:=gen_random_uuid();
  jugador_c uuid:=gen_random_uuid(); jugador_d uuid:=gen_random_uuid();
  jugador_e uuid:=gen_random_uuid(); jugador_17 uuid:=gen_random_uuid();
  ciclo uuid:=gen_random_uuid(); ciclo_malo uuid:=gen_random_uuid(); ciclo_lleno uuid:=gen_random_uuid();
  lote uuid:=gen_random_uuid(); lote_primero uuid:=gen_random_uuid();
  lote_segundo uuid:=gen_random_uuid(); lote_lleno uuid:=gen_random_uuid();
  aux uuid; anuncio uuid:=gen_random_uuid(); venta uuid; puja uuid;
  clave_computer text:='prueba-computer-'||gen_random_uuid()::text;
  clave_malo text:='prueba-equipo-malo-'||gen_random_uuid()::text;
  n integer; saldo_a bigint; saldo_b bigint; i integer; anterior integer;
BEGIN
  -- Todos los registros se crean con UUID nuevos y correos no operativos.
  insert into auth.users(id,email,aud,role) values
    (u_a,'fake-a-'||u_a::text||'@example.invalid','authenticated','authenticated'),
    (u_b,'fake-b-'||u_b::text||'@example.invalid','authenticated','authenticated');
  insert into public.competitions(id,code,name)
    values(competencia,'test-eco-'||competencia::text,'Liga ficticia temporal');
  insert into public.seasons(id,competition_id,code,name,status)
    values(temporada,competencia,'ensayo','Temporada ficticia','active');
  insert into public.divisions(id,season_id,code,name)
    values(division,temporada,'unica','Pruebas transaccionales');
  insert into public.managers(id,auth_user_id,display_name) values
    (manager_a,u_a,'Manager A de prueba'),(manager_b,u_b,'Manager B de prueba');
  insert into public.teams(id,division_id,manager_id,team_name,balance_cents) values
    (equipo_a,division,manager_a,'Equipo A',1000000000),
    (equipo_b,division,manager_b,'Equipo B',500000000);
  insert into public.wallet_entries(team_id,operation_key,kind,delta_cents,note)
    values(equipo_a,'inicial-a-'||equipo_a,'initial',1000000000,'Solo prueba'),
          (equipo_b,'inicial-b-'||equipo_b,'initial',500000000,'Solo prueba');
  insert into public.players(id,name,position,current_market_value_cents) values
    (jugador_a,'Jugador A ficticio','GK',200000000),
    (jugador_b,'Jugador B ficticio','DEF',300000000),
    (jugador_c,'Jugador C ficticio','MID',400000000),
    (jugador_d,'Jugador D ficticio','FWD',300000000),
    (jugador_e,'Jugador E ficticio','MID',100000000),
    (jugador_17,'Jugador 17 ficticio','FWD',100000000);
  insert into public.roster_ownership(division_id,player_id,owner_kind,team_id) values
    (division,jugador_a,'team',equipo_a),
    (division,jugador_b,'team',equipo_a),
    (division,jugador_c,'team',equipo_b);

  -- PUJAS REALES con dos identidades: el motor valida capacidad y plazas.
  insert into public.market_cycles(id,division_id,opens_at,closes_at,publishes_at,status)
    values(ciclo,division,now()-interval '2 hours',now()+interval '1 hour',
           now()+interval '5 hours','open');
  insert into public.market_lots(id,cycle_id,player_id,minimum_bid_cents,division_id)
    values(lote,ciclo,jugador_d,100000000,division);
  perform pg_catalog.set_config('request.jwt.claim.sub',u_a::text,true);
  puja:=public.macroliga_presentar_puja(lote,200000000);
  if puja is null then raise exception 'No se registró la puja A'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',u_b::text,true);
  puja:=public.macroliga_presentar_puja(lote,300000000);
  if puja is null then raise exception 'No se registró la puja B'; end if;
  -- Incluso con ciclo calculado, antes de la hora oficial no se publica.
  update public.market_cycles set status='calculated' where id=ciclo;
  begin
    perform app_private.publicar_ciclo(ciclo);
    raise exception 'ERROR: publicación anticipada';
  exception when others then
    if SQLERRM not like 'Ciclo aún no publicable%' then raise; end if;
  end;
  update public.market_cycles
     set closes_at=now()-interval '1 hour',
         publishes_at=now()-interval '20 minutes'
   where id=ciclo;
  n:=app_private.publicar_ciclo(ciclo);
  if n<>1 then raise exception 'La publicación no adjudicó exactamente una puja'; end if;
  if not exists(select 1 from public.roster_ownership where division_id=division
    and player_id=jugador_d and owner_kind='team' and team_id=equipo_b) then
    raise exception 'No ganó la puja de mayor importe';
  end if;
  if (select balance_cents from public.teams where id=equipo_b)<>200000000 then
    raise exception 'No se descontaron los 3 millones completos al comprador';
  end if;
  if (select count(*) from public.wallet_entries where team_id=equipo_b and kind='purchase')<>1 then
    raise exception 'El débito no se registró una vez';
  end if;
  if app_private.publicar_ciclo(ciclo)<>0 then
    raise exception 'Publicación duplicada';
  end if;

  -- VENTA AL COMPUTER: el precio procede de la oferta, no del cliente.
  insert into public.sale_listings(id,division_id,seller_team_id,player_id,
         listed_at,expires_at,computer_offer_cents,computer_offer_at,status)
    values(anuncio,division,equipo_a,jugador_b,now()-interval '1 hour',
           now()+interval '1 day',240000000,now()-interval '15 minutes','open');
  venta:=app_private.vender_computer(anuncio,clave_computer);
  if app_private.vender_computer(anuncio,clave_computer)<>venta then
    raise exception 'Reintento con otra operación';
  end if;
  if exists(select 1 from public.roster_ownership where division_id=division and player_id=jugador_b) then
    raise exception 'Jugador vendido al Computer sigue en la plantilla';
  end if;
  if (select balance_cents from public.teams where id=equipo_a)<>1240000000 then
    raise exception 'Venta Computer no abona 2,4 millones o duplica';
  end if;
  if (select status from public.sale_listings where id=anuncio)<>'accepted' then
    raise exception 'No se cerró el anuncio vendido';
  end if;
  -- Una clave distinta no puede revender el mismo anuncio.
  begin
    perform app_private.vender_computer(anuncio,
      'otra-clave-'||gen_random_uuid()::text);
    raise exception 'ERROR: se volvió a vender un anuncio aceptado';
  exception when others then
    if SQLERRM not like 'No existe una oferta vigente%' then raise; end if;
  end;

  -- VENTA INMEDIATA EQUIPO MALO: se utiliza el valor actual (2 millones).
  venta:=app_private.vender_equipo_malo(equipo_a,jugador_a,clave_malo);
  if app_private.vender_equipo_malo(equipo_a,jugador_a,clave_malo)<>venta then
    raise exception 'Reintento de Equipo Malo no idempotente';
  end if;
  if (select balance_cents from public.teams where id=equipo_a)<>1440000000 then
    raise exception 'No se abonó el valor exacto al vender al Equipo Malo';
  end if;
  if not exists(select 1 from public.roster_ownership where division_id=division and
     player_id=jugador_a and owner_kind='bad_team' and team_id is null) then
    raise exception 'No se transmitió propiedad al Equipo Malo';
  end if;

  -- Intento de vender de nuevo un jugador que ya no pertenece al manager.
  begin
    perform app_private.vender_equipo_malo(equipo_a,jugador_a,
        'prueba-duplicado-'||gen_random_uuid()::text);
    raise exception 'ERROR: se aceptó una venta sin propietario';
  exception when others then
    if SQLERRM not like 'El vendedor no es propietario%' then raise; end if;
  end;

  -- PUBLICACIÓN INCONSISTENTE: primer lote correcto, segundo ya ocupado.
  -- La subtransacción ha de revertir ambos, sin elegir un segundo ganador.
  if lote_primero>lote_segundo then
    aux:=lote_primero; lote_primero:=lote_segundo; lote_segundo:=aux;
  end if;
  insert into public.market_cycles(id,division_id,opens_at,closes_at,publishes_at,status)
    values(ciclo_malo,division,now()-interval '4 hours',now()-interval '3 hours',
           now()-interval '20 minutes','calculated');
  insert into public.market_lots(id,cycle_id,player_id,minimum_bid_cents,division_id)
    values(lote_primero,ciclo_malo,jugador_e,100000000,division),
          (lote_segundo,ciclo_malo,jugador_c,100000000,division);
  insert into public.bids(lot_id,team_id,amount_cents,status,division_id)
    values(lote_primero,equipo_a,100000000,'active',division),
          (lote_segundo,equipo_a,100000000,'active',division);
  begin
    perform app_private.publicar_ciclo(ciclo_malo);
    raise exception 'ERROR: se publicó un ciclo incoherente';
  exception when others then
    if SQLERRM not like 'Computer no es el propietario libre%' then raise; end if;
  end;
  if exists(select 1 from public.roster_ownership where division_id=division and
     player_id=jugador_e) then
    raise exception 'Fallo atómico: sobrevivió un movimiento del lote previo';
  end if;
  if exists(select 1 from public.transfer_operations where
     idempotency_key like 'mercado:'||ciclo_malo::text||':%') then
    raise exception 'Fallo atómico: sobrevivió un traspaso anterior';
  end if;
  if (select status from public.market_cycles where id=ciclo_malo)<>'calculated' then
    raise exception 'Fallo atómico: cambió el estado del ciclo rechazado';
  end if;

  -- Si un equipo llega a 16 jugadores, la adjudicación no puede crear un 17º.
  for i in 1..14 loop
    insert into public.players(name,position,current_market_value_cents)
      values('Jugador plantilla test '||i,'MID',100000000)
      returning id into aux;
    insert into public.roster_ownership(division_id,player_id,owner_kind,team_id)
      values(division,aux,'team',equipo_b);
  end loop;
  if (select count(*) from public.roster_ownership where team_id=equipo_b)<>16 then
    raise exception 'No se prepararon los 16 jugadores';
  end if;
  insert into public.market_cycles(id,division_id,opens_at,closes_at,publishes_at,status)
    values(ciclo_lleno,division,now()-interval '6 hours',now()-interval '5 hours',
           now()-interval '20 minutes','calculated');
  insert into public.market_lots(id,cycle_id,player_id,minimum_bid_cents,division_id)
    values(lote_lleno,ciclo_lleno,jugador_17,100000000,division);
  insert into public.bids(lot_id,team_id,amount_cents,status,division_id)
    values(lote_lleno,equipo_b,100000000,'active',division);
  begin
    perform app_private.publicar_ciclo(ciclo_lleno);
    raise exception 'ERROR: se permitió el jugador 17';
  exception when others then
    if SQLERRM not like 'El comprador alcanzaría más de%' then raise; end if;
  end;
  if exists(select 1 from public.roster_ownership where division_id=division and
    player_id=jugador_17) then
    raise exception 'No se revirtió la compra del futbolista 17';
  end if;

  -- Conciliación: saldo = suma del libro de movimientos para ambos equipos.
  select t.balance_cents into saldo_a from public.teams t where t.id=equipo_a;
  select t.balance_cents into saldo_b from public.teams t where t.id=equipo_b;
  if saldo_a is distinct from
     (select sum(delta_cents) from public.wallet_entries where team_id=equipo_a)
     or saldo_b is distinct from
     (select sum(delta_cents) from public.wallet_entries where team_id=equipo_b) then
    raise exception 'Saldo diferente al libro mayor';
  end if;

  -- Este error es intencionado: deshace TODO el ensayo, incluidos usuarios auth.
  raise exception '__MACROLIGA_TESTS_PASS_ROLLBACK__';
EXCEPTION WHEN OTHERS THEN
  if SQLERRM='__MACROLIGA_TESTS_PASS_ROLLBACK__' then
    raise notice 'PRUEBAS OK: mercado, Computer, Equipo Malo, idempotencia, atomicidad, máximo 16 y libro mayor. TODO REVERTIDO.';
  else
    raise;
  end if;
END
$test$;