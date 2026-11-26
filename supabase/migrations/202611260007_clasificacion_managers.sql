-- MACROLIGA: clasificación de la propia división, incluso antes del reparto.
begin;
create function public.macroliga_clasificacion(p_division_id uuid)
returns table (
 posicion bigint, equipo_id uuid, nombre_manager text, nombre_equipo text,
 valor_equipo_centimos text,puntos bigint,es_mi_equipo boolean
)
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.teams t join public.managers m on m.id=t.manager_id
   where t.division_id=p_division_id and m.auth_user_id=auth.uid() and t.status='active') then
   raise exception 'No autorizado para esta división' using errcode='42501';end if;
 return query
 with valores as (
   select r.team_id,sum(p.current_market_value_cents) valor
   from public.roster_ownership r join public.players p on p.id=r.player_id
   where r.division_id=p_division_id and r.owner_kind='team' group by r.team_id
 ), puntuaciones as (
   select s.team_id,sum(s.points) pts from public.team_gameweek_scores s
   join public.gameweeks g on g.id=s.gameweek_id and g.division_id=s.division_id
   where s.division_id=p_division_id and s.status='final' and g.status in ('final','corrected')
   group by s.team_id
 ), clasificacion as (
   select t.id,m.display_name,t.team_name,coalesce(v.valor,0)::text valor,
     coalesce(s.pts,0)::bigint pts,m.auth_user_id=auth.uid() propio
   from public.teams t join public.managers m on m.id=t.manager_id
   left join valores v on v.team_id=t.id left join puntuaciones s on s.team_id=t.id
   where t.division_id=p_division_id
 )
 select rank() over(order by c.pts desc),c.id,c.display_name,c.team_name,c.valor,c.pts,c.propio
 from clasificacion c order by c.pts desc,c.display_name,c.team_name,c.id;
end; $$;
revoke all on function public.macroliga_clasificacion(uuid) from public,anon,authenticated,service_role,macroliga_runner;
grant execute on function public.macroliga_clasificacion(uuid) to authenticated;
commit;
