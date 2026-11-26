-- Solo si nadie ha confirmado alineación y no hay puntos; jamás destruir datos de juego.
begin;
do $$
declare v_jornada uuid; v_ids uuid[];
begin
  select g.id into strict v_jornada from public.gameweeks g join public.divisions d on d.id=g.division_id
  join public.seasons s on s.id=d.season_id join public.competitions c on c.id=s.competition_id
  where c.code='MACROLIGA_PILOTO_INVIERNO_2026' and s.code='2026_27' and d.code='PILOTO'
  and g.number=14 and g.kind='normal' and g.status='scheduled' for update of g;
  if exists(select 1 from public.lineups where gameweek_id=v_jornada)
  or exists(select 1 from public.team_gameweek_scores where gameweek_id=v_jornada)
  or exists(select 1 from public.team_gameweek_awards where gameweek_id=v_jornada)
  then raise exception 'Ya hay actividad: no se permite revertir'; end if;
  select array_agg(f.id) into v_ids from public.fixtures f join public.gameweek_fixtures gf on gf.fixture_id=f.id
  where gf.gameweek_id=v_jornada and f.provider='laliga_official' and f.external_id like '2026-27:j14:%';
  if cardinality(v_ids)<>10 or exists(select 1 from public.player_fixture_points where fixture_id=any(v_ids))
    or exists(select 1 from public.gameweek_fixtures where fixture_id=any(v_ids) and gameweek_id<>v_jornada)
  then raise exception 'Partidos no exclusivos/sin actividad'; end if;
  delete from public.gameweek_fixtures where gameweek_id=v_jornada and fixture_id=any(v_ids);
  delete from public.gameweeks where id=v_jornada;
  delete from public.fixtures where id=any(v_ids);
end $$;
commit;
