-- MACROLIGA · Desempate y máximo de 15 lotes. PostgreSQL real.
-- Solo macroliga-piloto; bloque de prueba sin registros persistentes.
DO $test$
DECLARE
 u1 uuid:=gen_random_uuid();u2 uuid:=gen_random_uuid();
 c uuid:=gen_random_uuid();s uuid:=gen_random_uuid();d uuid:=gen_random_uuid();
 m1 uuid:=gen_random_uuid();m2 uuid:=gen_random_uuid();
 t1 uuid:=gen_random_uuid();t2 uuid:=gen_random_uuid();
 cy uuid:=gen_random_uuid();cy16 uuid:=gen_random_uuid();
 pl uuid:=gen_random_uuid();lot uuid:=gen_random_uuid();
 b1 uuid:=gen_random_uuid();b2 uuid:=gen_random_uuid();
 aid bigint;bid bigint;p uuid;i integer;
BEGIN
 insert into auth.users(id,email,aud,role) values
  (u1,'tie-1-'||u1||'@example.invalid','authenticated','authenticated'),
  (u2,'tie-2-'||u2||'@example.invalid','authenticated','authenticated');
 insert into public.competitions(id,code,name) values(c,'tie-'||c,'Empate de prueba');
 insert into public.seasons(id,competition_id,code,name) values(s,c,'test','Temporada de prueba');
 insert into public.divisions(id,season_id,code,name) values(d,s,'test','División de prueba');
 insert into public.managers(id,auth_user_id,display_name) values
  (m1,u1,'Primero ficticio'),(m2,u2,'Segundo ficticio');
 insert into public.teams(id,division_id,manager_id,team_name,balance_cents) values
  (t1,d,m1,'Primero',1000000000),(t2,d,m2,'Segundo',1000000000);
 insert into public.wallet_entries(team_id,operation_key,kind,delta_cents) values
  (t1,'inicio-'||t1,'initial',1000000000),(t2,'inicio-'||t2,'initial',1000000000);
 insert into public.players(id,name,position,current_market_value_cents)
  values(pl,'Empate ficticio','GK',200000000);
 insert into public.market_cycles(id,division_id,opens_at,closes_at,publishes_at,status)
  values(cy,d,now()-interval '3 hours',now()-interval '2 hours',
    now()-interval '1 hour','open');
 insert into public.market_lots(id,cycle_id,player_id,minimum_bid_cents,division_id)
  values(lot,cy,pl,1000000,d);
 insert into public.bids(id,lot_id,team_id,division_id,amount_cents,accepted_at,status)
  values(b1,lot,t1,d,130000000,now()-interval '150 minutes','active');
 insert into public.bids(id,lot_id,team_id,division_id,amount_cents,accepted_at,status)
  values(b2,lot,t2,d,130000000,now()-interval '150 minutes','active');
 select submission_order into aid from public.bids where id=b1;
 select submission_order into bid from public.bids where id=b2;
 if aid>=bid then raise exception 'Orden de recepción no monotónico'; end if;
 if app_private.cerrar_calcular_ciclo(cy)<>1 then
  raise exception 'Cierre no produjo exactamente un ganador';
 end if;
 if (select bid_id from app_private.market_winners where lot_id=lot)<>b1 then
  raise exception 'Empate no respetó secuencia del servidor';
 end if;
 if app_private.publicar_ciclo(cy)<>1 then raise exception 'No publicó empate'; end if;
 if (select owner_kind from public.roster_ownership
     where division_id=d and player_id=pl)<>'team'
    or (select team_id from public.roster_ownership
     where division_id=d and player_id=pl)<>t1 then
  raise exception 'Ganador del empate incorrecto';
 end if;

 insert into public.market_cycles(id,division_id,opens_at,closes_at,publishes_at,status)
  values(cy16,d,now()-interval '5 hours',now()-interval '4 hours',
    now()-interval '3 hours','open');
 for i in 1..16 loop
  insert into public.players(name,position,current_market_value_cents)
   values('Lote extra '||i,'MID',100000000) returning id into p;
  insert into public.market_lots(cycle_id,player_id,minimum_bid_cents,division_id)
   values(cy16,p,1000000,d);
 end loop;
 begin
  perform app_private.cerrar_calcular_ciclo(cy16);
  raise exception 'TEST: se aceptaron más de 15 lotes';
 exception when others then
  if SQLERRM not like 'El ciclo tiene más de 15 futbolistas%' then raise; end if;
 end;
 if (select status from public.market_cycles where id=cy16)<>'open' then
   raise exception 'Ciclo inválido cambió de estado';
 end if;
 raise exception '__MACROLIGA_TIE_15_OK_ROLLBACK__';
EXCEPTION WHEN OTHERS THEN
 if SQLERRM='__MACROLIGA_TIE_15_OK_ROLLBACK__' then
   raise notice 'Empate por secuencia y tope de lotes correctos; ensayo revertido';
 else
   raise;
 end if;
END $test$;