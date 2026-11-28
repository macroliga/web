-- Entorno PostgreSQL 17 desechable. No ejecutar en Supabase ni otros proyectos.
-- Pequeña capa de compatibilidad de Supabase Auth para probar los roles y claims
-- del esquema REAL versionado. No simula ninguna tabla de la aplicación.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create schema auth;
create table auth.users(
 id uuid primary key,
 email text,
 aud text,
 role text,
 raw_user_meta_data jsonb default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable set search_path='' as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
   nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
$$;
grant usage on schema auth to anon,authenticated,service_role;
-- Solo firma del auxiliar gestionado por la plataforma; la migración 0011 revoca su acceso.
-- El esquema versionado activa explícitamente RLS en todas las tablas de aplicación.
create function public.rls_auto_enable() returns event_trigger language plpgsql as $$ begin end $$;
