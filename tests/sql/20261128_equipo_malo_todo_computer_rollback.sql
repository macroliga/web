-- SOLO PostgreSQL desechable: fixtures ficticios y rollback final.
begin;
do $test$
declare
  co uuid:=gen_random_uuid(); se uuid:=gen_random_uuid();
  di uuid:=gen_random_uuid(); other_di uuid:=gen_random_uuid();
  u uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); t uuid:=gen_random_uuid();
  cycle uuid:=gen_random_uuid(); other_cycle uuid:=gen_random_uuid(); future_cycle uuid:=gen_random_uuid();
  first_day uuid:=gen_random_uuid(); second_day uuid:=gen_random_uuid();
  outside uuid:=gen_random_uuid(); edge_below uuid:=gen_random_uuid();
  edge_equal uuid:=gen_random_uuid(); above uuid:=gen_random_uuid();
  zero_value uuid:=gen_random_uuid(); inactive uuid:=gen_random_uuid();
  owned uuid:=gen_random_uuid(); already_bad uuid:=gen_random_uuid();
  winner uuid:=gen_random_uuid(); reserved uuid:=gen_random_uuid();
  other_owned uuid:=gen_random_uuid(); old_first uuid:=gen_random_uuid(); old_second uuid:=gen_random_uuid();
  old_outside uuid:=gen_random_uuid(); lot_win uuid:=gen_random_uuid();
  first_conflict uuid:='00000000-0000-0000-0000-000000000001'; conflict_player uuid:='00000000-0000-0000-0000-000000000002'; conflict_cycle uuid:=gen_random_uuid();
  v_open timestamptz:=clock_timestamp()-interval '20 hours';
  v_close timestamptz:=clock_timestamp()-interval '5 hours';
  v_publish timestamptz:=clock_timestamp()-interval '1 hour';
  expected uuid[]; got uuid[]; n int; amount bigint; before_n int;
begin
  insert into public.competitions(id,code,name) values(co,'MACROLIGA_PILOTO_INVIERNO_2026','Prueba aislada');
  insert into public.seasons(id,competition_id,code,name,status) values(se,co,'2026_27','Prueba','active');
  insert into public.divisions(id,season_id,code,name) values(di,se,'PILOTO','Prueba'),(other_di,se,'OTRA','Otra prueba');
  insert into app_private.market_runner_divisions(division_id,enabled) values(di,true),(other_di,true);
  insert into auth.users(id) values(u);
  insert into public.managers(id,auth_user_id,display_name) values(m,u,'Fixture');
  insert into public.teams(id,division_id,manager_id,team_name,balance_cents) values(t,di,m,'Fixture',1000000000);
  insert into public.players(id,name,position,current_market_value_cents,active) values
    (first_day,'Día primero','MID',15000000,true),(second_day,'Día segundo','MID',25000000,true),
    (outside,'Fuera escaparate','MID',30000000,true),(edge_below,'Céntimo bajo límite','MID',74999999,true),
    (edge_equal,'Límite exacto','MID',75000000,true),(above,'Sobre límite','MID',75000001,true),
    (zero_value,'Sin valoración','MID',0,true),(inactive,'Inactivo','MID',10000000,false),
    (owned,'Manager','MID',10000000,true),(already_bad,'Ya Equipo Malo','MID',12000000,true),
    (winner,'Ganador de puja','MID',45000000,true),(reserved,'Reservado otro ciclo','MID',33000000,true),
    (other_owned,'Propietario en otra división','MID',20000000,true),
    (old_first,'Primero otra división','MID',20000000,true),(old_second,'Segundo otra división','MID',20000000,true),
    (old_outside,'Exterior otra división','MID',20000000,true);
  insert into public.roster_ownership(division_id,player_id,owner_kind,team_id)
    values(di,owned,'team',t),(di,already_bad,'bad_team',null),(other_di,other_owned,'bad_team',null);
  -- Estos tres últimos sirven para demostrar que otra división conserva la regla anterior:
  -- en piloto no son libres.
  insert into public.roster_ownership(division_id,player_id,owner_kind)
    values(di,old_first,'bad_team'),(di,old_second,'bad_team'),(di,old_outside,'bad_team');
  insert into public.market_cycles(id,division_id,opens_at,closes_at,publishes_at,status)
    values(cycle,di,v_open,v_close,v_publish,'open'),
          (other_cycle,other_di,v_open,v_close,v_publish,'open'),
          (future_cycle,di,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '5 hours',clock_timestamp()+interval '10 hours','draft');
  insert into public.market_lots(id,cycle_id,player_id,minimum_bid_cents,day_number,division_id)
    values(gen_random_uuid(),cycle,first_day,15000000,1,di),
          (gen_random_uuid(),cycle,second_day,25000000,2,di),
          (gen_random_uuid(),cycle,above,75000001,1,di),
          (lot_win,cycle,winner,45000000,1,di),
          (gen_random_uuid(),future_cycle,reserved,33000000,1,di),
          (gen_random_uuid(),other_cycle,old_first,20000000,1,other_di),
          (gen_random_uuid(),other_cycle,old_second,20000000,2,other_di);
  insert into public.bids(lot_id,team_id,amount_cents,accepted_at,division_id)
    values(lot_win,t,50000000,v_open+interval '1 hour',di);
  if app_private.cerrar_calcular_ciclo(cycle)<>1 then raise exception 'No se calculó ganador';end if;
  if app_private.runner_publicar(cycle)<>1 then raise exception 'No se adjudicó ganador';end if;
  expected:=array[first_day,second_day,outside,edge_below,other_owned];
  select array_agg(player_id order by player_id) into got from public.transfer_operations where division_id=di and kind='bad_team_sale';
  if got is distinct from (select array_agg(x order by x) from unnest(expected)x) then raise exception 'Compras incorrectas: %',got;end if;
  if (select count(*) from public.roster_ownership where division_id=di and player_id=any(expected) and owner_kind='bad_team' and team_id is null)<>5 then raise exception 'Plantilla incompleta';end if;
  if (select count(*) from public.transfer_operations x join public.roster_events e on e.operation_id=x.id and e.player_id=x.player_id and e.division_id=x.division_id and e.team_id is null and e.action='acquire' where x.division_id=di and x.kind='bad_team_sale' and x.status='committed')<>5 then raise exception 'Eventos o historial incompletos';end if;
  if (select count(*) from public.transfer_operations x join public.players p on p.id=x.player_id where x.division_id=di and x.kind='bad_team_sale' and x.amount_cents=p.current_market_value_cents and x.seller_kind='computer' and x.buyer_kind='bad_team' and x.buyer_team_id is null and x.seller_team_id is null)<>5 then raise exception 'Importes incorrectos';end if;
  if not exists (select 1 from public.roster_ownership where division_id=di and player_id=winner and team_id=t and owner_kind='team') then raise exception 'Puja ganadora perdida';end if;
  if (select balance_cents from public.teams where id=t)<>950000000 or (select count(*) from public.wallet_entries where team_id=t)<>1 then raise exception 'Saldo de manager alterado indebidamente';end if;
  if (select status from public.market_cycles where id=cycle)<>'published' or exists(select 1 from public.market_lots where cycle_id=cycle and status='available') then raise exception 'Ciclo pendiente';end if;
  if app_private.runner_publicar(cycle)<>0 or (select count(*) from public.transfer_operations where division_id=di)<>6 then raise exception 'No idempotente';end if;
  -- Fecha futura: nunca se ejecuta por adelantado.
  begin
    perform app_private.runner_publicar(future_cycle);
    raise exception 'Publicación adelantada permitida';
  exception when sqlstate '22023' then null; end;
  -- La división ajena sigue comprando únicamente el no vendido en segundo día.
  perform app_private.cerrar_calcular_ciclo(other_cycle);
  perform app_private.runner_publicar(other_cycle);
  if (select count(*) from public.transfer_operations where division_id=other_di and kind='bad_team_sale' and player_id=old_second)<>1 or (select count(*) from public.transfer_operations where division_id=other_di and kind='bad_team_sale')<>1 then raise exception 'Aislamiento de otra división fallido';end if;
  -- Fallo deliberado de clave en ciclo distinto: debe deshacerse TODA la publicación.
  insert into public.players(id,name,position,current_market_value_cents,active) values(first_conflict,'Compra anterior al fallo','DEF',20000000,true),(conflict_player,'Conflicto controlado','DEF',20000000,true);
  insert into public.market_cycles(id,division_id,opens_at,closes_at,publishes_at,status)
    values(conflict_cycle,di,v_open-interval '1 day',v_close-interval '1 day',v_publish-interval '1 day','calculated');
  insert into public.transfer_operations(division_id,player_id,seller_kind,buyer_kind,amount_cents,kind,status,idempotency_key)
    values(di,conflict_player,'computer','bad_team',20000000,'bad_team_sale','reversed','mercado:equipo-malo:catalogo:'||conflict_cycle||':'||conflict_player);
  select count(*) into before_n from public.transfer_operations;
  begin
    perform app_private.runner_publicar(conflict_cycle);
    raise exception 'Conflicto no rechazado';
  exception when unique_violation then null;end;
  if (select status from public.market_cycles where id=conflict_cycle)<>'calculated' or (select count(*) from public.transfer_operations)<>before_n or exists(select 1 from public.roster_ownership where division_id=di and player_id in (first_conflict,conflict_player)) then raise exception 'Rollback de fallo incompleto';end if;
  if has_function_privilege('anon','app_private.publicar_ciclo(uuid)','EXECUTE') or has_function_privilege('authenticated','app_private.publicar_ciclo(uuid)','EXECUTE') or has_function_privilege('anon','app_private.runner_publicar(uuid)','EXECUTE') or has_function_privilege('authenticated','app_private.runner_publicar(uuid)','EXECUTE') then raise exception 'Permiso público indebido';end if;
  raise notice 'OK: todos Computer libres, primer día y fuera del mercado, límite estricto, inactivo/zero, propietario, otra división, puja, saldo, historial, horario, idempotencia, rollback y permisos.';
end
$test$;
rollback;

-- Volumen estimado de la primera noche: 196 compras sin tocar ningún saldo.
begin;
do $batch$
declare
 co uuid:=gen_random_uuid(); se uuid:=gen_random_uuid(); di uuid:=gen_random_uuid();
 u uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); t uuid:=gen_random_uuid();
 cycle uuid:=gen_random_uuid(); d date:=(clock_timestamp() at time zone 'Europe/Madrid')::date;
 v_open timestamptz:=((d-1)::timestamp+time '06:00') at time zone 'Europe/Madrid';
 v_close timestamptz:=(d::timestamp+time '01:00') at time zone 'Europe/Madrid';
 v_pub timestamptz:=(d::timestamp+time '06:00') at time zone 'Europe/Madrid';
 cur_date timestamptz;cur_id uuid;n int:=0;cnt int;pg record;last_page record;
begin
 if clock_timestamp()<v_pub then
   d:=d-1;
   v_open:=v_open-interval '1 day';v_close:=v_close-interval '1 day';v_pub:=v_pub-interval '1 day';
 end if;
 insert into public.competitions(id,code,name) values(co,'MACROLIGA_PILOTO_INVIERNO_2026','Lote ficticio');
 insert into public.seasons(id,competition_id,code,name,status) values(se,co,'2026_27','Prueba','active');
 insert into public.divisions(id,season_id,code,name) values(di,se,'PILOTO','Prueba');
 insert into app_private.market_runner_divisions(division_id,enabled) values(di,true);
 insert into auth.users(id) values(u);
 insert into public.managers(id,auth_user_id,display_name) values(m,u,'Fixture');
 insert into public.teams(id,division_id,manager_id,team_name,balance_cents) values(t,di,m,'Fixture',1000000000);
 insert into public.players(name,position,current_market_value_cents)
 select 'Lote bajo '||i,'MID',10000000+i from generate_series(1,196) i;
 insert into public.players(name,position,current_market_value_cents)
 select 'Lote alto '||i, (array['GK','DEF','MID','FWD'])[1+(i%4)],75000000+i from generate_series(1,20) i;
 insert into public.market_cycles(id,division_id,opens_at,closes_at,publishes_at,status)
 values(cycle,di,v_open,v_close,v_pub,'open');
 insert into public.market_lots(cycle_id,player_id,minimum_bid_cents,day_number,division_id)
 select cycle,id,current_market_value_cents,1,di from public.players where current_market_value_cents<75000000 order by id limit 15;
 perform app_private.cerrar_calcular_ciclo(cycle);
 perform app_private.runner_publicar(cycle);
 if (select count(*) from public.transfer_operations where division_id=di and kind='bad_team_sale' and status='committed')<>196 or
    (select count(*) from public.roster_ownership where division_id=di and owner_kind='bad_team')<>196 or
    (select count(*) from public.roster_events where division_id=di)<>196 then raise exception 'Lote de 196 incompleto'; end if;
 if (select balance_cents from public.teams where id=t)<>1000000000 or exists(select 1 from public.wallet_entries) then raise exception 'Alteración de saldos sin pujas';end if;
 if app_private.runner_publicar(cycle)<>0 or (select count(*) from public.transfer_operations)<>196 then raise exception 'Duplicado en lote masivo';end if;
 -- La misma consulta de noticias en el cliente, paginada por fecha/ID.
 perform set_config('request.jwt.claim.sub',u::text,true);
 loop
   cnt:=0;
   for pg in select * from public.macroliga_historial_traspasos(di,cur_date,cur_id,50) loop
     if pg.tipo<>'bad_team_sale' or pg.origen<>'Computer' or pg.destino<>'Equipo Malo' then raise exception 'Noticia incorrecta';end if;
     cnt:=cnt+1;cur_date:=pg.fecha;cur_id:=pg.traspaso_id;
   end loop;
   n:=n+cnt;exit when cnt<50;
   if n>196 then raise exception 'Paginación repetida';end if;
 end loop;
 if n<>196 then raise exception 'Noticias incompletas: %',n;end if;
 select x.arrastrados,x.nuevos into pg from app_private.preparar_mercado_diario(di,d) x;
 if pg.arrastrados<>0 or pg.nuevos<>15 then raise exception 'No se prepara el siguiente mercado: %',pg;end if;
 if exists(select 1 from public.market_lots l join public.market_cycles c on c.id=l.cycle_id join public.players p on p.id=l.player_id where c.division_id=di and c.status='draft' and p.current_market_value_cents<75000000) then raise exception 'Se repescó un jugador de Equipo Malo';end if;
 raise notice 'OK: 196 compras, 196 eventos, 196 noticias paginadas, saldos intactos, 15 jugadores siguientes y sin duplicados.';
end
$batch$;
rollback;
