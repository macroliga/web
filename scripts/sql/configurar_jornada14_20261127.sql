-- MACROLIGA PILOTO exclusivamente. Calendario oficial consultado 26/11/2026:
-- https://www.laliga.com/laliga-easports/resultados/2026-27/jornada-14
-- https://www.laliga.com/noticias/horarios-de-la-decimocuarta-jornada-de-laliga-ea-sports-2026-27
-- Horarios Europe/Madrid (CET). Sin puntos, activación económica ni modificación de jugadores.
begin;
do $$
declare v_division uuid; v_jornada uuid; v_n integer; v_fixture uuid; f record;
begin
  select d.id into strict v_division from public.divisions d
  join public.seasons s on s.id=d.season_id join public.competitions c on c.id=s.competition_id
  where c.code='MACROLIGA_PILOTO_INVIERNO_2026' and s.code='2026_27' and d.code='PILOTO' for update of d;
  if (select count(*) from public.teams where division_id=v_division and status='active')<>16 then
    raise exception 'La división piloto no tiene 16 equipos activos'; end if;
  if clock_timestamp()>=timestamptz '2026-11-27 21:00:00+01' then raise exception 'El primer partido ya ha comenzado'; end if;
  if exists(select 1 from public.gameweeks where division_id=v_division) then raise exception 'Ya hay jornadas configuradas; no se sobrescriben'; end if;
  if exists(select 1 from public.fixtures where provider='laliga_official' and external_id like '2026-27:j14:%') then
    raise exception 'Calendario existente; no se sobrescribe'; end if;
  insert into public.gameweeks(division_id,number,kind,status,lineup_lock_at)
    values(v_division,14,'normal','scheduled',timestamptz '2026-11-27 21:00:00+01') returning id into v_jornada;
  for f in select * from (values
    ('levante-racing','Levante','Racing','2026-11-27 21:00:00+01'),
    ('betis-rayo','Betis','Rayo Vallecano','2026-11-28 14:00:00+01'),
    ('malaga-athletic','Málaga','Athletic','2026-11-28 16:15:00+01'),
    ('elche-atletico','Elche','Atlético','2026-11-28 18:30:00+01'),
    ('madrid-alaves','Real Madrid','Alavés','2026-11-28 21:00:00+01'),
    ('valencia-osasuna','Valencia','Osasuna','2026-11-29 14:00:00+01'),
    ('deportivo-barcelona','Deportivo','Barcelona','2026-11-29 16:15:00+01'),
    ('celta-villarreal','Celta','Villarreal','2026-11-29 18:30:00+01'),
    ('real-sociedad-sevilla','Real Sociedad','Sevilla','2026-11-29 21:00:00+01'),
    ('espanyol-getafe','Espanyol','Getafe','2026-11-30 21:00:00+01')
  ) x(slug,local,visitante,inicio) loop
    insert into public.fixtures(provider,external_id,home_club_id,away_club_id,kickoff_at,status,official_round)
      select 'laliga_official','2026-27:j14:'||f.slug,h.id,a.id,f.inicio::timestamptz,'TIMED','14'
      from public.football_clubs h cross join public.football_clubs a
      where h.name=f.local and a.name=f.visitante and h.id<>a.id
      and exists(select 1 from public.players where club_id=h.id and active)
      and exists(select 1 from public.players where club_id=a.id and active)
      returning id into strict v_fixture;
    insert into public.gameweek_fixtures values(v_jornada,v_fixture);
  end loop;
  select count(*) into v_n from public.gameweek_fixtures where gameweek_id=v_jornada;
  if v_n<>10 or (select count(distinct club) from (
    select fx.home_club_id club from public.fixtures fx join public.gameweek_fixtures gf on gf.fixture_id=fx.id where gf.gameweek_id=v_jornada
    union select fx.away_club_id from public.fixtures fx join public.gameweek_fixtures gf on gf.fixture_id=fx.id where gf.gameweek_id=v_jornada
  ) clubs)<>20 then raise exception 'Calendario incompleto o clubes repetidos'; end if;
end $$;
commit;
