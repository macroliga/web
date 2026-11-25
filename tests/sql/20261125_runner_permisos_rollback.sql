-- MACROLIGA: prueba de rol técnico real con SET ROLE (sin credenciales).
-- Todos los datos ficticios, lista blanca y ciclos se revierten al finalizar.
-- Ejecutar SOLO en Supabase macroliga-piloto.
-- La conexión administrativa necesita permiso temporal SET ROLE solo durante
-- este ensayo. BEGIN/ROLLBACK evitan dejar membresías, divisiones o usuarios.
begin;
grant macroliga_runner to postgres with set true, inherit false;

DO $probe$
DECLARE
 v_comp uuid:=gen_random_uuid();
 v_season uuid:=gen_random_uuid();
 v_allowed uuid:=gen_random_uuid();
 v_forbidden uuid:=gen_random_uuid();
 v_cycle uuid;
 v_cycle_forbidden uuid:=gen_random_uuid();
 v_date date:=(pg_catalog.clock_timestamp() at time zone 'Europe/Madrid')::date;
 v_now timestamptz;
 v_count integer;
 v_new integer;
BEGIN
  if not exists(
    select 1 from pg_roles r where r.rolname='macroliga_runner'
    and not r.rolcanlogin and not r.rolsuper
    and not r.rolcreatedb and not r.rolcreaterole
    and not r.rolbypassrls and not r.rolreplication
  ) then
    raise exception 'El rol técnico no cumple los privilegios mínimos';
  end if;

  execute 'SET LOCAL ROLE macroliga_runner';
  if current_user<>'macroliga_runner' then
    raise exception 'No fue posible probar como rol técnico';
  end if;
  v_now:=app_private.runner_hora_servidor();
  if v_now is null then raise exception 'Reloj técnico inaccesible'; end if;
  begin
    perform app_private.runner_division(gen_random_uuid());
    raise exception 'TEST: la división no permitida fue visible';
  exception when insufficient_privilege then null;
  end;
  begin
    perform app_private.runner_preparar(gen_random_uuid(),v_date);
    raise exception 'TEST: preparó división no permitida';
  exception when insufficient_privilege then null;
  end;
  begin
    perform app_private.preparar_mercado_diario(gen_random_uuid(),v_date);
    raise exception 'TEST: pudo ejecutar función interna directamente';
  exception when insufficient_privilege then null;
  end;
  begin
    perform app_private.cerrar_calcular_ciclo(gen_random_uuid());
    raise exception 'TEST: pudo ejecutar cierre interno';
  exception when insufficient_privilege then null;
  end;
  begin
    execute 'select count(*) from public.market_cycles' into v_count;
    raise exception 'TEST: pudo leer tabla del mercado';
  exception when insufficient_privilege then null;
  end;
  begin
    execute 'select count(*) from app_private.market_runner_divisions' into v_count;
    raise exception 'TEST: pudo leer o enumerar la lista blanca';
  exception when insufficient_privilege then null;
  end;
  execute 'RESET ROLE';

  insert into public.competitions(id,code,name)
   values(v_comp,'runner-'||v_comp,'Competición de prueba');
  insert into public.seasons(id,competition_id,code,name,status)
   values(v_season,v_comp,'invierno','Temporada de prueba','active');
  insert into public.divisions(id,season_id,code,name)
   values(v_allowed,v_season,'a','División permitida'),
         (v_forbidden,v_season,'b','División prohibida');
  insert into app_private.market_runner_divisions(division_id,enabled)
   values(v_allowed,true),(v_forbidden,false);

  insert into public.market_cycles(
    id,division_id,opens_at,closes_at,publishes_at,status)
   values(v_cycle_forbidden,v_forbidden,now()-interval '2 hours',
     now()+interval '3 hours',now()+interval '8 hours','draft');

  execute 'SET LOCAL ROLE macroliga_runner';
  if (select count(*) from app_private.runner_division(v_allowed))<>1 then
    raise exception 'No pudo leer división permitida';
  end if;
  if (select count(*) from app_private.runner_ciclos(v_allowed))<>0 then
    raise exception 'Ciclos ficticios iniciales inesperados';
  end if;
  begin
    perform app_private.runner_ciclos(v_forbidden);
    raise exception 'TEST: vio división deshabilitada';
  exception when insufficient_privilege then null;
  end;
  begin
    perform app_private.runner_abrir(v_cycle_forbidden);
    raise exception 'TEST: pudo abrir el mercado de división no permitida';
  exception when insufficient_privilege then null;
  end;

  select ciclo_id,arrastrados,nuevos
   into v_cycle,v_count,v_new
    from app_private.runner_preparar(v_allowed,v_date);
  -- La selección está vacía: el rol puede preparar sin inventar futbolistas.
  if v_cycle is null or v_count<>0 then
    raise exception 'Preparación autorizada falló';
  end if;
  if (select count(*) from app_private.runner_ciclos(v_allowed))<>1 then
    raise exception 'Consulta de ciclos autorizados falló';
  end if;
  if (select ciclo_id from app_private.runner_preparar(v_allowed,v_date))<>v_cycle then
    raise exception 'Repetición creó un segundo ciclo';
  end if;
  begin
    perform app_private.runner_cerrar(v_cycle);
    raise exception 'TEST: cierre prematuro del ciclo';
  exception when others then
    if SQLERRM not like 'Ciclo no preparado para el cierre%'
       and SQLERRM not like 'No ha llegado la hora de cierre%' then raise; end if;
  end;
  execute 'RESET ROLE';

  -- Deshabilitar la división no puede permitir operaciones en ejecución.
  update app_private.market_runner_divisions set enabled=false
   where division_id=v_allowed;
  execute 'SET LOCAL ROLE macroliga_runner';
  begin
    perform app_private.runner_ciclos(v_allowed);
    raise exception 'TEST: siguió leyendo la división desactivada';
  exception when insufficient_privilege then null;
  end;
  execute 'RESET ROLE';

  raise exception '__MACROLIGA_RUNNER_TESTS_OK_ROLLBACK__';
EXCEPTION WHEN OTHERS THEN
  execute 'RESET ROLE';
  if SQLERRM='__MACROLIGA_RUNNER_TESTS_OK_ROLLBACK__' then
    raise notice 'OK: 7 funciones autorizadas, rol técnico sin acceso a tablas, lista blanca controlada y pruebas revertidas';
  else
    raise;
  end if;
END $probe$;
rollback;
