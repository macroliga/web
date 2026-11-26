begin;
CREATE OR REPLACE FUNCTION public.macroliga_guardar_alineacion(p_division_id uuid, p_jornada_id uuid, p_slots uuid[], p_version integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end; $function$;
drop function app_private.formacion_alineacion_valida(integer,integer,integer,integer,boolean);
commit;
