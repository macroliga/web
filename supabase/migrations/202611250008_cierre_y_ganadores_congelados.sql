-- MACROLIGA PILOTO · Cierre y cálculo congelado antes de las 06:00.
-- EXCLUSIVO macroliga-piloto. No activa cron, usuarios ni app.
begin;
create table app_private.market_winners(
  lot_id uuid primary key references public.market_lots(id),
  cycle_id uuid not null references public.market_cycles(id),
  bid_id uuid not null unique references public.bids(id),
  team_id uuid not null references public.teams(id),
  amount_cents bigint not null check(amount_cents>0),
  accepted_at timestamptz not null,
  submission_order bigint not null,
  captured_at timestamptz not null default pg_catalog.clock_timestamp()
);
create index market_winners_cycle_idx on app_private.market_winners(cycle_id);
revoke all on app_private.market_winners from public,anon,authenticated,service_role;

-- Reemplazo de RPC con bloqueo compartido del ciclo frente al cierre.
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
   where l.id = p_lote_id
   for share of c;

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
  v_ciclo_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode='28000';
  end if;

  -- Tomar el mismo bloqueo de ciclo que al presentar una puja.
  select c.id into v_ciclo_id
    from public.bids b
    join public.teams t on t.id=b.team_id
    join public.managers m on m.id=t.manager_id
    join public.market_lots l on l.id=b.lot_id
    join public.market_cycles c on c.id=l.cycle_id
   where b.id=p_puja_id and m.auth_user_id=auth.uid();
  if not found then raise exception 'Puja no encontrada' using errcode='42501'; end if;
  perform 1 from public.market_cycles c where c.id=v_ciclo_id for share;

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

-- Cierre transaccional: ganadores por importe, hora y secuencia.
create or replace function app_private.cerrar_calcular_ciclo(p_ciclo_id uuid)
returns integer language plpgsql security definer set search_path=''
as $$
declare
  v_ciclo public.market_cycles%rowtype;
  v_lotes integer;
  v_ganadores integer;
begin
  select * into v_ciclo from public.market_cycles
   where id=p_ciclo_id for update;
  if not found then raise exception 'Ciclo inexistente' using errcode='22023'; end if;
  if v_ciclo.status in ('calculated','published') then return 0; end if;
  if v_ciclo.status not in ('open','closed') then
    raise exception 'Ciclo no preparado para el cierre' using errcode='22023';
  end if;
  if pg_catalog.clock_timestamp()<v_ciclo.closes_at then
    raise exception 'No ha llegado la hora de cierre' using errcode='22023';
  end if;
  select count(*)::integer into v_lotes from public.market_lots
    where cycle_id=p_ciclo_id;
  if v_lotes>15 then
    raise exception 'El ciclo tiene más de 15 futbolistas' using errcode='22023';
  end if;
  if exists (
    select 1 from public.bids b
     join public.market_lots l on l.id=b.lot_id
     where l.cycle_id=p_ciclo_id and b.status='active'
       and (b.accepted_at<v_ciclo.opens_at or b.accepted_at>=v_ciclo.closes_at)
  ) then
    raise exception 'Puja activa fuera de la ventana de admisión' using errcode='22023';
  end if;
  insert into app_private.market_winners(
    lot_id,cycle_id,bid_id,team_id,amount_cents,accepted_at,submission_order)
  select distinct on(l.id) l.id,p_ciclo_id,b.id,b.team_id,
    b.amount_cents,b.accepted_at,b.submission_order
    from public.market_lots l
    join public.bids b on b.lot_id=l.id and b.status='active'
   where l.cycle_id=p_ciclo_id and l.status='available'
   order by l.id,b.amount_cents desc,b.accepted_at asc,b.submission_order asc;
  if exists (
    select 1 from public.bids b
    join public.market_lots l on l.id=b.lot_id
    where l.cycle_id=p_ciclo_id and b.status='active' and l.status<>'available'
  ) then
    raise exception 'Pujas sobre lotes no disponibles' using errcode='22023';
  end if;
  select count(*)::integer into v_ganadores
    from app_private.market_winners where cycle_id=p_ciclo_id;
  update public.market_cycles set status='calculated' where id=p_ciclo_id;
  return v_ganadores;
end;
$$;
revoke all on function app_private.cerrar_calcular_ciclo(uuid)
 from public,anon,authenticated,service_role;
grant execute on function app_private.cerrar_calcular_ciclo(uuid) to service_role;
-- A las 06:00, la adjudicación solo utiliza ganadores congelados.
create or replace function app_private.publicar_ciclo(
  p_ciclo_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ciclo public.market_cycles%rowtype;
  v_lote record;
  v_num integer:=0;
begin
  select * into v_ciclo from public.market_cycles
    where id=p_ciclo_id for update;
  if not found then raise exception 'Ciclo inexistente' using errcode='22023'; end if;
  if v_ciclo.status='published' then return 0; end if;
  if v_ciclo.status<>'calculated' or
     pg_catalog.clock_timestamp()<v_ciclo.publishes_at then
    raise exception 'Ciclo aún no publicable' using errcode='22023';
  end if;
  -- El bloqueo de división se toma antes de cualquier operación económica.
  perform 1 from public.divisions where id=v_ciclo.division_id for update;
  for v_lote in
    select l.id as lote_id,l.player_id,l.status as lote_estado,
           w.bid_id as puja_id,w.team_id,w.amount_cents
      from public.market_lots l
      left join app_private.market_winners w
        on w.lot_id=l.id and w.cycle_id=p_ciclo_id
     where l.cycle_id=p_ciclo_id
     order by l.id
  loop
    if v_lote.puja_id is null then
      if exists(select 1 from public.bids b
                where b.lot_id=v_lote.lote_id and b.status='active') then
        raise exception 'Pujas activas sin ganador congelado' using errcode='22023';
      end if;
      continue;
    end if;
    if not exists (
      select 1 from public.bids b
       where b.id=v_lote.puja_id and b.lot_id=v_lote.lote_id
         and b.team_id=v_lote.team_id and b.amount_cents=v_lote.amount_cents
         and b.status='active'
    ) then
      raise exception 'Instantánea de ganador inconsistente' using errcode='22023';
    end if;
    if v_lote.lote_estado<>'available' then
      raise exception 'Lote con ofertas pero estado incorrecto' using errcode='22023';
    end if;
    perform app_private._contabilizar_traspaso(
      v_ciclo.division_id,v_lote.player_id,null,v_lote.team_id,
      'computer','team',v_lote.amount_cents,'market',
      'mercado:'||p_ciclo_id::text||':'||v_lote.lote_id::text
    );
    update public.bids
       set status=case when id=v_lote.puja_id then 'won' else 'lost' end
     where lot_id=v_lote.lote_id and status='active';
    update public.market_lots set status='awarded' where id=v_lote.lote_id;
    v_num:=v_num+1;
  end loop;
  update public.market_cycles set status='published',
         published_at=pg_catalog.clock_timestamp() where id=p_ciclo_id;
  return v_num;
end;
$$;

revoke all on function public.macroliga_presentar_puja(uuid,bigint)
 from public,anon,authenticated,service_role;
revoke all on function public.macroliga_retirar_puja(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.macroliga_presentar_puja(uuid,bigint) to authenticated;
grant execute on function public.macroliga_retirar_puja(uuid) to authenticated;
revoke all on function app_private.publicar_ciclo(uuid)
 from public,anon,authenticated,service_role;
grant execute on function app_private.publicar_ciclo(uuid) to service_role;
commit;
