-- SOLO POSTGRES DESECHABLE. Ejecutar con psql -X -v ON_ERROR_STOP=1
-- tras aplicar el borrador y las migraciones reales. Nunca ejecutar en Supabase alojado.
begin;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003');
insert into public.competitions(id,code,name) values ('00000000-0000-4000-8000-000000000010','test-manager-security','Test');
insert into public.seasons(id,competition_id,code,name) values ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000010','test','Test');
insert into public.divisions(id,season_id,code,name) values ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000011','a','A'),('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000011','b','B');
insert into public.managers(id,auth_user_id,display_name) values ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001','A'),('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000002','B');
insert into public.teams(id,division_id,manager_id,team_name,balance_cents) values
 ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000021','A1',100000000),
 ('00000000-0000-4000-8000-000000000033','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000022','B1',0);
insert into public.players(id,name,position,current_market_value_cents) values
 ('00000000-0000-4000-8000-000000000041','Futbolista A','GK',16000000),
 ('00000000-0000-4000-8000-000000000042','Futbolista B','MID',18000000),
 ('00000000-0000-4000-8000-000000000043','Futbolista C','DEF',16000000);
insert into public.roster_ownership(division_id,player_id,owner_kind,team_id) values
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000041','bad_team',null),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000042','bad_team',null),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000043','bad_team',null);

do $$
declare t text;
begin
 foreach t in array array['teams','roster_ownership','wallet_entries','transfer_operations','clause_rules','clause_windows','bids','players'] loop
   if not (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t) then
     raise exception 'RLS ausente: %',t;
   end if;
   if has_table_privilege('authenticated','public.'||t,'select,insert,update,delete') or has_table_privilege('anon','public.'||t,'select,insert,update,delete') then
     raise exception 'Acceso directo a tabla: %',t;
   end if;
 end loop;
end $$;
set local role anon;
do $$ begin
 begin
   perform public.macroliga_cotizar_clausula_equipo_malo('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000041');
   raise exception 'Anon obtuvo cotización';
 exception when insufficient_privilege then null; end;
 begin
   perform public.macroliga_pagar_clausula_equipo_malo('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000041',62400000,'00000000-0000-4000-8000-000000000099');
   raise exception 'Anon pudo pagar';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.macroliga_pagar_clausula_equipo_malo(uuid,uuid,bigint,uuid)','EXECUTE') or
    has_function_privilege('anon','public.macroliga_cotizar_clausula_equipo_malo(uuid,uuid)','EXECUTE') or
    has_function_privilege('service_role','public.macroliga_pagar_clausula_equipo_malo(uuid,uuid,bigint,uuid)','EXECUTE') or
    has_function_privilege('macroliga_runner','public.macroliga_pagar_clausula_equipo_malo(uuid,uuid,bigint,uuid)','EXECUTE') or
    has_function_privilege('authenticated','app_private._contabilizar_traspaso(uuid,uuid,uuid,uuid,text,text,bigint,text,text)','EXECUTE')
 then raise exception 'RPC/función contable expuesta'; end if;
 if not has_function_privilege('authenticated','public.macroliga_pagar_clausula_equipo_malo(uuid,uuid,bigint,uuid)','EXECUTE') then raise exception 'RPC no accesible al manager'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

do $$ begin
 if public.macroliga_cotizar_clausula_equipo_malo('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000041')->>'disponible' is distinct from 'false' then raise exception 'Permite pago sin regla'; end if;
 begin
   perform public.macroliga_pagar_clausula_equipo_malo('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000041',62400000,'00000000-0000-4000-8000-000000000099');
   raise exception 'Pago sin regla';
 exception when invalid_parameter_value then null; end;
 begin
   perform public.macroliga_cotizar_clausula_equipo_malo('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000041');
   raise exception 'División ajena';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.clause_rules(season_id,from_value_cents,to_value_cents,multiplier,source_ref,version)
 values ('00000000-0000-4000-8000-000000000011',16000000,34999999,3.9,'fixture tramo',1);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

do $$ begin
 if public.macroliga_cotizar_clausula_equipo_malo('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000041')->>'disponible' is distinct from 'false' then raise exception 'Ventana cerrada'; end if;
 begin
   perform public.macroliga_pagar_clausula_equipo_malo('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000041',62400000,'00000000-0000-4000-8000-000000000099');
   raise exception 'Pago en ventana cerrada';
 exception when invalid_parameter_value then null; end;
end $$;
reset role;
insert into public.clause_windows(division_id,opens_at,closes_at,reason)
 values ('00000000-0000-4000-8000-000000000012',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour','fixture');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

do $$ declare v_first uuid; begin
 if public.macroliga_cotizar_clausula_equipo_malo('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000041')->>'importe_centimos' is distinct from '62400000' then raise exception 'Precio incorrecto'; end if;
 if public.macroliga_cotizar_clausula_equipo_malo('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000042')->>'importe_centimos' is distinct from '70200000' then raise exception 'Tramo intermedio incorrecto'; end if;
 begin
   perform public.macroliga_pagar_clausula_equipo_malo('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000041',1,'00000000-0000-4000-8000-000000000099');
   raise exception 'Precio manipulado';
 exception when invalid_parameter_value then null; end;
 v_first:=public.macroliga_pagar_clausula_equipo_malo('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000041',62400000,'00000000-0000-4000-8000-000000000099');
 if v_first is distinct from public.macroliga_pagar_clausula_equipo_malo('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000041',62400000,'00000000-0000-4000-8000-000000000099') then raise exception 'Repetición cobrada dos veces'; end if;
 begin
   perform public.macroliga_pagar_clausula_equipo_malo('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000042',70200000,'00000000-0000-4000-8000-000000000099');
   raise exception 'Clave reutilizada con otro jugador';
 exception when unique_violation then null; end;
 begin
   perform public.macroliga_pagar_clausula_equipo_malo('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000043',62400000,'00000000-0000-4000-8000-000000000098');
   raise exception 'Sin margen económico';
 exception when invalid_parameter_value then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);

do $$ begin
 begin
   perform public.macroliga_pagar_clausula_equipo_malo('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000041',62400000,'00000000-0000-4000-8000-000000000099');
   raise exception 'Otro manager puede reutilizar confirmación';
 exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ begin
 if (select balance_cents from public.teams where id='00000000-0000-4000-8000-000000000031')<>37600000 then raise exception 'Cargo erróneo'; end if;
 if (select count(*) from public.transfer_operations where division_id='00000000-0000-4000-8000-000000000012' and kind='bad_team_clause' and status='committed')<>1 then raise exception 'Traspaso duplicado o ausente'; end if;
 if not exists(select 1 from public.roster_ownership where division_id='00000000-0000-4000-8000-000000000012' and player_id='00000000-0000-4000-8000-000000000041' and owner_kind='team' and team_id='00000000-0000-4000-8000-000000000031') then raise exception 'No se entregó jugador'; end if;
 if not exists(select 1 from public.roster_ownership where division_id='00000000-0000-4000-8000-000000000012' and player_id='00000000-0000-4000-8000-000000000043' and owner_kind='bad_team') then raise exception 'Fichaje sin fondos'; end if;
 if (select count(*) from public.wallet_entries where team_id='00000000-0000-4000-8000-000000000031' and delta_cents=-62400000)<>1 then raise exception 'Asiento incorrecto'; end if;
end $$;
rollback;
do $$ begin
 if exists(select 1 from public.competitions where id='00000000-0000-4000-8000-000000000010') or exists(select 1 from auth.users where id='00000000-0000-4000-8000-000000000001') or exists(select 1 from public.transfer_operations where division_id='00000000-0000-4000-8000-000000000012') then raise exception 'Rollback de fixtures falló'; end if;
end $$;
select 'clausulas equipo malo local: passed' as result;
