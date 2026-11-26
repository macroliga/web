-- MACROLIGA PILOTO | 2026-11-26
-- Operaciones de alta limitadas al rol service_role, SIN otorgar acceso directo
-- a tablas privadas. No modifica Comunio Laviana.
begin;

create function public.macroliga_piloto_estado_alta()
returns jsonb
language sql stable security definer set search_path = ''
as $func$
  select pg_catalog.jsonb_build_object(
    'libre', (not exists (select 1 from auth.users)
      and not exists (select 1 from public.competitions)
      and not exists (select 1 from public.seasons)
      and not exists (select 1 from public.divisions)
      and not exists (select 1 from public.managers)
      and not exists (select 1 from public.teams)
      and not exists (select 1 from public.wallet_entries)
      and not exists (select 1 from public.roster_ownership)),
    'usuarios_auth', (select count(*) from auth.users),
    'equipos', (select count(*) from public.teams)
  );
$func$;

create function public.macroliga_piloto_preparar_alta()
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $func$
declare
  v_id_competicion uuid;
  v_id_temporada uuid;
  v_id_division uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(701202611, 16);
  if (public.macroliga_piloto_estado_alta()->>'libre') <> 'true' then
    raise exception 'MACROLIGA ya tiene datos de piloto: alta bloqueada';
  end if;
  insert into public.competitions(code,name)
    values ('MACROLIGA_PILOTO_INVIERNO_2026','MACROLIGA · Piloto de invierno')
    returning id into v_id_competicion;
  insert into public.seasons(competition_id,code,name,status,initial_wealth_cents)
    values (v_id_competicion,'2026_27','Liga piloto invierno 2026/27','draft',7000000000)
    returning id into v_id_temporada;
  insert into public.divisions(season_id,code,name,max_roster,max_debt_percent,points_eur_cents,timezone)
    values (v_id_temporada,'PILOTO','División piloto',16,25,1000000,'Europe/Madrid')
    returning id into v_id_division;
  return pg_catalog.jsonb_build_object('division_id',v_id_division,
    'season_id',v_id_temporada,'competition_id',v_id_competicion);
end;
$func$;

create function public.macroliga_piloto_vincular_entrenador(
  p_division_id uuid, p_auth_id uuid, p_numero integer
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $func$
declare
  v_nombres constant text[] := array[
    'Luis Aragonés', 'Vicente del Bosque', 'Miguel Muñoz', 'Javier Irureta',
    'Johan Cruyff', 'Helenio Herrera', 'Radomir Antić', 'Alfredo Di Stéfano',
    'Alex Ferguson', 'Arsène Wenger', 'Jupp Heynckes', 'Ottmar Hitzfeld',
    'Arrigo Sacchi', 'Fabio Capello', 'Marcello Lippi', 'Carlos Bilardo'
  ];
  v_email text;
  v_metadata jsonb;
  v_nombre text;
  v_manager uuid;
  v_equipo uuid;
begin
  if p_numero is null or p_numero not between 1 and 16 or
     p_division_id is null or p_auth_id is null then
    raise exception 'Datos de entrenador no válidos';
  end if;
  select u.email,u.raw_user_meta_data into v_email,v_metadata
  from auth.users u where u.id = p_auth_id;
  if not found or v_email is distinct from
       ('demo' || pg_catalog.lpad(p_numero::text,2,'0') || '@macroliga.invalid')
       or v_metadata->>'demo' is distinct from 'true' then
    raise exception 'Identidad ficticia no verificada en Supabase Auth';
  end if;
  if not exists (
    select 1 from public.divisions d
    join public.seasons s on s.id=d.season_id
    join public.competitions c on c.id=s.competition_id
    where d.id=p_division_id and d.code='PILOTO' and s.code='2026_27'
      and s.status='draft' and c.code='MACROLIGA_PILOTO_INVIERNO_2026'
  ) then
    raise exception 'División piloto no autorizada';
  end if;
  v_nombre := v_nombres[p_numero];
  insert into public.managers(auth_user_id,display_name,is_admin)
    values (p_auth_id,v_nombre,false) returning id into v_manager;
  insert into public.teams(division_id,manager_id,team_name,balance_cents,status)
    values (p_division_id,v_manager,'Equipo de ' || v_nombre,0,'active')
    returning id into v_equipo;
  return pg_catalog.jsonb_build_object('manager_id',v_manager,'team_id',v_equipo);
end;
$func$;

create function public.macroliga_piloto_revertir_alta(p_division_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $func$
declare
  v_temporada uuid;
  v_competicion uuid;
  v_managers uuid[];
  v_equipos integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(701202611, 16);
  select s.id,c.id into v_temporada,v_competicion
  from public.divisions d
  join public.seasons s on s.id=d.season_id
  join public.competitions c on c.id=s.competition_id
  where d.id=p_division_id and d.code='PILOTO' and s.code='2026_27'
    and s.status='draft' and c.code='MACROLIGA_PILOTO_INVIERNO_2026';
  if not found then
    raise exception 'No se encontró la división piloto exacta para revertir';
  end if;
  select pg_catalog.array_agg(t.manager_id),count(*) into v_managers,v_equipos
    from public.teams t where t.division_id=p_division_id;
  if v_equipos > 16 then raise exception 'Más de 16 equipos; revertir bloqueado'; end if;
  if exists (
    select 1 from public.managers m join public.teams t on t.manager_id=m.id
    join auth.users u on u.id=m.auth_user_id
    where t.division_id=p_division_id and
      (u.email not like 'demo__@macroliga.invalid' or
       u.raw_user_meta_data->>'demo' is distinct from 'true')
  ) then
    raise exception 'Hay equipos no ficticios; revertir bloqueado';
  end if;
  delete from public.teams where division_id=p_division_id;
  if v_managers is not null then
    delete from public.managers where id=any(v_managers);
  end if;
  delete from public.divisions where id=p_division_id;
  delete from public.seasons where id=v_temporada;
  delete from public.competitions where id=v_competicion;
  return pg_catalog.jsonb_build_object('limpieza_base_datos',true,
    'equipos_retirados',v_equipos);
end;
$func$;

revoke all on function public.macroliga_piloto_estado_alta() from public, anon, authenticated;
revoke all on function public.macroliga_piloto_preparar_alta() from public, anon, authenticated;
revoke all on function public.macroliga_piloto_vincular_entrenador(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.macroliga_piloto_revertir_alta(uuid) from public, anon, authenticated;
grant execute on function public.macroliga_piloto_estado_alta() to service_role;
grant execute on function public.macroliga_piloto_preparar_alta() to service_role;
grant execute on function public.macroliga_piloto_vincular_entrenador(uuid,uuid,integer) to service_role;
grant execute on function public.macroliga_piloto_revertir_alta(uuid) to service_role;

commit;
