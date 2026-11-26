begin;
drop function public.macroliga_mercado_visible(uuid);
drop function app_private.reserva_mercado_inicial(uuid);
drop function app_private.seleccionar_mercado_variado(uuid,text,uuid[],uuid[]);
commit;
