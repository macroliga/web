-- MACROLIGA PILOTO 0010: cuenta técnica y puertas privadas del ejecutor.
-- ÚNICO DESTINO: Supabase 'macroliga-piloto' (xuwjbfnhvvbdargcohfe).
-- No utilizar NUNCA en Supabase Comunio Laviana.
-- Por diseño NOLOGIN / SIN CONTRASEÑA: aún no puede conectarse al servidor.
-- Ningún cron, secreto, manager, división ni mercado se crea o activa aquí.
begin;

create role macroliga_runner
  nologin nosuperuser nocreatedb nocreaterole noinherit
  noreplication nobypassrls;
grant usage on schema app_private to macroliga_runner;

-- Lista blanca vacía; solo una autorización administrativa posterior
-- puede insertar divisiones habilitadas. La conexión técnica no puede editarla.
create table app_private.market_runner_divisions (
  division_id uuid primary key references public.divisions(id) on delete restrict,
  enabled boolean not null default false,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
revoke all on app_private.market_runner_divisions
  from public,anon,authenticated,service_role,macroliga_runner;

-- Comprobación hecha en PostgreSQL (no solo en el programa Node).
create function app_private._runner_exigir_division(p_division_id uuid)
returns void
language plpgsql security definer set search_path=''
as $$
begin
  if p_division_id is null or not exists (
    select 1 from app_private.market_runner_divisions a
    join public.divisions d on d.id=a.division_id
    join public.seasons s on s.id=d.season_id
    where a.division_id=p_division_id and a.enabled
      and s.status='active' and d.timezone='Europe/Madrid'
  ) then
    raise exception 'División no habilitada para el ejecutor'
      using errcode='42501';
  end if;
end;
$$;
revoke all on function app_private._runner_exigir_division(uuid)
  from public,anon,authenticated,service_role,macroliga_runner;

create function app_private.runner_hora_servidor()
returns timestamptz
language sql volatile security definer set search_path=''
as $$
  select pg_catalog.clock_timestamp();
$$;

create function app_private.runner_division(p_division_id uuid)
returns table(id uuid,timezone text,season_status text)
language plpgsql stable security definer set search_path=''
as $$
begin
  perform app_private._runner_exigir_division(p_division_id);
  return query
    select d.id,d.timezone,s.status
      from public.divisions d join public.seasons s on s.id=d.season_id
     where d.id=p_division_id;
end;
$$;

create function app_private.runner_ciclos(p_division_id uuid)
returns table(id uuid,opens_at timestamptz,closes_at timestamptz,
              publishes_at timestamptz,status text)
language plpgsql stable security definer set search_path=''
as $$
begin
  perform app_private._runner_exigir_division(p_division_id);
  return query
    select c.id,c.opens_at,c.closes_at,c.publishes_at,c.status
      from public.market_cycles c
     where c.division_id=p_division_id
     order by c.opens_at;
end;
$$;

-- Operaciones de un ciclo existente: comprobar SIEMPRE su propia división.
create function app_private._runner_exigir_ciclo(p_ciclo_id uuid)
returns void
language plpgsql security definer set search_path=''
as $$
declare v_division uuid;
begin
  select c.division_id into v_division
    from public.market_cycles c where c.id=p_ciclo_id;
  if not found then
    raise exception 'Ciclo inexistente' using errcode='22023';
  end if;
  perform app_private._runner_exigir_division(v_division);
end;
$$;
revoke all on function app_private._runner_exigir_ciclo(uuid)
  from public,anon,authenticated,service_role,macroliga_runner;

create function app_private.runner_preparar(
  p_division_id uuid,p_dia date
)
returns table(ciclo_id uuid,arrastrados integer,nuevos integer)
language plpgsql security definer set search_path=''
as $$
begin
  perform app_private._runner_exigir_division(p_division_id);
  return query select x.ciclo_id,x.arrastrados,x.nuevos
    from app_private.preparar_mercado_diario(p_division_id,p_dia) x;
end;
$$;

create function app_private.runner_abrir(p_ciclo_id uuid)
returns integer
language plpgsql security definer set search_path=''
as $$
begin
  perform app_private._runner_exigir_ciclo(p_ciclo_id);
  return app_private.abrir_mercado_diario(p_ciclo_id);
end;
$$;

create function app_private.runner_cerrar(p_ciclo_id uuid)
returns integer
language plpgsql security definer set search_path=''
as $$
begin
  perform app_private._runner_exigir_ciclo(p_ciclo_id);
  return app_private.cerrar_calcular_ciclo(p_ciclo_id);
end;
$$;

create function app_private.runner_publicar(p_ciclo_id uuid)
returns integer
language plpgsql security definer set search_path=''
as $$
begin
  perform app_private._runner_exigir_ciclo(p_ciclo_id);
  return app_private.publicar_ciclo(p_ciclo_id);
end;
$$;

-- PostgreSQL concede EXECUTE a PUBLIC por defecto: revocar primero.
revoke all on function app_private.runner_hora_servidor()
  from public,anon,authenticated,service_role,macroliga_runner;
revoke all on function app_private.runner_division(uuid)
  from public,anon,authenticated,service_role,macroliga_runner;
revoke all on function app_private.runner_ciclos(uuid)
  from public,anon,authenticated,service_role,macroliga_runner;
revoke all on function app_private.runner_preparar(uuid,date)
  from public,anon,authenticated,service_role,macroliga_runner;
revoke all on function app_private.runner_abrir(uuid)
  from public,anon,authenticated,service_role,macroliga_runner;
revoke all on function app_private.runner_cerrar(uuid)
  from public,anon,authenticated,service_role,macroliga_runner;
revoke all on function app_private.runner_publicar(uuid)
  from public,anon,authenticated,service_role,macroliga_runner;

grant execute on function app_private.runner_hora_servidor()
  to macroliga_runner;
grant execute on function app_private.runner_division(uuid)
  to macroliga_runner;
grant execute on function app_private.runner_ciclos(uuid)
  to macroliga_runner;
grant execute on function app_private.runner_preparar(uuid,date)
  to macroliga_runner;
grant execute on function app_private.runner_abrir(uuid)
  to macroliga_runner;
grant execute on function app_private.runner_cerrar(uuid)
  to macroliga_runner;
grant execute on function app_private.runner_publicar(uuid)
  to macroliga_runner;

-- NO conceder SELECT/INSERT/UPDATE/DELETE sobre tablas del juego;
-- NO conceder ejecución sobre funciones originales del motor,
-- NO crear políticas RLS amplias ni añadir rol a service_role.
commit;
