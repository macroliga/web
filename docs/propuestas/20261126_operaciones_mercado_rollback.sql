-- Revierte pasarela; preserva anuncios, pujas, ofertas, traspasos e historial.
begin;
drop function public.macroliga_operar_venta(uuid,text,uuid,bigint);
drop function public.macroliga_operaciones_mercado(uuid);
commit;
