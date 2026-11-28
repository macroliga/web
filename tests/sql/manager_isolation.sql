-- LOCAL DISPOSABLE MACROLIGA DATABASE ONLY. psql -X -v ON_ERROR_STOP=1
-- Apply proposal separately in the disposable database before this test.
-- Never run against hosted projects or Comunio Laviana.
begin;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003');
insert into public.competitions(id,code,name) values ('00000000-0000-4000-8000-000000000010','test-manager-security','Test');
insert into public.seasons(id,competition_id,code,name) values ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000010','test','Test');
insert into public.divisions(id,season_id,code,name) values ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000011','a','A'),('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000011','b','B');
insert into public.managers(id,auth_user_id,display_name) values ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001','A'),('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000002','B');
insert into public.teams(id,division_id,manager_id,team_name,balance_cents) values ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000021','A1',-100),('00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000021','A2',0),('00000000-0000-4000-8000-000000000033','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000022','B1',500);
insert into public.players(id,name,position,current_market_value_cents) values ('00000000-0000-4000-8000-000000000041','Test A','GK',1000),('00000000-0000-4000-8000-000000000042','Test B','MID',2000);
insert into public.roster_ownership(division_id,player_id,owner_kind,team_id) values ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000041','team','00000000-0000-4000-8000-000000000031'),('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000042','team','00000000-0000-4000-8000-000000000033');
insert into public.market_cycles(id,division_id,opens_at,closes_at,publishes_at,status) values
 ('00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000012',now()-interval '1 hour',now()+interval '1 hour',now()+interval '2 hours','open'),
 ('00000000-0000-4000-8000-000000000052','00000000-0000-4000-8000-000000000013',now()-interval '1 hour',now()+interval '1 hour',now()+interval '2 hours','open');
insert into public.market_lots(cycle_id,player_id,minimum_bid_cents,division_id) values
 ('00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000041',1000,'00000000-0000-4000-8000-000000000012'),
 ('00000000-0000-4000-8000-000000000052','00000000-0000-4000-8000-000000000042',2000,'00000000-0000-4000-8000-000000000013');
do $$ begin
 if has_function_privilege('anon','public.macroliga_mi_mercado(uuid)','EXECUTE') then raise exception 'anon market grant'; end if;
 if has_function_privilege('anon','public.macroliga_mis_equipos()','EXECUTE') or has_function_privilege('anon','public.macroliga_mi_plantilla(uuid)','EXECUTE') then raise exception 'anon RPC grant'; end if;
 if not has_function_privilege('authenticated','public.macroliga_mis_equipos()','EXECUTE') or not has_function_privilege('authenticated','public.macroliga_mi_plantilla(uuid)','EXECUTE') then raise exception 'missing authenticated grant'; end if;
 begin
 insert into public.roster_ownership(division_id,player_id,owner_kind,team_id) values ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000041','team','00000000-0000-4000-8000-000000000031');
 raise exception 'cross division accepted';
 exception when foreign_key_violation then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.macroliga_mi_mercado('00000000-0000-4000-8000-000000000031')) <> 1 or not exists(select 1 from public.macroliga_mi_mercado('00000000-0000-4000-8000-000000000031') where jugador_id='00000000-0000-4000-8000-000000000041') then raise exception 'market division leak'; end if;
 if exists(select 1 from public.macroliga_mi_mercado('00000000-0000-4000-8000-000000000033')) then raise exception 'foreign team market'; end if;
 if (select count(*) from public.macroliga_mis_equipos()) <> 2 then raise exception 'A team count'; end if;
 if not exists(select 1 from public.macroliga_mis_equipos() where equipo_id='00000000-0000-4000-8000-000000000031' and saldo_centimos=-100 and valor_plantilla_centimos=1000 and plazas_ocupadas=1) then raise exception 'A balance or roster'; end if;
 if not exists(select 1 from public.macroliga_mis_equipos() where equipo_id='00000000-0000-4000-8000-000000000032' and valor_plantilla_centimos=0 and plazas_ocupadas=0) then raise exception 'empty team'; end if;
 if exists(select 1 from public.macroliga_mis_equipos() where equipo_id='00000000-0000-4000-8000-000000000033') or exists(select 1 from public.macroliga_mi_plantilla('00000000-0000-4000-8000-000000000033')) then raise exception 'B data leak'; end if;
 if (select count(*) from public.macroliga_mi_plantilla('00000000-0000-4000-8000-000000000031')) <> 1 or not exists(select 1 from public.macroliga_mi_plantilla('00000000-0000-4000-8000-000000000031') where jugador_id='00000000-0000-4000-8000-000000000041') then raise exception 'A roster'; end if;
 if exists(select 1 from public.macroliga_mi_plantilla('00000000-0000-4000-8000-000000000032')) then raise exception 'empty roster'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.macroliga_mi_mercado('00000000-0000-4000-8000-000000000032')) then raise exception 'foreign division market'; end if;
 if (select count(*) from public.macroliga_mis_equipos()) <> 1 or not exists(select 1 from public.macroliga_mis_equipos() where equipo_id='00000000-0000-4000-8000-000000000033') then raise exception 'B team'; end if;
 if exists(select 1 from public.macroliga_mi_plantilla('00000000-0000-4000-8000-000000000031')) or exists(select 1 from public.macroliga_mi_plantilla('00000000-0000-4000-8000-000000000032')) then raise exception 'A data leak'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.macroliga_mis_equipos()) or exists(select 1 from public.macroliga_mi_plantilla('00000000-0000-4000-8000-000000000031')) then raise exception 'unlinked identity leak'; end if;
end $$;
-- Verify effective direct-table denial, not just RPC filtering.
do $$
declare rel text;
begin
 foreach rel in array array['teams','managers','roster_ownership','players','divisions'] loop
  begin
   execute format('select 1 from public.%I limit 1',rel);
   raise exception 'authenticated direct read unexpectedly allowed: %',rel;
  exception when insufficient_privilege then null;
  end;
 end loop;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$
declare rel text;
begin
 foreach rel in array array['teams','managers','roster_ownership','players','divisions'] loop
  begin
   execute format('select 1 from public.%I limit 1',rel);
   raise exception 'anon direct read unexpectedly allowed: %',rel;
  exception when insufficient_privilege then null;
  end;
 end loop;
 begin
  perform 1 from public.macroliga_mis_equipos();
  raise exception 'anon team RPC unexpectedly allowed';
 exception when insufficient_privilege then null;
 end;
 begin
  perform 1 from public.macroliga_mi_plantilla('00000000-0000-4000-8000-000000000031');
  raise exception 'anon roster RPC unexpectedly allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
do $$
begin
 if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('teams','managers','roster_ownership','players','divisions') and c.relrowsecurity) <> 5 then
 raise exception 'RLS missing on protected table';
 end if;
end $$;
rollback;
do $$ begin
 if exists(select 1 from auth.users where id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003')) or exists(select 1 from public.competitions where id='00000000-0000-4000-8000-000000000010') then
 raise exception 'fixture rollback failed';
 end if;
end $$;
select 'manager isolation and rollback assertions passed' as result;
