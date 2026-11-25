-- MACROLIGA FASE 1 · integridad entre divisiones.
-- EJECUTAR SOLO EN macroliga-piloto, una vez revisada la migración 0001.
-- En una base nueva, las columnas division_id se rellenarán sin datos existentes.
-- Nunca ejecutar en Comunio Laviana.
begin;

-- Claves compuestas: impiden asignar jugadores, ofertas o transferencias
-- de una división al equipo de otra división, incluso ante errores del servidor.
alter table public.teams
  add constraint teams_id_division_unique unique (id, division_id);
alter table public.market_cycles
  add constraint market_cycles_id_division_unique unique (id, division_id);
alter table public.gameweeks
  add constraint gameweeks_id_division_unique unique (id, division_id);

alter table public.roster_ownership
  add constraint ownership_team_same_division
  foreign key (team_id, division_id) references public.teams(id, division_id);

alter table public.transfer_operations
  add constraint transfer_seller_same_division
  foreign key (seller_team_id, division_id) references public.teams(id, division_id),
  add constraint transfer_buyer_same_division
  foreign key (buyer_team_id, division_id) references public.teams(id, division_id);

alter table public.roster_events
  add constraint roster_event_team_same_division
  foreign key (team_id, division_id) references public.teams(id, division_id);

alter table public.sale_listings
  add constraint listing_seller_same_division
  foreign key (seller_team_id, division_id) references public.teams(id, division_id);

-- Una oferta dentro de una división solo la puede presentar un equipo de esa división.
alter table public.market_lots add column division_id uuid;
update public.market_lots ml
set division_id = mc.division_id
from public.market_cycles mc
where mc.id = ml.cycle_id;
alter table public.market_lots
  alter column division_id set not null,
  add constraint lot_cycle_same_division
  foreign key (cycle_id,division_id) references public.market_cycles(id,division_id),
  add constraint lot_id_division_unique unique (id,division_id);

alter table public.bids add column division_id uuid;
update public.bids b
set division_id = ml.division_id
from public.market_lots ml
where ml.id = b.lot_id;
alter table public.bids
  alter column division_id set not null,
  add constraint bid_team_same_division
  foreign key (team_id,division_id) references public.teams(id,division_id),
  add constraint bid_lot_same_division
  foreign key (lot_id,division_id) references public.market_lots(id,division_id);

-- Cada retirada libera la puja. Una nueva puja por el mismo lote crea un registro
-- con nuevo instante de recepción (comportamiento técnico provisional).
alter table public.bids drop constraint bids_lot_id_team_id_key;
create unique index bids_only_one_active_per_lot_team
  on public.bids(lot_id,team_id) where status='active';
create index bids_active_team_division_idx
  on public.bids(team_id,division_id) where status='active';

-- Las alineaciones se asocian siempre a equipos de la misma división.
alter table public.lineups add column division_id uuid;
update public.lineups l
set division_id = gw.division_id
from public.gameweeks gw where gw.id = l.gameweek_id;
alter table public.lineups
  alter column division_id set not null,
  add constraint lineup_week_same_division
  foreign key (gameweek_id,division_id) references public.gameweeks(id,division_id),
  add constraint lineup_team_same_division
  foreign key (team_id,division_id) references public.teams(id,division_id);

-- Ofertas de manager: comprador de la misma división que el vendedor.
alter table public.sale_listings
  add constraint listing_id_division_unique unique (id,division_id);
alter table public.manager_offers add column division_id uuid;
update public.manager_offers mo
set division_id = sl.division_id from public.sale_listings sl where sl.id=mo.listing_id;
alter table public.manager_offers
  alter column division_id set not null,
  add constraint manager_offer_same_listing_division
  foreign key (listing_id,division_id) references public.sale_listings(id,division_id),
  add constraint manager_offer_buyer_same_division
  foreign key (buyer_team_id,division_id) references public.teams(id,division_id);

-- Normalizar premios y resultados por división reduce errores de cruce.
alter table public.team_gameweek_scores add column division_id uuid;
update public.team_gameweek_scores s
set division_id = gw.division_id from public.gameweeks gw where gw.id=s.gameweek_id;
alter table public.team_gameweek_scores
  alter column division_id set not null,
  add constraint gameweek_score_week_same_division
  foreign key (gameweek_id,division_id) references public.gameweeks(id,division_id),
  add constraint gameweek_score_team_same_division
  foreign key (team_id,division_id) references public.teams(id,division_id);

alter table public.team_gameweek_awards add column division_id uuid;
update public.team_gameweek_awards a
set division_id = gw.division_id from public.gameweeks gw where gw.id=a.gameweek_id;
alter table public.team_gameweek_awards
  alter column division_id set not null,
  add constraint award_week_same_division
  foreign key (gameweek_id,division_id) references public.gameweeks(id,division_id),
  add constraint award_team_same_division
  foreign key (team_id,division_id) references public.teams(id,division_id);

alter table public.season_honours
  add constraint honour_team_same_division
  foreign key (team_id,division_id) references public.teams(id,division_id);

-- Equipo Malo se modela con owner_kind='bad_team' por división.
-- El Computer NO posee jugadores en roster_ownership por diseño.
commit;
