-- Rollback for 20261125_lecturas_manager.sql only.
-- Execute only if this release created both functions; never use CASCADE.
-- Review dependencies and confirm deployment ownership before executing.
begin;
revoke execute on function public.macroliga_mi_plantilla(uuid) from authenticated;
revoke execute on function public.macroliga_mis_equipos() from authenticated;
drop function public.macroliga_mi_plantilla(uuid);
drop function public.macroliga_mis_equipos();
commit;
