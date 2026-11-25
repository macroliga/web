-- MACROLIGA, prueba real 2 jornadas con estado íntegramente reversible.
-- Solo macroliga-piloto. NO crea usuarios ni ligas permanentes.
DO $trial$
DECLARE
  v_u uuid:=gen_random_uuid();v_comp uuid:=gen_random_uuid();
  v_season uuid:=gen_random_uuid();v_div uuid:=gen_random_uuid();
  v_m uuid:=gen_random_uuid();v_team uuid:=gen_random_uuid();
  v_today date:=(pg_catalog.clock_timestamp() at time zone 'Europe/Madrid')::date;
  v_prev uuid:=gen_random_uuid();v_new uuid;v_new_again uuid;
  v_day1_small uuid:=gen_random_uuid();v_day1_big uuid:=gen_random_uuid();
  v_day1_sold uuid:=gen_random_uuid();
  v_day2_small uuid:=gen_random_uuid();v_day2_boundary uuid:=gen_random_uuid();
  v_day2_big uuid:=gen_random_uuid();v_lot_sold uuid:=gen_random_uuid();
  v_carry integer;v_fresh integer;v_open_count integer;
  v_extra uuid;v_bid uuid;v_count int;i integer;
  v_open_old timestamptz;v_close_old timestamptz;v_publish_old timestamptz;
BEGIN
  if (pg_catalog.clock_timestamp() at time zone 'Europe/Madrid')::time < time '06:00' then
    raise exception 'Prueba diaria solo desde las 06:00 (zona Madrid)';
  end if;
  insert into auth.users(id,email,aud,role)
    values(v_u,'daily-'||v_u||'@example.invalid','authenticated','authenticated');
  insert into public.competitions(id,code,name)
    values(v_comp,'daily-'||v_comp,'Competición ficticia');
  insert into public.seasons(id,competition_id,code,name)
    values(v_season,v_comp,'winter','Temporada de prueba');
  insert into public.divisions(id,season_id,code,name)
    values(v_div,v_season,'unica','División ficticia');
  insert into public.managers(id,auth_user_id,display_name)
    values(v_m,v_u,'Manager ficticio');
  insert into public.teams(id,division_id,manager_id,team_name,balance_cents)
    values(v_team,v_div,v_m,'Equipo ficticio',5000000000);
  insert into public.wallet_entries(team_id,operation_key,kind,delta_cents)
    values(v_team,'inicio-'||v_team,'initial',5000000000);
  insert into public.players(id,name,position,current_market_value_cents) values
    (v_day1_small,'Día 1 barato','DEF',40000000),
    (v_day1_big,'Día 1 caro','MID',90000000),
    (v_day1_sold,'Día 1 adjudicado','FWD',200000000),
    (v_day2_small,'Día 2 barato <750k','GK',74999900),
    (v_day2_boundary,'Día 2 justo 750k','GK',75000000),
    (v_day2_big,'Día 2 caro >750k','DEF',80000000);
  for i in 1..25 loop
    insert into public.players(name,position,current_market_value_cents)
      values('Nuevo del mercado '||i,'MID',100000000);
  end loop;

  v_open_old:=((v_today-1)::timestamp+time '06:00') at time zone 'Europe/Madrid';
  v_close_old:=(v_today::timestamp+time '01:00') at time zone 'Europe/Madrid';
  v_publish_old:=(v_today::timestamp+time '06:00') at time zone 'Europe/Madrid';
  insert into public.market_cycles(id,division_id,opens_at,closes_at,publishes_at,status)
    values(v_prev,v_div,v_open_old,v_close_old,v_publish_old,'open');

  insert into public.market_lots(cycle_id,player_id,minimum_bid_cents,day_number,division_id)
    values(v_prev,v_day1_small,40000000,1,v_div),
          (v_prev,v_day1_big,90000000,1,v_div),
          (v_prev,v_day2_small,74999900,2,v_div),
          (v_prev,v_day2_boundary,75000000,2,v_div),
          (v_prev,v_day2_big,80000000,2,v_div);
  insert into public.market_lots(id,cycle_id,player_id,minimum_bid_cents,day_number,division_id)
    values(v_lot_sold,v_prev,v_day1_sold,200000000,1,v_div);
  insert into public.bids(lot_id,team_id,division_id,amount_cents,accepted_at)
    values(v_lot_sold,v_team,v_div,210000000,v_open_old+interval '1 hour')
    returning id into v_bid;

  if app_private.cerrar_calcular_ciclo(v_prev)<>1 then
    raise exception 'El primer cierre no congeló el ganador';
  end if;
  if app_private.publicar_ciclo(v_prev)<>1 then
    raise exception 'La primera publicación no adjudicó';
  end if;
  if app_private.publicar_ciclo(v_prev)<>0 then
    raise exception 'Doble publicación no idempotente';
  end if;

  if not exists(select 1 from public.roster_ownership
       where division_id=v_div and player_id=v_day1_sold
         and owner_kind='team' and team_id=v_team) then
    raise exception 'La compra del día anterior no se reflejó';
  end if;
  if (select balance_cents from public.teams where id=v_team)<>4790000000 then
    raise exception 'Saldo tras compra incorrecto';
  end if;
  if not exists(select 1 from public.roster_ownership
       where division_id=v_div and player_id=v_day2_small
         and owner_kind='bad_team' and team_id is null) then
    raise exception 'Equipo Malo no adquirió jugador inferior a 750k';
  end if;
  if exists(select 1 from public.roster_ownership
       where division_id=v_div and player_id in (v_day2_boundary,v_day2_big)) then
    raise exception 'Equipo Malo adquirió jugador de 750k o superior';
  end if;
  if (select count(*) from public.transfer_operations
       where division_id=v_div and buyer_kind='bad_team')<>1 then
    raise exception 'Falta registro histórico de Equipo Malo';
  end if;
  if (select status from public.market_lots
       where cycle_id=v_prev and player_id=v_day1_small)<>'expired' then
    raise exception 'Lote del primer día no finalizado';
  end if;
  if exists(select 1 from public.market_lots
       where cycle_id=v_prev and status='available') then
    raise exception 'Quedaron lotes abiertos tras publicar';
  end if;

  select ciclo_id,arrastrados,nuevos into v_new,v_carry,v_fresh
    from app_private.preparar_mercado_diario(v_div,v_today);
  if v_carry<>2 or v_fresh<>13 then
    raise exception 'No se respetó máximo 15 con 2 arrastres: % + %',v_carry,v_fresh;
  end if;
  if (select status from public.market_cycles where id=v_new)<>'draft' then
    raise exception 'Preparación activó el mercado sin permiso';
  end if;
  if not exists(select 1 from public.market_lots
       where cycle_id=v_new and player_id=v_day1_small and day_number=2)
     or not exists(select 1 from public.market_lots
       where cycle_id=v_new and player_id=v_day1_big and day_number=2) then
    raise exception 'No se arrastraron correctamente los lotes del primer día';
  end if;
  if exists(select 1 from public.market_lots
      where cycle_id=v_new and player_id in
        (v_day1_sold,v_day2_small,v_day2_boundary,v_day2_big)) then
    raise exception 'Se repitió jugador vendido o agotado de segundo día';
  end if;
  select ciclo_id into v_new_again
    from app_private.preparar_mercado_diario(v_div,v_today);
  if v_new_again<>v_new
     or (select count(*) from public.market_lots where cycle_id=v_new)<>15 then
    raise exception 'Preparación duplicada';
  end if;
  v_open_count:=app_private.abrir_mercado_diario(v_new);
  if v_open_count<>15 or app_private.abrir_mercado_diario(v_new)<>0 then
    raise exception 'Apertura o reintento incorrectos';
  end if;
  perform pg_catalog.set_config('request.jwt.claim.sub',v_u::text,true);
  v_bid:=public.macroliga_presentar_puja(
    (select id from public.market_lots
      where cycle_id=v_new and player_id=v_day1_small),41000000);
  if v_bid is null then raise exception 'No se aceptó puja de segundo día'; end if;

  -- Mañana no puede prepararse mientras el ciclo de hoy sigue abierto.
  begin
    perform app_private.preparar_mercado_diario(v_div,v_today+1);
    raise exception 'TEST: Preparación de mañana sin publicar hoy';
  exception when others then
    if SQLERRM not like 'Mercado anterior sin publicar%' then raise; end if;
  end;

  raise exception '__MACROLIGA_MARKET_DAILY_OK_ROLLBACK__';
EXCEPTION WHEN OTHERS THEN
  if SQLERRM='__MACROLIGA_MARKET_DAILY_OK_ROLLBACK__' then
    raise notice 'OK: segundo día, 15 plazas, venta, Equipo Malo <750k, bloqueo e idempotencia. Todo revertido.';
  else
    raise;
  end if;
END $trial$;