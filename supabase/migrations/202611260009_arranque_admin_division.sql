-- Panel de administrador de la propia división, instalado en macroliga-piloto.
-- Requiere el núcleo privado de arranque del propietario.
begin;
create function app_private.admin_exigir(p_division uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_actor uuid;
begin
  select m.id into v_actor from public.managers m join public.teams t on t.manager_id=m.id
    where m.auth_user_id=auth.uid() and m.is_admin and t.status='active' and t.division_id=p_division;
  if not found then raise exception 'Acceso de administración denegado' using errcode='42501'; end if;
  return v_actor;
end; $$;
create function public.macroliga_admin_arranque_estado(p_division uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.admin_exigir(p_division);
  return (select jsonb_build_object('teamCount',(select count(*) from public.teams where division_id=p_division),
    'catalogCount',(select count(*) from public.players),'catalogReady',exists(select 1 from app_private.catalogo_comuniazo_runs where season_id=s.id),
    'wealthCents',s.initial_wealth_cents::text,'maxRoster',d.max_roster,'season',s.code,'seasonStatus',s.status,
    'initialized',exists(select 1 from public.roster_ownership where division_id=p_division),
    'marketPrepared',exists(select 1 from public.market_cycles where division_id=p_division))
    from public.divisions d join public.seasons s on s.id=d.season_id where d.id=p_division);
end; $$;
create function public.macroliga_admin_importar_catalogo(p_division uuid,p_catalogo jsonb,p_puntos jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_season uuid;
begin
 v_actor:=app_private.admin_exigir(p_division);
 -- Este panel solo inicia, nunca sustituye un catálogo utilizado por ligas.
 -- Bloqueos globales en orden compatible con el importador.
 perform 1 from public.divisions order by id for update;
 select season_id into strict v_season from public.divisions where id=p_division;
 perform app_private.admin_arranque_vacio(p_division);
 if jsonb_typeof(p_puntos) is distinct from 'array' then
   raise exception 'El lote inicial requiere puntos completos';end if;
 if exists(select 1 from public.roster_ownership) or exists(select 1 from public.market_cycles)
    or exists(select 1 from public.wallet_entries) or exists(select 1 from public.transfer_operations)
 then raise exception 'La economía ya existe; no modificar el catálogo desde arranque';end if;
 if exists(select 1 from app_private.catalogo_comuniazo_runs) and not exists(
  select 1 from app_private.catalogo_comuniazo_runs r where r.season_id=v_season
  and r.digest=encode(sha256(convert_to(jsonb_build_array(p_catalogo,p_puntos)::text,'UTF8')),'hex')
 ) then raise exception 'Ya existe un catálogo distinto; no sustituirlo desde arranque';end if;
 return app_private.importar_catalogo_comuniazo(v_season,p_catalogo,p_puntos,v_actor);
end; $$;
create function public.macroliga_admin_simular_reparto(p_division uuid,p_wealth bigint,p_slots jsonb,p_min_cash bigint,p_seed text,p_market_date date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid;
begin
 v_actor:=app_private.admin_exigir(p_division);
 return app_private.admin_simular_reparto_core(v_actor,p_division,p_wealth,p_slots,p_min_cash,p_seed,p_market_date);
end; $$;
create function public.macroliga_admin_aplicar_reparto(p_division uuid,p_preview uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid;
begin
 v_actor:=app_private.admin_exigir(p_division);
 return app_private.admin_aplicar_reparto_core(v_actor,p_division,p_preview);
end; $$;
create function public.macroliga_admin_iniciar_todo(
 p_division uuid,p_catalogo jsonb,p_puntos jsonb,p_wealth bigint,p_slots jsonb,
 p_min_cash bigint,p_market_date date,p_request uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;
begin
 v_actor:=app_private.admin_exigir(p_division);
 return app_private.admin_iniciar_todo_core(v_actor,p_division,p_catalogo,p_puntos,p_wealth,p_slots,p_min_cash,p_market_date,p_request);
end; $$;
revoke all on function app_private.admin_exigir(uuid) from public,anon,authenticated,service_role,macroliga_runner;
revoke all on function public.macroliga_admin_arranque_estado(uuid),public.macroliga_admin_importar_catalogo(uuid,jsonb,jsonb),
 public.macroliga_admin_simular_reparto(uuid,bigint,jsonb,bigint,text,date),public.macroliga_admin_aplicar_reparto(uuid,uuid),public.macroliga_admin_iniciar_todo(uuid,jsonb,jsonb,bigint,jsonb,bigint,date,uuid)
 from public,anon,authenticated,service_role,macroliga_runner;
grant execute on function public.macroliga_admin_arranque_estado(uuid),public.macroliga_admin_importar_catalogo(uuid,jsonb,jsonb),
 public.macroliga_admin_simular_reparto(uuid,bigint,jsonb,bigint,text,date),public.macroliga_admin_aplicar_reparto(uuid,uuid),public.macroliga_admin_iniciar_todo(uuid,jsonb,jsonb,bigint,jsonb,bigint,date,uuid) to authenticated;
commit;
