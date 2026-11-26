-- PROPUESTA NO DESPLEGADA. Catálogo visible solo a managers de su división.
begin;
create function public.macroliga_catalogo_division(p_division_id uuid)
returns table (
 jugador_id uuid,nombre_jugador text,posicion text,club text,
 valor_mercado_centimos bigint,activo boolean,propietario_tipo text,
 propietario_equipo text,en_mercado boolean
)
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.teams t join public.managers m on m.id=t.manager_id
    where t.division_id=p_division_id and m.auth_user_id=auth.uid() and t.status='active') then
   raise exception 'No autorizado para esta división' using errcode='42501';end if;
 return query
 select p.id,p.name,p.position,c.name,p.current_market_value_cents,p.active,
   case when r.owner_kind='team' then 'team' when r.owner_kind='bad_team' then 'bad_team' else 'computer' end,
   case when r.owner_kind='team' then t.team_name when r.owner_kind='bad_team' then 'Equipo Malo' else 'Computer' end,
   p.active and exists(select 1 from public.market_lots l join public.market_cycles mc on mc.id=l.cycle_id
     where l.player_id=p.id and l.division_id=p_division_id and l.status='available' and mc.status='open')
 from public.players p
 left join public.football_clubs c on c.id=p.club_id
 left join public.roster_ownership r on r.player_id=p.id and r.division_id=p_division_id
 left join public.teams t on t.id=r.team_id and t.division_id=p_division_id
 -- Las bajas de un usuario siguen visibles hasta venderse a Computer.
 -- Inactivos libres y del Equipo Malo quedan fuera del catálogo visible.
 where p.active or r.owner_kind='team'
 order by p.name,p.id;
end; $$;
revoke all on function public.macroliga_catalogo_division(uuid)
 from public,anon,authenticated,service_role,macroliga_runner;
grant execute on function public.macroliga_catalogo_division(uuid) to authenticated;
commit;
