-- MACROLIGA: reducir el acceso de clientes a una función interna de
-- seguridad creada por Supabase. ÚNICO DESTINO: macroliga-piloto.
-- Comprobado antes con BEGIN/ROLLBACK: el disparador ensure_rls
-- continúa activando RLS en nuevas tablas.
begin;
revoke execute on function public.rls_auto_enable()
  from public,anon,authenticated,macroliga_runner;
commit;
