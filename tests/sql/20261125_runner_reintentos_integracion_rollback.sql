-- MACROLIGA: recorrido real del ejecutor con la cuenta NOLOGIN.
-- SOLO macroliga-piloto. BEGIN/ROLLBACK revierten el permiso SET ROLE,
-- división y futbolistas ficticios, ciclos, Equipo Malo y movimientos.
begin;
grant macroliga_runner to postgres with set true, inherit false;
do $test$
declare
  v_comp uuid:=gen_random_uuid(); v_season uuid:=gen_random_uuid();
  v_div uuid:=gen_random_uuid(); v_otra uuid:=gen_random_uuid();
  v_prev uuid:=gen_random_uuid(); v_new uuid; v_temporal uuid;
  v_day date:=(pg_catalog.clock_timestamp() at time zone 'Europe/Madrid')::date;
  v_day1_a uuid:=gen_random_uuid();v_day1_b uuid:=gen_random_uuid();
  v_day2_cheap uuid:=gen_random_uuid();v_day2_limit uuid:=gen_random_uuid();
  v_extra uuid; v_count int;v_carry int;v_new_count int;i int;
  v_st timestamptz;
begin
  if (pg_catalog.clock_timestamp() at time zone 'Europe/Madrid')::time<time '06:00' then
    raise exception 'Ejecutar el ensayo después de las 06:00 de Madrid';
  end if;
  insert into public.competitions(id,code,name)
    values(v_comp,'runner-retry-'||v_comp,'Competición ficticia ejecutor');
  insert into public.seasons(id,competition_id,code,name,status)
    values(v_season,v_comp,'ensayo','Temporada ficticia','active');
  insert into public.divisions(id,season_id,code,name)
    values(v_div,v_season,'habilitada','División ficticia autorizada'),
          (v_otra,v_season,'bloqueada','División ficticia prohibida');
  insert into app_private.market_runner_divisions(division_id,enabled)
    values(v_div,true),(v_otra,false);

  insert into public.players(id,name,position,current_market_value_cents)
    values(v_day1_a,'Prueba día1 A','MID',90000000),
          (v_day1_b,'Prueba día1 B','DEF',100000000),
          (v_day2_cheap,'Prueba día2 menor 750k','GK',74999900),
          (v_day2_limit,'Prueba día2 exacto 750k','FWD',75000000);
  for i in 1..20 loop
    insert into public.players(name,position,current_market_value_cents)
      values('Nuevo ficticio '||i,'MID',120000000);
  end loop;
  insert into public.market_cycles(id,division_id,opens_at,closes_at,publishes_at,status)
    values(v_prev,v_div,((v_day-1)::timestamp+time '06:00') at time zone 'Europe/Madrid',
                 (v_day::timestamp+time '01:00') at time zone 'Europe/Madrid',
                 (v_day::timestamp+time '06:00') at time zone 'Europe/Madrid','open');
  insert into public.market_lots(cycle_id,player_id,minimum_bid_cents,day_number,division_id)
    values(v_prev,v_day1_a,90000000,1,v_div),
          (v_prev,v_day1_b,100000000,1,v_div),
          (v_prev,v_day2_cheap,74999900,2,v_div),
          (v_prev,v_day2_limit,75000000,2,v_div);

  -- Actuar con el mismo rol sin login que utilizaría el ejecutor.
  execute 'set local role macroliga_runner';
  v_st:=app_private.runner_hora_servidor();
  if v_st is null then raise exception 'Fallo reloj de PostgreSQL';end if;
  if (select count(*) from app_private.runner_division(v_div))<>1 then
    raise exception 'El runner no ve su división autorizada';end if;
  begin
    perform app_private.runner_division(v_otra);
    raise exception 'TEST_ERROR: pudo ver división desautorizada';
  exception when insufficient_privilege then null;
  end;
  if app_private.runner_cerrar(v_prev)<>0
     or app_private.runner_cerrar(v_prev)<>0 then
    raise exception 'Reintento de cierre anómalo';end if;
  if app_private.runner_publicar(v_prev)<>0
     or app_private.runner_publicar(v_prev)<>0 then
    raise exception 'Reintento de publicación anómalo';end if;

  -- Inyectar fallo lógico inmediatamente después de preparar el día.
  -- La subtransacción debe deshacer su ciclo y lotes ficticios.
  begin
    select ciclo_id into v_temporal
      from app_private.runner_preparar(v_div,v_day);
    raise exception 'FALLO_SIMULADO_DESPUES_PREPARAR';
  exception when others then
    if SQLERRM<>'FALLO_SIMULADO_DESPUES_PREPARAR' then raise;end if;
  end;

  -- Reintento normal: crea un único mercado y nunca repite 3 días.
  select ciclo_id,arrastrados,nuevos into v_new,v_carry,v_new_count
    from app_private.runner_preparar(v_div,v_day);
  if v_new is null or v_carry<>2 or v_new_count<>13 then
    raise exception 'El reintento no creó 2 arrastres + 13 nuevos';
  end if;
  if (select ciclo_id from app_private.runner_preparar(v_div,v_day))<>v_new then
    raise exception 'Preparación repetida creó otro ciclo';end if;
  if app_private.runner_abrir(v_new)<>15
     or app_private.runner_abrir(v_new)<>0 then
    raise exception 'Apertura no fue idempotente';end if;
  begin
    perform app_private.runner_abrir(gen_random_uuid());
    raise exception 'TEST_ERROR: abrió ciclo inexistente';
  exception when others then
    if SQLERRM<>'Ciclo inexistente' then raise;end if;
  end;
  begin
    execute 'select count(*) from public.market_lots' into v_count;
    raise exception 'TEST_ERROR: acceso directo a tabla';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  if (select count(*) from public.market_lots where cycle_id=v_new)<>15
     or (select status from public.market_cycles where id=v_new)<>'open' then
    raise exception 'Mercado de hoy incorrecto';
  end if;
  if not exists(select 1 from public.roster_ownership
     where division_id=v_div and player_id=v_day2_cheap and owner_kind='bad_team')
     or exists(select 1 from public.roster_ownership
     where division_id=v_div and player_id=v_day2_limit) then
    raise exception 'Umbral Equipo Malo incorrecto';
  end if;
  if (select count(*) from public.market_cycles where division_id=v_div)<>2
     or (select count(*) from public.transfer_operations where division_id=v_div)<>1 then
    raise exception 'Duplicación de ciclos u operaciones';
  end if;
  raise exception '__MACROLIGA_NODE_RUNNER_SQL_OK__';
exception when others then
  execute 'reset role';
  if SQLERRM='__MACROLIGA_NODE_RUNNER_SQL_OK__' then
    raise notice 'OK: cierre, publicación, fallo simulado, reintento, Equipo Malo y apertura, revertidos';
  else
    raise;
  end if;
end $test$;
rollback;
