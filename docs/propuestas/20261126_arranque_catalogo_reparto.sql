-- PROPUESTA NO DESPLEGADA. Aplicar únicamente a macroliga-piloto tras
-- autorización expresa de la fuente y del reparto. Nunca Comunio Laviana.
-- Solo inicialización de una base vacía; NO actualizaciones diarias.
-- Sin RPC pública, sin credenciales, sin ejecución automática.
begin;
create table app_private.initialization_runs (
  division_id uuid primary key references public.divisions(id),
  import_run_id uuid not null unique references public.sport_import_runs(id),
  snapshot_hash text not null check(snapshot_hash ~ '^[0-9a-f]{64}$'),
  plan_hash text not null check(plan_hash ~ '^[0-9a-f]{64}$'),
  payload_digest text not null check(payload_digest ~ '^[0-9a-f]{64}$'),
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table app_private.initialization_runs enable row level security;
revoke all on app_private.initialization_runs from public,anon,authenticated,service_role,macroliga_runner;

create function app_private.aplicar_arranque_piloto(p_division uuid,p_snapshot jsonb,p_plan jsonb)
returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare
  v_season text; v_status text; v_wealth bigint; v_max smallint;
  v_count int; v_catalog_count int; v_reserve int; v_min_cash bigint; v_provider text;
  v_gk int; v_def int; v_mid int; v_fwd int; v_positions int[];
  v_run uuid; v_player uuid; v_club uuid; v_team uuid;
  v_prev app_private.initialization_runs%rowtype;
  v_p jsonb; v_t jsonb; v_a jsonb;
  v_value bigint; v_total bigint; v_cash bigint; v_cash_total bigint:=0;
  v_position text; v_active boolean; v_teams uuid[]:=array[]::uuid[];
  v_digest text; v_result jsonb;
begin
  -- El resultado original se identifica por el contenido JSON completo, no
  -- únicamente por la huella declarada por el operador. El CLI recalcula
  -- también la huella canónica y el reparto antes de cualquier aprobación.
  if jsonb_typeof(p_snapshot) is distinct from 'object' or jsonb_typeof(p_plan) is distinct from 'object'
    or p_snapshot->>'kind' is distinct from 'authorized' or p_plan->>'catalogKind' is distinct from 'authorized'
    or p_snapshot->>'schemaVersion' is distinct from '1' or p_plan->>'schemaVersion' is distinct from '1'
    or p_snapshot->>'currency' is distinct from 'EUR' or p_plan->>'mode' is distinct from 'preview'
    or p_plan->>'divisionId' is distinct from p_division::text
    or p_snapshot->>'snapshotHash' is distinct from p_plan->>'snapshotHash'
    or not coalesce(p_snapshot->>'snapshotHash' ~ '^[0-9a-f]{64}$',false)
    or not coalesce(p_plan->>'planHash' ~ '^[0-9a-f]{64}$',false)
    or p_snapshot->>'provider' is distinct from p_plan->>'provider'
    or nullif(btrim(p_snapshot->>'permissionRef'),'') is null
    or jsonb_typeof(p_snapshot->'players') is distinct from 'array'
    or jsonb_typeof(p_plan->'allocations') is distinct from 'array' then
    raise exception 'Catálogo o plan no autorizado/incompatible';
  end if;
  v_digest:=encode(sha256(convert_to(jsonb_build_array(p_snapshot,p_plan)::text,'UTF8')),'hex');
  -- Serializar el arranque: división/temporada, catálogo global, equipos.
  select s.code,s.status,s.initial_wealth_cents,d.max_roster into v_season,v_status,v_wealth,v_max
    from public.divisions d join public.seasons s on s.id=d.season_id
    where d.id=p_division for update of d,s;
  if not found then raise exception 'División inexistente'; end if;
  lock table public.players in share row exclusive mode;
  select * into v_prev from app_private.initialization_runs where division_id=p_division;
  if found then
    if v_prev.payload_digest=v_digest then return v_prev.result; end if;
    raise exception 'División ya inicializada con otro contenido';
  end if;
  if v_status<>'draft' or v_season is distinct from p_snapshot->>'season'
    or v_season is distinct from p_plan->>'season'
    or v_max<16 or v_max is distinct from (p_plan->>'maxRoster')::smallint
    or v_wealth is distinct from (p_plan->>'initialWealthCents')::bigint then
    raise exception 'Configuración de temporada/división cambió';
  end if;
  perform 1 from public.teams where division_id=p_division order by id for update;
  select count(*) into v_count from public.teams where division_id=p_division;
  if v_count<1 or v_count>64 or jsonb_array_length(p_plan->'allocations')<>v_count
    or exists(select 1 from public.teams where division_id=p_division and (status<>'active' or balance_cents<>0))
    or exists(select 1 from public.roster_ownership where division_id=p_division)
    or exists(select 1 from public.wallet_entries w join public.teams t on t.id=w.team_id where t.division_id=p_division)
    or exists(select 1 from public.transfer_operations where division_id=p_division)
    or exists(select 1 from public.market_cycles where division_id=p_division) then
    raise exception 'División no está vacía o cambió su composición';
  end if;
  if exists(select 1 from public.players) or exists(select 1 from public.football_clubs)
    or exists(select 1 from public.sport_import_runs) then
    raise exception 'El catálogo global ya existe: no sobrescribirlo';
  end if;
  v_catalog_count:=jsonb_array_length(p_snapshot->'players');
  if v_catalog_count<15*v_count or v_catalog_count>20000 then raise exception 'Tamaño de catálogo inválido'; end if;
  v_provider:=p_snapshot->>'provider';
  if nullif(btrim(v_provider),'') is null or length(v_provider)>100 then raise exception 'Proveedor inválido'; end if;
  v_reserve:=(p_plan->'rules'->>'reservePlayers')::int;
  v_min_cash:=(p_plan->'rules'->>'minimumCashCents')::bigint;
  v_gk:=(p_plan->'rules'->'slots'->>'GK')::int;
  v_def:=(p_plan->'rules'->'slots'->>'DEF')::int;
  v_mid:=(p_plan->'rules'->'slots'->>'MID')::int;
  v_fwd:=(p_plan->'rules'->'slots'->>'FWD')::int;
  if v_reserve is null or v_reserve not between 0 and 20000 or v_min_cash is null or v_min_cash not between 0 and v_wealth
    or v_gk is null or v_def is null or v_mid is null or v_fwd is null
    or least(v_gk,v_def,v_mid,v_fwd)<0 or v_gk+v_def+v_mid+v_fwd<>15 then
    raise exception 'Reglas de reparto inválidas';
  end if;
  insert into public.sport_import_runs(provider,kind,status,finished_at,item_count)
    values(v_provider,'players','completed',now(),v_catalog_count) returning id into v_run;
  for v_p in select value from jsonb_array_elements(p_snapshot->'players') loop
    if nullif(btrim(v_p->>'externalId'),'') is null or length(v_p->>'externalId')>150
      or nullif(btrim(v_p->>'name'),'') is null or length(v_p->>'name')>200
      or nullif(btrim(v_p->>'club'),'') is null or length(v_p->>'club')>200
      or not coalesce(v_p->>'position' in ('GK','DEF','MID','FWD'),false)
      or jsonb_typeof(v_p->'active') is distinct from 'boolean'
      or not coalesce(v_p->>'marketValueCents' ~ '^(0|[1-9][0-9]{0,18})$',false) then
      raise exception 'Fila deportiva inválida';
    end if;
    v_value:=(v_p->>'marketValueCents')::bigint;
    insert into public.football_clubs(name) values(v_p->>'club')
      on conflict(name) do nothing;
    select id into strict v_club from public.football_clubs where name=v_p->>'club';
    insert into public.players(name,position,club_id,current_market_value_cents,active)
      values(v_p->>'name',v_p->>'position',v_club,v_value,(v_p->>'active')::boolean)
      returning id into v_player;
    insert into public.provider_player_ids(provider,external_id,player_id)
      values(v_provider,v_p->>'externalId',v_player);
    insert into public.player_market_values(player_id,import_run_id,valued_at,amount_cents)
      values(v_player,v_run,(p_snapshot->>'asOf')::timestamptz,v_value);
  end loop;
  if (select count(*) from public.players where active)<15*v_count+v_reserve then
    raise exception 'No queda la reserva de mercado prevista';
  end if;
  for v_t in select value from jsonb_array_elements(p_plan->'allocations') loop
    v_team:=(v_t->>'teamId')::uuid;
    if v_team is null or v_team=any(v_teams)
      or not exists(select 1 from public.teams where id=v_team and division_id=p_division)
      or jsonb_typeof(v_t->'players') is distinct from 'array'
      or jsonb_array_length(v_t->'players')<>15 then
      raise exception 'Equipo ajeno/duplicado o plantilla incorrecta';
    end if;
    v_teams:=array_append(v_teams,v_team);
    v_total:=0; v_positions:=array[0,0,0,0];
    for v_a in select value from jsonb_array_elements(v_t->'players') loop
      select p.id,p.current_market_value_cents,p.position,p.active into v_player,v_value,v_position,v_active
        from public.provider_player_ids i join public.players p on p.id=i.player_id
        where i.provider=v_provider and i.external_id=v_a->>'externalId';
      if not found or not v_active or v_position is distinct from v_a->>'position'
        or v_value is distinct from (v_a->>'marketValueCents')::bigint then
        raise exception 'Asignación no coincide con catálogo';
      end if;
      v_positions[array_position(array['GK','DEF','MID','FWD'],v_position)]:=
        v_positions[array_position(array['GK','DEF','MID','FWD'],v_position)]+1;
      v_total:=v_total+v_value;
      -- PK (division_id,player_id) rechaza jugadores duplicados en división.
      insert into public.roster_ownership(division_id,player_id,owner_kind,team_id)
        values(p_division,v_player,'team',v_team);
    end loop;
    v_cash:=v_wealth-v_total;
    if v_positions is distinct from array[v_gk,v_def,v_mid,v_fwd]
       or v_cash<v_min_cash or v_total is distinct from (v_t->>'rosterValueCents')::bigint
       or v_cash is distinct from (v_t->>'cashCents')::bigint
       or v_wealth is distinct from (v_t->>'wealthCents')::bigint then
      raise exception 'Presupuesto o cuotas no cuadran';
    end if;
    update public.teams set balance_cents=v_cash where id=v_team and division_id=p_division;
    insert into public.wallet_entries(team_id,operation_key,kind,delta_cents,note)
      values(v_team,'initial:'||(p_plan->>'planHash'),'initial',v_cash,'Compensación inicial de patrimonio');
    v_cash_total:=v_cash_total+v_cash;
  end loop;
  v_result:=jsonb_build_object('divisionId',p_division,'teams',v_count,'catalogPlayers',v_catalog_count,
    'assignedPlayers',15*v_count,'totalCashCents',v_cash_total::text,'planHash',p_plan->>'planHash');
  insert into app_private.initialization_runs(division_id,import_run_id,snapshot_hash,plan_hash,payload_digest,result)
    values(p_division,v_run,p_snapshot->>'snapshotHash',p_plan->>'planHash',v_digest,v_result);
  insert into public.admin_audit(action,target_type,target_id,reason,after_data)
    values('initialization','division',p_division,'Reparto inicial autorizado',v_result);
  -- Sin activar temporada, mercado, tareas programadas ni cambios de permisos.
  return v_result;
end;
$$;
revoke all on function app_private.aplicar_arranque_piloto(uuid,jsonb,jsonb)
  from public,anon,authenticated,service_role,macroliga_runner;
commit;
