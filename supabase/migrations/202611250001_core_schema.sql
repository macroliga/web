-- MACROLIGA - BORRADOR de esquema inicial 0.1 (25/11/2026)
-- NO EJECUTADO. NO LISTO PARA PRODUCCION: faltan RPC transaccionales,
-- permisos de vistas para consulta autorizada y pruebas RLS multiusuario.
-- Supabase previsto: macroliga-piloto. NUNCA ejecutar sobre Comunio Laviana.
-- Todo el dinero se expresa en CENTIMOS con BIGINT. Fechas en timestamptz UTC.

begin;
create extension if not exists pgcrypto;

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id),
  code text not null,
  name text not null,
  status text not null default 'draft' check (status in ('draft','active','finished')),
  begins_on date,
  ends_on date,
  initial_wealth_cents bigint not null default 7000000000 check (initial_wealth_cents >= 0),
  unique(competition_id,code)
);

create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id),
  code text not null,
  name text not null,
  max_roster smallint not null default 16 check (max_roster between 1 and 30),
  max_debt_percent numeric(6,3) not null default 25.000 check (max_debt_percent between 0 and 100),
  points_eur_cents bigint not null default 1000000 check (points_eur_cents >= 0),
  timezone text not null default 'Europe/Madrid',
  unique(season_id,code)
);

create table public.managers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id),
  display_name text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  manager_id uuid not null references public.managers(id),
  team_name text not null,
  balance_cents bigint not null default 0,
  status text not null default 'active' check(status in ('active','suspended','finished')),
  created_at timestamptz not null default now(),
  unique(division_id,manager_id)
);
create index teams_division_idx on public.teams(division_id);

create table public.football_clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position text not null check(position in ('GK','DEF','MID','FWD')),
  club_id uuid references public.football_clubs(id),
  current_market_value_cents bigint not null default 0 check(current_market_value_cents >= 0),
  active boolean not null default true
);
create index players_club_idx on public.players(club_id);

create table public.provider_player_ids (
  provider text not null,
  external_id text not null,
  player_id uuid not null references public.players(id),
  primary key(provider,external_id),
  unique(provider,player_id)
);

create table public.sport_import_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  kind text not null check(kind in ('players','prices','fixtures','points')),
  status text not null check(status in ('running','completed','failed','rejected')),
  fetched_at timestamptz not null default now(),
  finished_at timestamptz,
  item_count int not null default 0 check(item_count >= 0),
  error_summary text
);

create table public.player_market_values (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id),
  import_run_id uuid not null references public.sport_import_runs(id),
  valued_at timestamptz not null,
  amount_cents bigint not null check(amount_cents >= 0),
  unique(player_id,import_run_id)
);

create table public.roster_ownership (
  division_id uuid not null references public.divisions(id),
  player_id uuid not null references public.players(id),
  owner_kind text not null check(owner_kind in ('team','bad_team')),
  team_id uuid references public.teams(id),
  acquired_at timestamptz not null default now(),
  primary key(division_id,player_id),
  constraint ownership_kind_matches_team check(
    (owner_kind='team' and team_id is not null) or
    (owner_kind='bad_team' and team_id is null)
  )
);
create index ownership_team_idx on public.roster_ownership(team_id);
-- Cross-division consistency (team.division_id == ownership.division_id)
-- requires composite FK or a hardened server trigger before production.

create table public.wallet_entries (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id),
  operation_key text not null,
  kind text not null check(kind in ('initial','purchase','sale','clause','bad_team','points','award','correction','admin')),
  delta_cents bigint not null,
  created_at timestamptz not null default now(),
  note text,
  unique(team_id,operation_key)
);
create index wallet_entries_team_idx on public.wallet_entries(team_id,created_at desc);
-- balance_cents is denormalised: transaction-only updates will be essential.

create table public.transfer_operations (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  player_id uuid not null references public.players(id),
  seller_team_id uuid references public.teams(id),
  buyer_team_id uuid references public.teams(id),
  seller_kind text not null check(seller_kind in ('team','computer','bad_team')),
  buyer_kind text not null check(buyer_kind in ('team','computer','bad_team')),
  amount_cents bigint not null check(amount_cents >= 0),
  kind text not null check(kind in ('market','manager_sale','computer_sale','bad_team_sale','clause','bad_team_clause','admin_correction')),
  effective_at timestamptz,
  status text not null default 'pending' check(status in ('pending','committed','reversed')),
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create table public.roster_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.transfer_operations(id),
  player_id uuid not null references public.players(id),
  division_id uuid not null references public.divisions(id),
  team_id uuid references public.teams(id),
  action text not null check(action in ('acquire','release')),
  occurred_at timestamptz not null default now(),
  unique(operation_id,player_id,action,team_id)
);

create table public.market_cycles (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  publishes_at timestamptz not null,
  status text not null default 'draft' check(status in ('draft','open','closed','calculated','published','failed')),
  published_at timestamptz,
  unique(division_id,opens_at),
  check(opens_at < closes_at and closes_at < publishes_at)
);

create table public.market_lots (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.market_cycles(id),
  player_id uuid not null references public.players(id),
  minimum_bid_cents bigint not null check(minimum_bid_cents >= 0),
  day_number smallint not null default 1 check(day_number in (1,2)),
  status text not null default 'available' check(status in ('available','awarded','expired')),
  unique(cycle_id,player_id)
);

create table public.bids (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.market_lots(id),
  team_id uuid not null references public.teams(id),
  amount_cents bigint not null check(amount_cents > 0),
  accepted_at timestamptz not null default now(),
  status text not null default 'active' check(status in ('active','withdrawn','won','lost')),
  unique(lot_id,team_id)
);
create index bids_team_active_idx on public.bids(team_id,status);
-- Neither bids table nor bid_amount should be directly readable by client roles.

create table public.sale_listings (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  seller_team_id uuid not null references public.teams(id),
  player_id uuid not null references public.players(id),
  ask_cents bigint check(ask_cents >= 0),
  listed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  computer_offer_cents bigint check(computer_offer_cents >= 0),
  computer_offer_at timestamptz,
  status text not null default 'open' check(status in ('open','accepted','expired','cancelled')),
  check(expires_at > listed_at)
);

create table public.manager_offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.sale_listings(id),
  buyer_team_id uuid not null references public.teams(id),
  amount_cents bigint not null check(amount_cents > 0),
  created_at timestamptz not null default now(),
  status text not null default 'pending' check(status in ('pending','accepted','rejected','withdrawn'))
);

create table public.clause_rules (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id),
  from_value_cents bigint not null,
  to_value_cents bigint,
  multiplier numeric(12,6) not null check(multiplier >= 1),
  source_ref text,
  version int not null default 1,
  check(from_value_cents >= 0 and (to_value_cents is null or to_value_cents >= from_value_cents))
);

create table public.clause_windows (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  reason text,
  check(closes_at > opens_at)
);

create table public.gameweeks (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  number int not null check(number >= 1),
  kind text not null default 'normal' check(kind in ('normal','extra')),
  lineup_lock_at timestamptz,
  status text not null default 'scheduled' check(status in ('scheduled','live','pending_points','final','corrected')),
  finalized_at timestamptz,
  unique(division_id,number,kind)
);

create table public.fixtures (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  home_club_id uuid references public.football_clubs(id),
  away_club_id uuid references public.football_clubs(id),
  kickoff_at timestamptz,
  status text not null default 'scheduled',
  official_round text,
  last_synced_at timestamptz not null default now(),
  unique(provider,external_id)
);

create table public.gameweek_fixtures (
  gameweek_id uuid not null references public.gameweeks(id),
  fixture_id uuid not null references public.fixtures(id),
  primary key(gameweek_id,fixture_id)
);

create table public.player_fixture_points (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id),
  fixture_id uuid not null references public.fixtures(id),
  provider text not null,
  points integer not null,
  revision integer not null default 1 check(revision >= 1),
  imported_at timestamptz not null default now(),
  unique(player_id,fixture_id,provider,revision)
);

create table public.lineups (
  id uuid primary key default gen_random_uuid(),
  gameweek_id uuid not null references public.gameweeks(id),
  team_id uuid not null references public.teams(id),
  saved_at timestamptz not null default now(),
  locked_at timestamptz,
  version integer not null default 1,
  unique(gameweek_id,team_id)
);

create table public.lineup_slots (
  lineup_id uuid not null references public.lineups(id),
  slot smallint not null check(slot between 1 and 11),
  player_id uuid references public.players(id),
  primary key(lineup_id,slot),
  unique(lineup_id,player_id)
);
-- NULL player_id represents an empty slot. Full XI empty has special 0-point rule.

create table public.team_gameweek_scores (
  gameweek_id uuid not null references public.gameweeks(id),
  team_id uuid not null references public.teams(id),
  points integer not null,
  revision int not null default 1 check(revision >= 1),
  status text not null default 'provisional' check(status in ('provisional','final')),
  zero_due_to_debt boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(gameweek_id,team_id)
);

create table public.team_gameweek_awards (
  gameweek_id uuid not null references public.gameweeks(id),
  team_id uuid not null references public.teams(id),
  points_award_cents bigint not null default 0,
  position_award_cents bigint not null default 0,
  revision int not null default 1,
  settled_at timestamptz,
  primary key(gameweek_id,team_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_manager_id uuid not null references public.managers(id),
  category text not null check(category in ('clause')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null unique,
  kind text not null,
  state text not null check(state in ('pending','running','done','failed')),
  scheduled_at timestamptz not null,
  completed_at timestamptz,
  attempts integer not null default 0,
  error_summary text
);

create table public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_manager_id uuid references public.managers(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  reason text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table public.season_honours (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  team_id uuid not null references public.teams(id),
  honour text not null,
  notes text,
  unique(division_id,team_id,honour)
);

-- Defensa por defecto: activar RLS para TODAS las tablas de aplicación.
-- Sin policies y sin GRANT, anon/authenticated no tienen acceso directo.
-- RPC de servidor, vistas de consulta y policies se diseñarán y probarán
-- explícitamente, evitando que sea posible modificar saldo, pujas, etc.
do $$
declare t record;
begin
  for t in select tablename from pg_tables
           where schemaname='public' and tablename in (
           'competitions','seasons','divisions','managers','teams','football_clubs','players',
           'provider_player_ids','sport_import_runs','player_market_values','roster_ownership',
           'wallet_entries','transfer_operations','roster_events','market_cycles','market_lots',
           'bids','sale_listings','manager_offers','clause_rules','clause_windows','gameweeks',
           'fixtures','gameweek_fixtures','player_fixture_points','lineups','lineup_slots',
           'team_gameweek_scores','team_gameweek_awards','notifications','background_jobs',
           'admin_audit','season_honours')
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;

commit;
