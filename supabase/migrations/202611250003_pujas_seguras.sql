-- MACROLIGA FASE 1 · acceso seguro a pujas del Computer.
-- PREPARADO PARA REVISIÓN, NO EJECUTADO EN SUPABASE.
-- Este primer corte implementa alta, retirada y consulta de pujas propias.
-- NO implementa aún ventas, cláusulas, resolución/publicación ni cron.
-- Funciones SECURITY DEFINER: propietario previsto = postgres de Supabase.
-- Toda función limita autenticación y campos devueltos, search_path vacío.
begin;

create schema if not exists app_private;
revoke all on schema app_private from PUBLIC, anon, authenticated;

-- Función accesible por PostgREST: no acepta team_id del cliente.
create or replace function public.macroliga_presentar_puja(
  p_lote_id uuid,
  p_importe_centimos bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_division_id uuid;
  v_player_id uuid;
  v_aceptada_en timestamptz;
  v_minimo bigint;
  v_lote_estado text;
  v_ciclo_estado text;
  v_abre timestamptz;
  v_cierra timestamptz;
  v_team_id uuid;
  v_saldo bigint;
  v_max_plantilla smallint;
  v_deuda_porcentaje numeric(6,3);
  v_valor_plantilla bigint;
  v_plantilla_count integer;
  v_pujas_count integer;
  v_total_pujas bigint;
  v_limite bigint;
  v_nueva_puja_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  if p_importe_centimos is null or p_importe_centimos <= 0 then
    raise exception 'La puja debe ser positiva' using errcode = '22023';
  end if;

  select l.division_id, l.player_id, l.minimum_bid_cents, l.status,
         c.status, c.opens_at, c.closes_at
    into v_division_id, v_player_id, v_minimo, v_lote_estado,
         v_ciclo_estado, v_abre, v_cierra
    from public.market_lots l
    join public.market_cycles c on c.id = l.cycle_id
   where l.id = p_lote_id;

  if not found then
    raise exception 'Jugador del mercado no disponible' using errcode = '22023';
  end if;

  -- SERIALIZA todas las altas/retiradas de pujas del mismo manager-equipo.
  select t.id, t.balance_cents, d.max_roster, d.max_debt_percent
    into v_team_id, v_saldo, v_max_plantilla, v_deuda_porcentaje
    from public.teams t
    join public.managers m on m.id = t.manager_id
    join public.divisions d on d.id = t.division_id
   where m.auth_user_id = auth.uid()
     and t.division_id = v_division_id
     and t.status = 'active'
    for update of t;
  if not found then
    raise exception 'Equipo no autorizado para este mercado' using errcode = '42501';
  end if;

  if v_lote_estado <> 'available' or v_ciclo_estado <> 'open'
     or pg_catalog.clock_timestamp() < v_abre
     or pg_catalog.clock_timestamp() >= v_cierra then
    raise exception 'El mercado está cerrado o el futbolista no está disponible' using errcode = '22023';
  end if;

  if exists (select 1 from public.roster_ownership r
             where r.division_id=v_division_id and r.player_id=v_player_id) then
    raise exception 'El futbolista ya tiene propietario en esta división' using errcode='22023';
  end if;

  if p_importe_centimos < v_minimo then
    raise exception 'La puja no alcanza el mínimo permitido' using errcode = '22023';
  end if;

  if exists (select 1 from public.bids b
             where b.lot_id = p_lote_id and b.team_id = v_team_id and b.status='active') then
    raise exception 'Ya hay una puja activa por ese futbolista' using errcode = '23505';
  end if;

  select count(*)::integer,
         coalesce(sum(p.current_market_value_cents),0)::bigint
    into v_plantilla_count, v_valor_plantilla
    from public.roster_ownership r
    join public.players p on p.id=r.player_id
   where r.division_id=v_division_id and r.owner_kind='team' and r.team_id=v_team_id;

  select count(*)::integer, coalesce(sum(b.amount_cents),0)::bigint
    into v_pujas_count,v_total_pujas
    from public.bids b
   where b.team_id=v_team_id and b.division_id=v_division_id and b.status='active';

  if v_plantilla_count + v_pujas_count >= v_max_plantilla then
    raise exception 'No hay plazas libres para otra puja' using errcode='22023';
  end if;

  v_limite := v_saldo + pg_catalog.floor(v_valor_plantilla::numeric * v_deuda_porcentaje / 100)::bigint;
  if v_total_pujas + p_importe_centimos > v_limite then
    raise exception 'La suma de pujas supera el saldo más el crédito máximo' using errcode='22023';
  end if;

  -- El instante registrado es exactamente el que se contrasta con el cierre.
  v_aceptada_en := pg_catalog.clock_timestamp();
  if v_aceptada_en >= v_cierra then
    raise exception 'El mercado acaba de cerrar' using errcode='22023';
  end if;
  insert into public.bids(lot_id,division_id,team_id,amount_cents,accepted_at,status)
  values (p_lote_id,v_division_id,v_team_id,p_importe_centimos,
          v_aceptada_en,'active')
  returning id into v_nueva_puja_id;
  return v_nueva_puja_id;
end;
$$;

create or replace function public.macroliga_retirar_puja(p_puja_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_equipo_id uuid;
  v_estatus text;
  v_lote_estado text;
  v_ciclo_estado text;
  v_abre timestamptz;
  v_cierra timestamptz;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode='28000';
  end if;

  -- Solo el propietario del equipo puede retirar su puja.
  select t.id, b.status, l.status, c.status, c.opens_at, c.closes_at
    into v_equipo_id, v_estatus, v_lote_estado,
         v_ciclo_estado, v_abre, v_cierra
    from public.bids b
    join public.teams t on t.id=b.team_id
    join public.managers m on m.id=t.manager_id
    join public.market_lots l on l.id=b.lot_id
    join public.market_cycles c on c.id=l.cycle_id
   where b.id=p_puja_id and m.auth_user_id=auth.uid()
    for update of t;
  if not found then
    raise exception 'Puja no encontrada' using errcode='42501';
  end if;
  if v_estatus <> 'active' or v_lote_estado <> 'available'
    or v_ciclo_estado <> 'open' or pg_catalog.clock_timestamp() < v_abre
    or pg_catalog.clock_timestamp() >= v_cierra then
    raise exception 'No se puede retirar esta puja fuera del horario de mercado' using errcode='22023';
  end if;

  update public.bids
     set status='withdrawn'
   where id=p_puja_id and team_id=v_equipo_id and status='active';
  return found;
end;
$$;

-- Respuesta reducida: únicamente pujas del propio usuario.
create or replace function public.macroliga_mis_pujas()
returns table(
  puja_id uuid,
  lote_id uuid,
  jugador_id uuid,
  importe_centimos bigint,
  registrada_en timestamptz,
  estado text
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.lot_id, l.player_id, b.amount_cents, b.accepted_at, b.status
  from public.bids b
  join public.teams t on t.id=b.team_id
  join public.managers m on m.id=t.manager_id
  join public.market_lots l on l.id=b.lot_id
  where m.auth_user_id = auth.uid()
  order by b.accepted_at desc;
$$;

-- Permisos: por defecto PostgreSQL permite EXECUTE a PUBLIC.
-- Revocación explícita antes de conceder exclusivamente a authenticated.
revoke all on function public.macroliga_presentar_puja(uuid,bigint) from PUBLIC,anon,authenticated;
revoke all on function public.macroliga_retirar_puja(uuid) from PUBLIC,anon,authenticated;
revoke all on function public.macroliga_mis_pujas() from PUBLIC,anon,authenticated;
grant execute on function public.macroliga_presentar_puja(uuid,bigint) to authenticated;
grant execute on function public.macroliga_retirar_puja(uuid) to authenticated;
grant execute on function public.macroliga_mis_pujas() to authenticated;

commit;
