-- Desactivación reversible de funciones y política. No deshace ventas confirmadas.
drop function public.macroliga_cotizar_venta_equipo_malo(uuid,uuid);
drop function public.macroliga_vender_equipo_malo(uuid,uuid,bigint,uuid);
delete from app_private.manager_trade_policies q using public.divisions d, public.seasons s, public.competitions c
where q.division_id=d.id and d.season_id=s.id and s.competition_id=c.id
and c.code='MACROLIGA_PILOTO_INVIERNO_2026' and s.code='2026_27' and d.code='PILOTO'
and q.enabled and q.min_sale_percent is null;
