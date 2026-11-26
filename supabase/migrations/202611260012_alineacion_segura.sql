-- MACROLIGA: preparación privada del once y guardado por jornada.
-- No crea jornadas, partidos, puntos ni movimientos económicos.
begin;
create table if not exists app_private.lineup_drafts (
  team_id uuid primary key references public.teams(id),
  slots uuid[] not null check(cardinality(slots)=11),
  version integer not null default 1,
  saved_at timestamptz not null default now()
);
alter table app_private.lineup_drafts enable row level security;
revoke all on app_private.lineup_drafts from public,anon,authenticated,service_role,macroliga_runner;

create function app_private.equipo_manager_activo(p_division_id uuid)
returns uuid language plpgsql stable security invoker set search_path='' as $$
declare v_equipo uuid;
begin
  select t.id into v_equipo from public.teams t join public.managers m on m.id=t.manager_id
    where m.auth_user_id=auth.uid() and t.division_id=p_division_id and t.status='active';
  if v_equipo is null then raise exception 'No autorizado para esta división' using errcode='42501'; end if;
  return v_equipo;
end; $$;
revoke all on function app_private.equipo_manager_activo(uuid) from public,anon,authenticated,service_role,macroliga_runner;

-- El bloqueo explícito de jornada confirma que el calendario está configurado.
-- Nunca se retrasa por ignorar el comienzo de un partido confirmado.
create function app_private.limite_alineacion(p_jornada uuid)
returns timestamptz language sql stable security invoker set search_path='' as $$
select case when g.lineup_lock_at is not null and exists(
  select 1 from public.gameweek_fixtures gf join public.fixtures f on f.id=gf.fixture_id
  where gf.gameweek_id=g.id and f.kickoff_at is not null
    and upper(f.status) in ('SCHEDULED','TIMED','IN_PLAY','PAUSED','FINISHED','LIVE','PLAYING','IN_PROGRESS')
) then least(g.lineup_lock_at,(
  select min(f.kickoff_at) from public.gameweek_fixtures gf join public.fixtures f on f.id=gf.fixture_id
  where gf.gameweek_id=g.id and upper(f.status) in ('SCHEDULED','TIMED','IN_PLAY','PAUSED','FINISHED','LIVE','PLAYING','IN_PROGRESS')
)) end from public.gameweeks g where g.id=p_jornada;
$$;
revoke all on function app_private.limite_alineacion(uuid) from public,anon,authenticated,service_role,macroliga_runner;

create function public.macroliga_estado_alineacion(p_division_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_equipo uuid:=app_private.equipo_manager_activo(p_division_id);
  v_j public.gameweeks%rowtype; v_limite timestamptz;
  v_lineup uuid; v_version int:=0; v_slots jsonb; v_borrador jsonb;
  v_partidos jsonb; v_plantilla jsonb;
begin
  select * into v_j from public.gameweeks g where g.division_id=p_division_id
    and g.status in ('scheduled','live','pending_points')
    order by case when g.status='scheduled' and g.lineup_lock_at>statement_timestamp() then 0 else 1 end,g.number,g.kind limit 1;
  v_limite:=app_private.limite_alineacion(v_j.id);
  select jsonb_build_object('slots',to_jsonb(d.slots),'version',d.version) into v_borrador
    from app_private.lineup_drafts d where d.team_id=v_equipo;
  select l.id,l.version into v_lineup,v_version from public.lineups l where l.gameweek_id=v_j.id and l.team_id=v_equipo;
  select jsonb_agg(s.player_id order by n.i) into v_slots from generate_series(1,11) n(i)
    left join public.lineup_slots s on s.lineup_id=v_lineup and s.slot=n.i;
  select coalesce(jsonb_agg(jsonb_build_object('local',h.name,'visitante',a.name,'inicio',f.kickoff_at,'estado',f.status) order by f.kickoff_at nulls last,f.id),'[]'::jsonb)
    into v_partidos from public.gameweek_fixtures gf join public.fixtures f on f.id=gf.fixture_id
    left join public.football_clubs h on h.id=f.home_club_id left join public.football_clubs a on a.id=f.away_club_id
    where gf.gameweek_id=v_j.id;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'nombre',p.name,'posicion',p.position,'club',c.name,'activo',p.active) order by p.position,p.name,p.id),'[]'::jsonb)
    into v_plantilla from public.roster_ownership r join public.players p on p.id=r.player_id
    left join public.football_clubs c on c.id=p.club_id where r.division_id=p_division_id and r.team_id=v_equipo and r.owner_kind='team';
  return jsonb_build_object('jornada_id',v_j.id,'numero',v_j.number,'estado',v_j.status,'limite',v_limite,
    'editable',coalesce(v_j.status='scheduled' and v_limite>statement_timestamp() and not exists(
      select 1 from public.lineups l where l.id=v_lineup and l.locked_at is not null),false),
    'ahora',statement_timestamp(),'partidos',v_partidos,'plantilla',v_plantilla,
    'slots',v_slots,'version',coalesce(v_version,0),'borrador',v_borrador);
end; $$;

create function public.macroliga_guardar_alineacion(p_division_id uuid,p_jornada_id uuid,p_slots uuid[],p_version integer)
returns integer language plpgsql security definer set search_path='' as $$
declare v_equipo uuid:=app_private.equipo_manager_activo(p_division_id);
  v_j public.gameweeks%rowtype; v_limite timestamptz; v_id uuid; v_version int; v_locked timestamptz;
begin
  if p_slots is null or cardinality(p_slots)<>11 or array_ndims(p_slots)<>1 or array_lower(p_slots,1)<>1
    or p_version is null or p_version<0 then raise exception 'Se requieren once plazas válidas'; end if;
  if (select count(*) from unnest(p_slots) x(id) where id is not null)
     <> (select count(distinct id) from unnest(p_slots) x(id)) then raise exception 'No repitas futbolistas'; end if;
  if p_jornada_id is not null then
    select * into v_j from public.gameweeks g where g.id=p_jornada_id and g.division_id=p_division_id for update;
    if not found then raise exception 'Jornada no disponible' using errcode='42501'; end if;
  end if;
  -- Compartir el bloqueo de división de los traspasos evita validar una plantilla obsoleta.
  perform 1 from public.divisions where id=p_division_id for update;
  perform 1 from public.teams where id=v_equipo and status='active' for update;
  if not found then raise exception 'Equipo no disponible' using errcode='42501'; end if;
  if exists(select 1 from unnest(p_slots) x(id) where id is not null and not exists(
    select 1 from public.roster_ownership r join public.players p on p.id=r.player_id
    where r.player_id=x.id and r.team_id=v_equipo and r.division_id=p_division_id and r.owner_kind='team' and p.active))
    then raise exception 'Solo puedes alinear futbolistas activos de tu plantilla'; end if;
  -- Sin calendario confirmado se guarda un borrador personal, nunca una alineación oficial.
  if p_jornada_id is null then
    select d.version into v_version from app_private.lineup_drafts d where d.team_id=v_equipo for update;
    if coalesce(v_version,0)<>p_version then raise exception 'El once ha cambiado. Recarga antes de guardar'; end if;
    insert into app_private.lineup_drafts(team_id,slots,version) values(v_equipo,p_slots,1)
      on conflict(team_id) do update set slots=excluded.slots,version=app_private.lineup_drafts.version+1,saved_at=clock_timestamp()
      returning version into v_version;
    return v_version;
  end if;
  v_limite:=app_private.limite_alineacion(p_jornada_id);
  if v_j.status<>'scheduled' or v_limite is null or clock_timestamp()>=v_limite then
    raise exception 'Alineación cerrada o calendario pendiente de confirmar'; end if;
  select l.id,l.version,l.locked_at into v_id,v_version,v_locked from public.lineups l
    where l.gameweek_id=p_jornada_id and l.team_id=v_equipo for update;
  if v_locked is not null then raise exception 'Alineación cerrada'; end if;
  if coalesce(v_version,0)<>p_version then raise exception 'El once ha cambiado. Recarga antes de guardar'; end if;
  if v_id is null then
    insert into public.lineups(gameweek_id,team_id,division_id) values(p_jornada_id,v_equipo,p_division_id)
      returning id,version into v_id,v_version;
  else
    update public.lineups set version=version+1,saved_at=clock_timestamp() where id=v_id returning version into v_version;
  end if;
  insert into public.lineup_slots(lineup_id,slot,player_id)
    select v_id,n::smallint,null from generate_series(1,11) n
    on conflict(lineup_id,slot) do update set player_id=null;
  update public.lineup_slots s set player_id=p_slots[s.slot] where s.lineup_id=v_id;
  if clock_timestamp()>=app_private.limite_alineacion(p_jornada_id) then raise exception 'La alineación acaba de cerrar'; end if;
  return v_version;
end; $$;
revoke all on function public.macroliga_estado_alineacion(uuid),public.macroliga_guardar_alineacion(uuid,uuid,uuid[],integer) from public,anon,authenticated,service_role,macroliga_runner;
grant execute on function public.macroliga_estado_alineacion(uuid),public.macroliga_guardar_alineacion(uuid,uuid,uuid[],integer) to authenticated;
commit;
