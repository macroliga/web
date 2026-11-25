-- PROPUESTA NO DESPLEGADA. Proyecto exclusivo macroliga-piloto.
-- No concede acceso directo a tablas. Identidad siempre derivada de auth.uid().
begin;
create function public.macroliga_mis_equipos()
returns table(equipo_id uuid, division_id uuid, nombre text, saldo_centimos bigint, valor_plantilla_centimos bigint, plazas_ocupadas bigint, max_plantilla smallint)
language sql stable security definer set search_path = ''
as $$
 select t.id,t.division_id,t.team_name,t.balance_cents,
 coalesce(sum(p.current_market_value_cents),0)::bigint,count(p.id),d.max_roster
 from public.teams t join public.managers m on m.id=t.manager_id
 join public.divisions d on d.id=t.division_id
 left join public.roster_ownership r on r.team_id=t.id and r.division_id=t.division_id and r.owner_kind='team'
 left join public.players p on p.id=r.player_id
 where m.auth_user_id=auth.uid()
 group by t.id,d.id
 order by t.team_name,t.id
$$;
create function public.macroliga_mi_plantilla(p_equipo_id uuid)
returns table(jugador_id uuid,nombre text,posicion text,club text,valor_centimos bigint)
language sql stable security definer set search_path = ''
as $$
 select p.id,p.name,p.position,c.name,p.current_market_value_cents
 from public.teams t join public.managers m on m.id=t.manager_id
 join public.roster_ownership r on r.team_id=t.id and r.division_id=t.division_id and r.owner_kind='team'
 join public.players p on p.id=r.player_id
 left join public.football_clubs c on c.id=p.club_id
 where m.auth_user_id=auth.uid() and t.id=p_equipo_id
 order by p.position,p.name,p.id
$$;
revoke all on function public.macroliga_mis_equipos() from public,anon,authenticated;
revoke all on function public.macroliga_mi_plantilla(uuid) from public,anon,authenticated;
grant execute on function public.macroliga_mis_equipos() to authenticated;
grant execute on function public.macroliga_mi_plantilla(uuid) to authenticated;
commit;
-- Antes de desplegar: probar con dos identidades y dos divisiones, usuario sin
-- manager, anon, equipo ajeno, plantilla vacía y saldo negativo. No activar cron.
