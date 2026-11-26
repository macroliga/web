-- MACROLIGA | cerrar procedimientos administrativos temporales.
-- Cuentas, equipos, competiciones y datos ya creados se conservan.
begin;
drop function if exists public.macroliga_piloto_vincular_entrenador(uuid,uuid,integer);
drop function if exists public.macroliga_piloto_revertir_alta(uuid);
drop function if exists public.macroliga_piloto_preparar_alta();
drop function if exists public.macroliga_piloto_estado_alta();
commit;
