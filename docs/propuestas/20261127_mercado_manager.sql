-- Development proposal; do not deploy without authorization.
begin;
create function public.macroliga_mi_mercado(p_equipo_id uuid)
returns table(lote_id uuid,jugador_id uuid,nombre text,posicion text,precio_minimo_centimos bigint,cierra_en timestamptz)
language sql stable security definer set search_path = ''
as $$
 select l.id,p.id,p.name,p.position,l.minimum_bid_cents,c.closes_at
 from public.teams t
 join public.managers m on m.id=t.manager_id
 join public.market_cycles c on c.division_id=t.division_id
 join public.market_lots l on l.cycle_id=c.id
 join public.players p on p.id=l.player_id
 where t.id=p_equipo_id and m.auth_user_id=auth.uid()
 and c.status='open' and c.opens_at<=now() and c.closes_at>now()
 and l.status='available'
 order by p.name,l.id
$$;
revoke all on function public.macroliga_mi_mercado(uuid) from public,anon,authenticated;
grant execute on function public.macroliga_mi_mercado(uuid) to authenticated;
commit;
