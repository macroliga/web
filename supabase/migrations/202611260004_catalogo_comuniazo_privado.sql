-- MACROLIGA · Núcleo de catálogo (no publica ni abre mercados).
-- Aplicar únicamente al proyecto macroliga-piloto. Ejecución de propietario.
begin;
create table app_private.catalogo_comuniazo_runs (
  import_run_id uuid primary key references public.sport_import_runs(id),
  season_id uuid not null references public.seasons(id),
  sport_day date not null,
  snapshot_at timestamptz not null,
  digest text not null check(digest ~ '^[a-f0-9]{64}$'),
  snapshot_hash text not null check(snapshot_hash ~ '^[a-f0-9]{64}$'),
  permission_ref text not null,
  result jsonb not null,
  actor_manager_id uuid references public.managers(id),
  unique(season_id,sport_day)
);
create table app_private.catalogo_comuniazo_puntos (
  import_run_id uuid not null references app_private.catalogo_comuniazo_runs(import_run_id),
  player_id uuid not null references public.players(id),
  accumulated_points integer not null,
  primary key(import_run_id,player_id)
);
-- Archivo histórico de bajas no económicas del Equipo Malo.
create table app_private.catalogo_comuniazo_bajas_equipo_malo (
  import_run_id uuid not null references app_private.catalogo_comuniazo_runs(import_run_id),
  division_id uuid not null references public.divisions(id),
  player_id uuid not null references public.players(id),
  acquired_at timestamptz not null,
  primary key(import_run_id,division_id,player_id)
);
alter table app_private.catalogo_comuniazo_bajas_equipo_malo enable row level security;
alter table app_private.catalogo_comuniazo_runs enable row level security;
alter table app_private.catalogo_comuniazo_puntos enable row level security;
revoke all on app_private.catalogo_comuniazo_runs,app_private.catalogo_comuniazo_puntos,app_private.catalogo_comuniazo_bajas_equipo_malo
 from public,anon,authenticated,service_role,macroliga_runner;

create function app_private.importar_catalogo_comuniazo(
 p_season uuid,p_catalogo jsonb,p_puntos jsonb default null,p_actor uuid default null
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 v_code text;v_comp text;v_status text;v_stamp timestamptz;v_day date;v_digest text;
 v_prev app_private.catalogo_comuniazo_runs%rowtype;
 v_n int;v_active int;v_clubs int;v_old_active int;v_lost int;v_run uuid;
 v_player uuid;v_club uuid;v_p jsonb;v_old public.players%rowtype;v_value bigint;
 v_new int:=0;v_reactivated int:=0;v_prices int:=0;v_names int:=0;v_points int:=0;
 v_result jsonb;v_bad_released int;
begin
 -- El catálogo es global en el piloto. Bloqueos compatibles con las
 -- transacciones económicas por división, y con la simulación de reparto.
 perform 1 from public.divisions order by id for update;
 select s.code,c.code,s.status into v_code,v_comp,v_status
  from public.seasons s join public.competitions c on c.id=s.competition_id
  where s.id=p_season for update of s;
 if not found or v_code is distinct from '2026_27'
   or v_comp is distinct from 'MACROLIGA_PILOTO_INVIERNO_2026'
   or v_status not in ('draft','active') then raise exception 'Temporada piloto incompatible';end if;
 if p_actor is not null and not exists(select 1 from public.managers m
   join public.teams t on t.manager_id=m.id join public.divisions d on d.id=t.division_id
   where m.id=p_actor and m.is_admin and t.status='active' and d.season_id=p_season) then
   raise exception 'Administrador no autorizado' using errcode='42501';end if;
 lock table public.players in share row exclusive mode;

 if jsonb_typeof(p_catalogo) is distinct from 'object'
   or p_catalogo->>'schemaVersion' is distinct from '1'
   or p_catalogo->>'kind' is distinct from 'authorized'
   or p_catalogo->>'provider' is distinct from 'comuniazo'
   or p_catalogo->>'competition' is distinct from 'LALIGA'
   or p_catalogo->>'season' is distinct from v_code
   or p_catalogo->>'currency' is distinct from 'EUR'
   or jsonb_typeof(p_catalogo->'players') is distinct from 'array'
   or nullif(btrim(p_catalogo->>'permissionRef'),'') is null
   or length(p_catalogo->>'permissionRef')>500
   or not coalesce(p_catalogo->>'snapshotHash' ~ '^[a-f0-9]{64}$',false)
   or not coalesce(p_catalogo->>'asOf' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$',false)
   then raise exception 'Catálogo no autorizado o incompatible';end if;
 if exists(select 1 from jsonb_object_keys(p_catalogo) k where k not in
    ('schemaVersion','kind','provider','competition','season','currency','asOf','permissionRef','players','snapshotHash')) then
    raise exception 'Campos de catálogo no admitidos';end if;
 v_stamp:=(p_catalogo->>'asOf')::timestamptz;
 v_day:=(v_stamp at time zone 'Europe/Madrid')::date;
 if v_stamp>clock_timestamp()+interval '5 minutes' then raise exception 'Fecha de catálogo futura';end if;
 v_digest:=encode(sha256(convert_to(jsonb_build_array(p_catalogo,p_puntos)::text,'UTF8')),'hex');
 select * into v_prev from app_private.catalogo_comuniazo_runs where season_id=p_season and sport_day=v_day;
 if found then
   if v_prev.digest=v_digest then return v_prev.result;end if;
   raise exception 'Ya existe un catálogo distinto para ese día';
 end if;
 if exists(select 1 from app_private.catalogo_comuniazo_runs where season_id<>p_season or sport_day>v_day) then
    raise exception 'Catálogo antiguo o de otra temporada';
 end if;
 -- Nada de recalcular valores con pujas reservadas o lotes sin resolver.
 -- El futuro ejecutor aplicará la fotografía después de liquidar el ciclo
 -- anterior y ANTES de preparar el siguiente; no se activa ningún cron.
 if exists(select 1 from public.market_cycles where status<>'published')
    or exists(select 1 from public.bids where status='active')
    or exists(select 1 from public.roster_ownership o join public.divisions d on d.id=o.division_id where d.season_id<>p_season) then
    raise exception 'Mercado pendiente o catálogo global de otra temporada: actualizar tras liquidar';
 end if;
 if exists(select 1 from public.players p where not exists(select 1 from public.provider_player_ids x where x.player_id=p.id and x.provider='comuniazo'))
    or exists(select 1 from public.provider_player_ids where provider<>'comuniazo') then raise exception 'Catálogo previo incompatible';end if;
 if not exists(select 1 from app_private.catalogo_comuniazo_runs) and
    (exists(select 1 from public.players) or exists(select 1 from public.football_clubs) or exists(select 1 from public.sport_import_runs)) then
    raise exception 'El catálogo inicial no está vacío';end if;

 v_n:=jsonb_array_length(p_catalogo->'players');
 if v_n not between 490 and 20000 then raise exception 'Cobertura inválida de catálogo';end if;
 for v_p in select value from jsonb_array_elements(p_catalogo->'players') loop
   if jsonb_typeof(v_p) is distinct from 'object' then raise exception 'Fila de futbolista inválida';end if;
   if exists(select 1 from jsonb_object_keys(v_p) k where k not in ('externalId','name','club','position','active','marketValueCents'))
      or not coalesce(v_p->>'externalId' ~ '^[a-z0-9-]{1,150}$',false)
      or nullif(btrim(v_p->>'name'),'') is null or length(v_p->>'name')>200
      or nullif(btrim(v_p->>'club'),'') is null or length(v_p->>'club')>200
      or v_p->>'name'<>btrim(v_p->>'name') or v_p->>'club'<>btrim(v_p->>'club')
      or not coalesce(v_p->>'position' in ('GK','DEF','MID','FWD'),false)
      or jsonb_typeof(v_p->'active') is distinct from 'boolean'
      or not coalesce(v_p->>'marketValueCents' ~ '^(0|[1-9][0-9]{0,18})$',false) then
     raise exception 'Fila de futbolista inválida';end if;
   v_value:=(v_p->>'marketValueCents')::bigint;
 end loop;
 if (select count(distinct value->>'externalId') from jsonb_array_elements(p_catalogo->'players'))<>v_n then
   raise exception 'Identificador de futbolista duplicado';end if;
 select count(*)::int,count(distinct value->>'club')::int into v_active,v_clubs
 from jsonb_array_elements(p_catalogo->'players') where (value->>'active')::boolean;
 if v_active<490 or v_clubs<>20 or exists(
   select 1 from jsonb_array_elements(p_catalogo->'players') where (value->>'active')::boolean
   group by value->>'club' having count(*)<15 or count(*)>80) then
    raise exception 'Plantillas incompletas: deben ser 20 clubes y al menos 490 activos';
 end if;
 if exists(select 1 from jsonb_array_elements(p_catalogo->'players') a where not (a.value->>'active')::boolean
    and not exists(select 1 from public.provider_player_ids i where i.provider='comuniazo' and i.external_id=a.value->>'externalId')) then
    raise exception 'Un histórico desconocido no puede entrar en el catálogo elegible';end if;
 select count(*)::int into v_old_active from public.players where active;
 select count(*)::int into v_lost from public.players p join public.provider_player_ids i on i.player_id=p.id and i.provider='comuniazo'
  where p.active and not exists(select 1 from jsonb_array_elements(p_catalogo->'players') a
   where a.value->>'externalId'=i.external_id and (a.value->>'active')::boolean);
 if v_lost>30 or v_lost*10>v_old_active then raise exception 'Demasiadas bajas: revisión manual';end if;

 -- Puntos acumulados opcionales, informativos. Nunca generan premios ni
 -- se convierten automáticamente en puntos de un partido/jornada.
 if p_puntos is not null then
  if jsonb_typeof(p_puntos) is distinct from 'array' or jsonb_array_length(p_puntos)<>v_active then
    raise exception 'Lote de puntos acumulados incompleto';end if;
  for v_p in select value from jsonb_array_elements(p_puntos) loop
   if jsonb_typeof(v_p) is distinct from 'object' then raise exception 'Puntos inválidos';end if;
   if exists(select 1 from jsonb_object_keys(v_p) k where k not in ('externalId','points'))
     or not coalesce(v_p->>'externalId' ~ '^[a-z0-9-]{1,150}$',false)
     or jsonb_typeof(v_p->'points') is distinct from 'number'
     or not coalesce(v_p->>'points' ~ '^-?\d+$',false)
     or not exists(select 1 from jsonb_array_elements(p_catalogo->'players') a where a.value->>'externalId'=v_p->>'externalId' and (a.value->>'active')::boolean)
      then raise exception 'Puntos inválidos';end if;
   perform (v_p->>'points')::int;
  end loop;
  if (select count(distinct value->>'externalId') from jsonb_array_elements(p_puntos))<>v_active then
    raise exception 'Puntos duplicados';end if;
 end if;

 insert into public.sport_import_runs(provider,kind,status,finished_at,item_count)
 values('comuniazo','players','completed',now(),v_active) returning id into v_run;
 for v_p in select value from jsonb_array_elements(p_catalogo->'players') where (value->>'active')::boolean loop
   v_value:=(v_p->>'marketValueCents')::bigint;
   insert into public.football_clubs(name) values(v_p->>'club') on conflict(name) do nothing;
   select id into strict v_club from public.football_clubs where name=v_p->>'club';
   select p.* into v_old from public.players p join public.provider_player_ids i on i.player_id=p.id
    where i.provider='comuniazo' and i.external_id=v_p->>'externalId';
   if not found then
     insert into public.players(name,position,club_id,current_market_value_cents,active)
     values(v_p->>'name',v_p->>'position',v_club,v_value,true) returning id into v_player;
     insert into public.provider_player_ids(provider,external_id,player_id) values('comuniazo',v_p->>'externalId',v_player);
     v_new:=v_new+1; -- sin roster_ownership → Computer en todas las divisiones
   else
     v_player:=v_old.id;
     if not v_old.active then v_reactivated:=v_reactivated+1;end if;
     if v_old.current_market_value_cents<>v_value then v_prices:=v_prices+1;end if;
     if v_old.name<>v_p->>'name' then v_names:=v_names+1;end if;
     update public.players set name=v_p->>'name',position=v_p->>'position',club_id=v_club,
      current_market_value_cents=v_value,active=true where id=v_player;
   end if;
   insert into public.player_market_values(player_id,import_run_id,valued_at,amount_cents)
   values(v_player,v_run,v_stamp,v_value);
 end loop;
 -- Baja: conserva UUID, último valor y propiedad de managers. No cambia caja,
 -- lotes ni historial. Computer libre queda oculto; Equipo Malo libera la
 -- titularidad no económica en una auditoría privada. Si vuelve se ofrece
 -- desde Computer, sin alterar plantillas de otras divisiones.
 update public.players p set active=false where p.active and exists(select 1 from public.provider_player_ids i
   where i.player_id=p.id and i.provider='comuniazo' and not exists(select 1 from jsonb_array_elements(p_catalogo->'players') a
    where a.value->>'externalId'=i.external_id and (a.value->>'active')::boolean));
 select count(*)::int into v_bad_released
 from public.roster_ownership o join public.players p on p.id=o.player_id
 where o.owner_kind='bad_team' and not p.active;
 v_points:=case when p_puntos is null then 0 else jsonb_array_length(p_puntos) end;
 v_result:=jsonb_build_object('catalogCount',(select count(*) from public.players),'active',v_active,
  'newPlayers',v_new,'reactivated',v_reactivated,'deactivated',v_lost,'priceChanges',v_prices,'nameChanges',v_names,
  'badTeamReleased',v_bad_released,'accumulatedPoints',v_points,'importRunId',v_run,'sportDay',v_day);
 insert into app_private.catalogo_comuniazo_runs(import_run_id,season_id,sport_day,snapshot_at,digest,snapshot_hash,permission_ref,result,actor_manager_id)
 values(v_run,p_season,v_day,v_stamp,v_digest,p_catalogo->>'snapshotHash',p_catalogo->>'permissionRef',v_result,p_actor);
 -- La baja del Equipo Malo no es una venta; no genera caja ni traspasos.
 with released as (
   delete from public.roster_ownership o using public.players p
   where o.player_id=p.id and o.owner_kind='bad_team' and not p.active
   returning o.division_id,o.player_id,o.acquired_at
 )
 insert into app_private.catalogo_comuniazo_bajas_equipo_malo(import_run_id,division_id,player_id,acquired_at)
 select v_run,division_id,player_id,acquired_at from released;
 if p_puntos is not null then
   insert into app_private.catalogo_comuniazo_puntos(import_run_id,player_id,accumulated_points)
    select v_run,i.player_id,(a.value->>'points')::int from jsonb_array_elements(p_puntos) a
    join public.provider_player_ids i on i.provider='comuniazo' and i.external_id=a.value->>'externalId';
 end if;
 insert into public.admin_audit(actor_manager_id,action,target_type,target_id,reason,after_data)
 values(p_actor,'catalog_import','season',p_season,'Catálogo deportivo; sin cambios económicos',v_result);
 return v_result;
end; $$;
revoke all on function app_private.importar_catalogo_comuniazo(uuid,jsonb,jsonb,uuid)
 from public,anon,authenticated,service_role,macroliga_runner;
commit;
