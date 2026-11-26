-- PROPUESTA NO DESPLEGADA. Lecturas paginadas, solo managers de su división.
begin;
create index catalogo_comuniazo_puntos_jugador_idx on app_private.catalogo_comuniazo_puntos(player_id,import_run_id);
create index transfer_operations_historial_idx on public.transfer_operations(division_id,(coalesce(effective_at,created_at)) desc,id desc) where status='committed';

create function public.macroliga_catalogo_division(
 p_division_id uuid,p_despues uuid default null,p_limite int default 250
)
returns table (
 jugador_id uuid,nombre_jugador text,posicion text,club text,
 valor_mercado_centimos text,activo boolean,propietario_tipo text,
 propietario_equipo text,en_mercado boolean,propietario_equipo_id uuid,
 propietario_manager text,puntos_acumulados integer,fecha_puntos date
)
language plpgsql stable security definer set search_path='' as $$
declare v_temporada uuid;
begin
 select d.season_id into v_temporada from public.teams t
 join public.managers m on m.id=t.manager_id join public.divisions d on d.id=t.division_id
 where t.division_id=p_division_id and m.auth_user_id=auth.uid() and t.status='active';
 if not found then raise exception 'No autorizado para esta división' using errcode='42501';end if;
 if p_limite is null or p_limite not between 1 and 250 then
   raise exception 'Límite de catálogo inválido' using errcode='22023';end if;
 return query
 with pagina as (
   select p.id,p.name,p.position,p.club_id,p.current_market_value_cents,p.active,r.owner_kind,r.team_id
   from public.players p left join public.roster_ownership r on r.player_id=p.id and r.division_id=p_division_id
   -- Las bajas de un usuario siguen visibles hasta venderse a Computer.
   where (p.active or r.owner_kind='team') and (p_despues is null or p.id>p_despues)
   order by p.id limit p_limite
 )
 select p.id,p.name,p.position,c.name,p.current_market_value_cents::text,p.active,
   case when p.owner_kind='team' then 'team' when p.owner_kind='bad_team' then 'bad_team' else 'computer' end,
   case when p.owner_kind='team' then t.team_name when p.owner_kind='bad_team' then 'Equipo Malo' else 'Computer' end,
   p.active and exists(select 1 from public.market_lots l join public.market_cycles mc on mc.id=l.cycle_id
     where l.player_id=p.id and l.division_id=p_division_id and l.status='available' and mc.status='open'),
   t.id,m.display_name,pt.accumulated_points,pt.sport_day
 from pagina p
 left join public.football_clubs c on c.id=p.club_id
 left join public.teams t on t.id=p.team_id and t.division_id=p_division_id
 left join public.managers m on m.id=t.manager_id
 left join lateral (
   select cp.accumulated_points,cr.sport_day
   from app_private.catalogo_comuniazo_puntos cp
   join app_private.catalogo_comuniazo_runs cr on cr.import_run_id=cp.import_run_id
   where cp.player_id=p.id and cr.season_id=v_temporada
   order by cr.sport_day desc limit 1
 ) pt on true
 order by p.id;
end; $$;
revoke all on function public.macroliga_catalogo_division(uuid,uuid,int)
 from public,anon,authenticated,service_role,macroliga_runner;
grant execute on function public.macroliga_catalogo_division(uuid,uuid,int) to authenticated;

-- Únicamente traspasos ya contabilizados de la misma división. Nunca
-- movimientos pendientes/revertidos, pujas, contactos, claves ni saldos.
create function public.macroliga_historial_traspasos(
 p_division_id uuid,p_antes_fecha timestamptz default null,p_antes_id uuid default null,p_limite int default 50
)
returns table (
 traspaso_id uuid,fecha timestamptz,jugador_id uuid,nombre_jugador text,
 origen text,destino text,importe_centimos text,tipo text
)
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.teams t join public.managers m on m.id=t.manager_id
    where t.division_id=p_division_id and m.auth_user_id=auth.uid() and t.status='active') then
   raise exception 'No autorizado para esta división' using errcode='42501';end if;
 if p_limite is null or p_limite not between 1 and 100
    or ((p_antes_fecha is null)<>(p_antes_id is null)) then
   raise exception 'Paginación de traspasos inválida' using errcode='22023';end if;
 return query
 select x.id,coalesce(x.effective_at,x.created_at),p.id,p.name,
   case x.seller_kind when 'team' then coalesce(a.team_name,'Equipo') when 'bad_team' then 'Equipo Malo' else 'Computer' end,
   case x.buyer_kind when 'team' then coalesce(b.team_name,'Equipo') when 'bad_team' then 'Equipo Malo' else 'Computer' end,
   x.amount_cents::text,x.kind
 from public.transfer_operations x join public.players p on p.id=x.player_id
 left join public.teams a on a.id=x.seller_team_id and a.division_id=p_division_id
 left join public.teams b on b.id=x.buyer_team_id and b.division_id=p_division_id
 where x.division_id=p_division_id and x.status='committed'
   and (p_antes_fecha is null or (coalesce(x.effective_at,x.created_at),x.id)<(p_antes_fecha,p_antes_id))
 order by coalesce(x.effective_at,x.created_at) desc,x.id desc limit p_limite;
end; $$;
revoke all on function public.macroliga_historial_traspasos(uuid,timestamptz,uuid,int)
 from public,anon,authenticated,service_role,macroliga_runner;
grant execute on function public.macroliga_historial_traspasos(uuid,timestamptz,uuid,int) to authenticated;
commit;
