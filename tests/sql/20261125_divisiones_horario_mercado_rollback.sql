-- MACROLIGA: test zona España y divisiones independientes.
-- Caso de reloj DST y mismo futbolista elegible en dos divisiones.
DO $t$
DECLARE
  v_comp uuid:=gen_random_uuid();v_season uuid:=gen_random_uuid();
  v_d1 uuid:=gen_random_uuid();v_d2 uuid:=gen_random_uuid();
  v_player uuid:=gen_random_uuid();v_day date:=(pg_catalog.clock_timestamp() at time zone 'Europe/Madrid')::date;
  v_c1 uuid;v_c2 uuid;v_num integer;
BEGIN
  -- Primavera 2027: 27-03 06h CET, 28-03 01h CET, 28-03 06h CEST
  if (timestamp '2027-03-27 06:00' at time zone 'Europe/Madrid')
       <> timestamptz '2027-03-27 05:00+00'
    or (timestamp '2027-03-28 01:00' at time zone 'Europe/Madrid')
       <> timestamptz '2027-03-28 00:00+00'
    or (timestamp '2027-03-28 06:00' at time zone 'Europe/Madrid')
       <> timestamptz '2027-03-28 04:00+00' then
      raise exception 'Conversión horario verano incorrecta';
  end if;
  -- Otoño 2027: 30-10 06h CEST, 31-10 01h CEST, 31-10 06h CET.
  if (timestamp '2027-10-30 06:00' at time zone 'Europe/Madrid')
       <> timestamptz '2027-10-30 04:00+00'
    or (timestamp '2027-10-31 01:00' at time zone 'Europe/Madrid')
       <> timestamptz '2027-10-30 23:00+00'
    or (timestamp '2027-10-31 06:00' at time zone 'Europe/Madrid')
       <> timestamptz '2027-10-31 05:00+00' then
    raise exception 'Conversión horario invierno incorrecta';
  end if;
  insert into public.competitions(id,code,name)
    values(v_comp,'test-division-'||v_comp::text,'Dos divisiones');
  insert into public.seasons(id,competition_id,code,name)
    values(v_season,v_comp,'test','Temporada de ensayo');
  insert into public.divisions(id,season_id,code,name)
    values(v_d1,v_season,'a','División A'),
          (v_d2,v_season,'b','División B');
  insert into public.players(id,name,position,current_market_value_cents)
    values(v_player,'Futbolista común','MID',100000000);
  select ciclo_id into v_c1 from app_private.preparar_mercado_diario(v_d1,v_day);
  select ciclo_id into v_c2 from app_private.preparar_mercado_diario(v_d2,v_day);
  if v_c1=v_c2 then raise exception 'Se reutilizó ciclo entre divisiones'; end if;
  if (select count(*) from public.market_lots
      where player_id=v_player and cycle_id in (v_c1,v_c2))<>2 then
    raise exception 'Las divisiones no mantienen mercados independientes';
  end if;
  if (select count(*) from public.market_lots where cycle_id=v_c1)<>1
     or (select count(*) from public.market_lots where cycle_id=v_c2)<>1 then
    raise exception 'Mercados vacíos o duplicados';
  end if;
  -- Volver a preparar solo A no modifica los lotes de B.
  perform app_private.preparar_mercado_diario(v_d1,v_day);
  if (select count(*) from public.market_lots where cycle_id=v_c2)<>1 then
    raise exception 'La división A ha alterado la B';
  end if;
  raise exception '__MACROLIGA_DIVISIONES_DST_TEST_OK_ROLLBACK__';
EXCEPTION WHEN OTHERS THEN
  if SQLERRM='__MACROLIGA_DIVISIONES_DST_TEST_OK_ROLLBACK__' then
    raise notice 'Verificados mercados independientes y horario verano/invierno, revertidos';
  else
    raise;
  end if;
END $t$;