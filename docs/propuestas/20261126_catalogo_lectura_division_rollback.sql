begin;
drop function public.macroliga_historial_traspasos(uuid,timestamptz,uuid,int);
drop function public.macroliga_catalogo_division(uuid,uuid,int);
drop index public.transfer_operations_historial_idx;
drop index app_private.catalogo_comuniazo_puntos_jugador_idx;
commit;
