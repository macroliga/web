-- Revertir acceso/API; conservar los borradores y alineaciones existentes.
begin;
drop function public.macroliga_guardar_alineacion(uuid,uuid,uuid[],integer);
drop function public.macroliga_estado_alineacion(uuid);
drop function app_private.limite_alineacion(uuid);
-- equipo_manager_activo es compartida por la pasarela de mercado; retirar aquella antes.
drop function app_private.equipo_manager_activo(uuid);
-- La tabla privada se conserva intencionadamente: ninguna pérdida de datos.
commit;
