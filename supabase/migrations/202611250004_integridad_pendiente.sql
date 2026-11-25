-- MACROLIGA FASE 2 · Refuerzo preventivo de integridad.
-- REVISIÓN LOCAL: no ejecutada en Supabase.
-- Destino exclusivo macroliga-piloto. No usar en Comunio Laviana.
-- Requiere migraciones 0001 a 0003 previamente aplicadas.
begin;

-- Dos pujas admitidas en el mismo microsegundo necesitan desempate estable.
-- La secuencia la asigna PostgreSQL; no depende del reloj del móvil.
-- Los valores son para registros nuevos (la liga aún no tiene pujas reales).
alter table public.bids
  add column submission_order bigint generated always as identity;
create unique index bids_submission_order_unique
  on public.bids(submission_order);
create index bids_winner_lookup_idx
  on public.bids(lot_id, amount_cents desc, accepted_at, submission_order)
  where status='active';

-- La representación de una transferencia debe concordar con sus actores.
alter table public.transfer_operations
  add constraint transfer_seller_kind_consistent check (
    (seller_kind='team' and seller_team_id is not null) or
    (seller_kind in ('computer','bad_team') and seller_team_id is null)
  ),
  add constraint transfer_buyer_kind_consistent check (
    (buyer_kind='team' and buyer_team_id is not null) or
    (buyer_kind in ('computer','bad_team') and buyer_team_id is null)
  ),
  add constraint transfer_cannot_sell_to_self check (
    seller_team_id is null or buyer_team_id is null or seller_team_id <> buyer_team_id
  );

-- Postgres considera NULL distinto en UNIQUE tradicional: impedir la
-- duplicación de eventos con team_id NULL (Computer/Equipo Malo).
alter table public.roster_events
  drop constraint roster_events_operation_id_player_id_action_team_id_key;
alter table public.roster_events
  add constraint roster_events_unique_action
  unique nulls not distinct (operation_id,player_id,action,team_id);

commit;
