-- MACROLIGA | Lecturas seguras para la futura PWA (26/11/2026).
-- Solo proyecto macroliga-piloto. No crea usuarios ni modifica movimientos.
-- Seguridad: sin SELECT directo en tablas, identidad tomada de auth.uid().
begin;

-- Solo el manager autenticado consulta su nombre de equipo, saldo y capacidad.
create function public.macroliga_mi_equipo()
returns table (
  equipo_id uuid,
  division_id uuid,
  nombre_division text,
  nombre_equipo text,
  nombre_manager text,
  saldo_centimos bigint,
  jugadores integer,
  valor_plantilla_centimos bigint,
  pujas_activas integer,
  total_pujado_centimos bigint,
  plazas_para_pujar integer,
  limite_economico_centimos bigint,
  margen_pujas_centimos bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $func$
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode='28000';
  end if;

  return query
  select t.id, t.division_id, d.name, t.team_name, m.display_name,
         t.balance_cents, s.n, s.valor, b.n, b.total,
         greatest(0, d.max_roster::integer - s.n - b.n),
         (t.balance_cents + pg_catalog.floor(s.valor::numeric * d.max_debt_percent / 100)::bigint),
         greatest(0::bigint,
           t.balance_cents + pg_catalog.floor(s.valor::numeric * d.max_debt_percent / 100)::bigint - b.total)
  from public.teams t
  join public.managers m on m.id = t.manager_id
  join public.divisions d on d.id = t.division_id
  cross join lateral (
    select count(*)::integer as n,
           coalesce(sum(p.current_market_value_cents), 0)::bigint as valor
    from public.roster_ownership r
    join public.players p on p.id = r.player_id
    where r.division_id = t.division_id and r.team_id = t.id and r.owner_kind = 'team'
  ) s
  cross join lateral (
    select count(*)::integer as n,
           coalesce(sum(x.amount_cents), 0)::bigint as total
    from public.bids x
    where x.division_id = t.division_id and x.team_id = t.id and x.status = 'active'
  ) b
  where m.auth_user_id = auth.uid() and t.status = 'active'
  order by d.name, t.team_name;
end;
$func$;

-- La plantilla de un rival es visible solamente dentro de la misma division.
-- No devuelve saldos, ofertas, pujas, emails ni otros datos privados.
create function public.macroliga_plantilla_equipo(p_equipo_id uuid)
returns table (
  equipo_id uuid,
  division_id uuid,
  jugador_id uuid,
  nombre_jugador text,
  posicion text,
  club text,
  valor_mercado_centimos bigint,
  incorporado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $func$
declare
  v_division_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode='28000';
  end if;
  if p_equipo_id is null then
    raise exception 'Equipo no disponible' using errcode='22023';
  end if;

  select t.division_id into v_division_id
  from public.teams t
  where t.id = p_equipo_id and t.status = 'active';
  if not found then
    raise exception 'Equipo no disponible' using errcode='22023';
  end if;

  if not exists (
    select 1 from public.teams propio
    join public.managers m on m.id = propio.manager_id
    where m.auth_user_id = auth.uid() and propio.division_id = v_division_id
      and propio.status = 'active'
  ) then
    raise exception 'No autorizado para esta division' using errcode='42501';
  end if;

  return query
  select r.team_id, r.division_id, p.id, p.name, p.position,
         fc.name, p.current_market_value_cents, r.acquired_at
  from public.roster_ownership r
  join public.players p on p.id = r.player_id
  left join public.football_clubs fc on fc.id = p.club_id
  where r.division_id = v_division_id and r.team_id = p_equipo_id
    and r.owner_kind = 'team'
  order by p.position, p.name, p.id;
end;
$func$;

-- Evitar concesion por defecto de EXECUTE a PUBLIC / anon.
revoke all on function public.macroliga_mi_equipo() from PUBLIC, anon, authenticated;
revoke all on function public.macroliga_plantilla_equipo(uuid) from PUBLIC, anon, authenticated;
grant execute on function public.macroliga_mi_equipo() to authenticated;
grant execute on function public.macroliga_plantilla_equipo(uuid) to authenticated;

commit;
