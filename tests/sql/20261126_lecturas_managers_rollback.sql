-- MACROLIGA: ensayo reversible de lectura con 3 identidades ficticias.
-- El error centinela revierte todas las filas introducidas en este bloque.
DO $test$
DECLARE
  ua uuid:=gen_random_uuid(); ub uuid:=gen_random_uuid(); uc uuid:=gen_random_uuid();
  c uuid:=gen_random_uuid(); s uuid:=gen_random_uuid();
  d1 uuid:=gen_random_uuid(); d2 uuid:=gen_random_uuid();
  ma uuid:=gen_random_uuid(); mb uuid:=gen_random_uuid(); mc uuid:=gen_random_uuid();
  ta uuid:=gen_random_uuid(); tb uuid:=gen_random_uuid(); tc uuid:=gen_random_uuid();
  p1 uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid();
  n integer; v record;
BEGIN
  insert into auth.users(id,email,aud,role) values
    (ua,'test-a-'||ua||'@example.invalid','authenticated','authenticated'),
    (ub,'test-b-'||ub||'@example.invalid','authenticated','authenticated'),
    (uc,'test-c-'||uc||'@example.invalid','authenticated','authenticated');
  insert into public.competitions(id,code,name) values (c,'test-'||c,'Solo ensayo');
  insert into public.seasons(id,competition_id,code,name) values (s,c,'piloto','Solo ensayo');
  insert into public.divisions(id,season_id,code,name) values
    (d1,s,'uno','Division uno'),(d2,s,'dos','Division dos');
  insert into public.managers(id,auth_user_id,display_name) values
    (ma,ua,'Manager A ficticio'),(mb,ub,'Manager B ficticio'),(mc,uc,'Manager C ficticio');
  insert into public.teams(id,division_id,manager_id,team_name,balance_cents) values
    (ta,d1,ma,'Equipo A',500000000),(tb,d1,mb,'Equipo B',250000000),
    (tc,d2,mc,'Equipo C',100000000);
  insert into public.wallet_entries(team_id,operation_key,kind,delta_cents) values
    (ta,'test-inicial-'||ta,'initial',500000000),
    (tb,'test-inicial-'||tb,'initial',250000000),
    (tc,'test-inicial-'||tc,'initial',100000000);
  insert into public.players(id,name,position,current_market_value_cents) values
    (p1,'Futbolista Uno','DEF',400000000),
    (p2,'Futbolista Dos','MED',100000000);
  insert into public.roster_ownership(division_id,player_id,owner_kind,team_id) values
    (d1,p1,'team',ta),(d2,p2,'team',tc);

  execute 'SET LOCAL ROLE authenticated';
  perform pg_catalog.set_config('request.jwt.claim.sub',ua::text,true);
  select * into v from public.macroliga_mi_equipo();
  if v.equipo_id is distinct from ta or v.saldo_centimos<>500000000
    or v.jugadores<>1 or v.valor_plantilla_centimos<>400000000
    or v.limite_economico_centimos<>600000000 or v.plazas_para_pujar<>15 then
    raise exception 'TEST: calculo de mi equipo incorrecto';
  end if;
  if (select count(*) from public.macroliga_mi_equipo())<>1 then
    raise exception 'TEST: perfil muestra otros equipos';
  end if;
  if (select count(*) from public.macroliga_plantilla_equipo(tb))<>0 then
    raise exception 'TEST: plantilla B inesperada';
  end if;
  if (select count(*) from public.macroliga_plantilla_equipo(ta))<>1 then
    raise exception 'TEST: plantilla propia incompleta';
  end if;
  begin
    perform public.macroliga_plantilla_equipo(tc);
    raise exception 'TEST: permitio leer otra division';
  exception when insufficient_privilege then null;
  end;
  perform pg_catalog.set_config('request.jwt.claim.sub',ub::text,true);
  if (select count(*) from public.macroliga_plantilla_equipo(ta))<>1 then
    raise exception 'TEST: B no ve plantilla publica de rival';
  end if;
  if (select count(*) from public.macroliga_mi_equipo())<>1 then
    raise exception 'TEST: B no tiene un perfil';
  end if;
  select * into v from public.macroliga_mi_equipo();
  if v.equipo_id is distinct from tb or v.saldo_centimos<>250000000 then
    raise exception 'TEST: B ve otro saldo';
  end if;
  begin
    execute 'select count(*) from public.wallet_entries' into n;
    if n>0 then raise exception 'TEST: B accede a movimientos privados'; end if;
  exception when insufficient_privilege then null;
  end;

  execute 'SET LOCAL ROLE anon';
  perform pg_catalog.set_config('request.jwt.claim.sub','',true);
  begin
    perform public.macroliga_mi_equipo();
    raise exception 'TEST: anon ejecuta funcion privada';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.macroliga_plantilla_equipo(ta);
    raise exception 'TEST: anon lee plantilla';
  exception when insufficient_privilege then null;
  end;
  execute 'RESET ROLE';
  raise exception '__MACROLIGA_LECTURAS_OK_ROLLBACK__';
EXCEPTION WHEN OTHERS THEN
  execute 'RESET ROLE';
  if SQLERRM = '__MACROLIGA_LECTURAS_OK_ROLLBACK__' then
    raise notice 'Lecturas seguras: pruebas superadas y datos ficticios revertidos';
  else
    raise;
  end if;
END $test$;
