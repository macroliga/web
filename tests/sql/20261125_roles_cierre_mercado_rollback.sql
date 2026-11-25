-- MACROLIGA · Prueba PostgreSQL con rol cliente y dos usuarios ficticios.
-- Solo macroliga-piloto. Todas las filas nuevas se revierten al acabar.
DO $test$
DECLARE
 ua uuid:=gen_random_uuid(); ub uuid:=gen_random_uuid();
 c uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); d uuid:=gen_random_uuid();
 ma uuid:=gen_random_uuid(); mb uuid:=gen_random_uuid();
 ta uuid:=gen_random_uuid(); tb uuid:=gen_random_uuid();
 player uuid:=gen_random_uuid(); cycle uuid:=gen_random_uuid();
 lot uuid:=gen_random_uuid(); ba uuid; bb uuid; n integer;
BEGIN
 insert into auth.users(id,email,aud,role) values
  (ua,'a-'||ua||'@example.invalid','authenticated','authenticated'),
  (ub,'b-'||ub||'@example.invalid','authenticated','authenticated');
 insert into public.competitions(id,code,name) values(c,'test-'||c,'Aislamiento');
 insert into public.seasons(id,competition_id,code,name) values(s,c,'test','Prueba');
 insert into public.divisions(id,season_id,code,name) values(d,s,'test','Prueba');
 insert into public.managers(id,auth_user_id,display_name) values
  (ma,ua,'Manager A ficticio'),(mb,ub,'Manager B ficticio');
 insert into public.teams(id,division_id,manager_id,team_name,balance_cents) values
  (ta,d,ma,'A',1000000000),(tb,d,mb,'B',1000000000);
 insert into public.wallet_entries(team_id,operation_key,kind,delta_cents) values
  (ta,'prueba-'||ta,'initial',1000000000),(tb,'prueba-'||tb,'initial',1000000000);
 insert into public.players(id,name,position,current_market_value_cents) values
  (player,'Ficticio','DEF',100000000);
 insert into public.market_cycles(id,division_id,opens_at,closes_at,publishes_at,status)
  values(cycle,d,now()-interval '10 minutes',now()+interval '10 minutes',
    now()+interval '20 minutes','open');
 insert into public.market_lots(id,cycle_id,player_id,minimum_bid_cents,division_id)
  values(lot,cycle,player,1000000,d);

 execute 'SET LOCAL ROLE authenticated';
 perform pg_catalog.set_config('request.jwt.claim.sub',ua::text,true);
 ba:=public.macroliga_presentar_puja(lot,100000000);
 if ba is null or (select count(*) from public.macroliga_mis_pujas())<>1 then
  raise exception 'Puja A no registrada o no visible';
 end if;
 begin
  execute 'select count(*) from public.bids' into n;
  raise exception 'TEST: lectura directa de pujas';
 exception when insufficient_privilege then null;
 end;
 perform pg_catalog.set_config('request.jwt.claim.sub',ub::text,true);
 if (select count(*) from public.macroliga_mis_pujas())<>0 then
  raise exception 'Manager B ve oferta de A';
 end if;
 begin
  perform public.macroliga_retirar_puja(ba);
  raise exception 'TEST: retirada ajena';
 exception when insufficient_privilege then null;
 end;
 bb:=public.macroliga_presentar_puja(lot,120000000);
 if (select count(*) from public.macroliga_mis_pujas())<>1 then
  raise exception 'Manager B ve pujas de otro manager';
 end if;
 begin
  perform app_private.cerrar_calcular_ciclo(cycle);
  raise exception 'TEST: función privada accesible';
 exception when insufficient_privilege then null;
 end;
 execute 'RESET ROLE';

 begin
  perform app_private.cerrar_calcular_ciclo(cycle);
  raise exception 'TEST: cierre anticipado';
 exception when others then
  if SQLERRM not like 'No ha llegado la hora de cierre%' then raise; end if;
 end;
 update public.bids set accepted_at=now()-interval '7 minutes'
  where id in (ba,bb);
 update public.market_cycles set closes_at=now()-interval '5 minutes',
  publishes_at=now()+interval '5 minutes' where id=cycle;
 if app_private.cerrar_calcular_ciclo(cycle)<>1
    or (select bid_id from app_private.market_winners where lot_id=lot)<>bb then
  raise exception 'Ganador congelado incorrecto';
 end if;
 if app_private.cerrar_calcular_ciclo(cycle)<>0 then
  raise exception 'Cierre duplicado';
 end if;

 execute 'SET LOCAL ROLE authenticated';
 perform pg_catalog.set_config('request.jwt.claim.sub',ua::text,true);
 begin
  perform public.macroliga_retirar_puja(ba);
  raise exception 'TEST: retirada después del cierre';
 exception when others then
  if SQLERRM not like 'No se puede retirar esta puja%' then raise; end if;
 end;
 begin
  execute 'select count(*) from app_private.market_winners' into n;
  raise exception 'TEST: ganador privado visible';
 exception when insufficient_privilege then null;
 end;
 execute 'RESET ROLE';

 update public.bids set amount_cents=50000000 where id=bb;
 update public.market_cycles set publishes_at=now()-interval '1 minute'
  where id=cycle;
 begin
  perform app_private.publicar_ciclo(cycle);
  raise exception 'TEST: aceptó cambio posterior de puja ganadora';
 exception when others then
  if SQLERRM not like 'Instantánea de ganador inconsistente%' then raise; end if;
 end;
 if (select status from public.market_cycles where id=cycle)<>'calculated' then
  raise exception 'Publicación parcialmente realizada';
 end if;
 update public.bids set amount_cents=120000000 where id=bb;
 if app_private.publicar_ciclo(cycle)<>1 then raise exception 'Fallo de publicación'; end if;
 if (select balance_cents from public.teams where id=tb)<>880000000 then
  raise exception 'Saldo incorrecto';
 end if;
 if app_private.publicar_ciclo(cycle)<>0 then raise exception 'Doble publicación'; end if;
 raise exception '__MACROLIGA_TEST_OK_ROLLBACK__';
EXCEPTION WHEN OTHERS THEN
 execute 'RESET ROLE';
 if SQLERRM='__MACROLIGA_TEST_OK_ROLLBACK__' then
   raise notice 'Seguridad y cierre OK: revertidos los usuarios ficticios';
 else
   raise;
 end if;
END $test$;