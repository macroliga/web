-- PROPUESTA, NO DESPLEGADA. Alternativa al arranque combinado anterior.
-- Exclusivamente macroliga-piloto. Catálogo global inicial, reparto por división.
-- Requiere la migración 202611260004_catalogo_comuniazo_privado.sql.
begin;
create table app_private.admin_repartos (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id),
  actor uuid not null references public.managers(id),
  fingerprint text not null,
  plan jsonb not null,
  expires_at timestamptz not null default (now()+interval '30 minutes'),
  applied jsonb
);
alter table app_private.admin_repartos enable row level security;
revoke all on app_private.admin_repartos from public,anon,authenticated,service_role,macroliga_runner;

create function app_private.admin_exigir(p_division uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_actor uuid;
begin
  select m.id into v_actor from public.managers m join public.teams t on t.manager_id=m.id
    where m.auth_user_id=auth.uid() and m.is_admin and t.status='active' and t.division_id=p_division;
  if not found then raise exception 'Acceso de administración denegado' using errcode='42501'; end if;
  return v_actor;
end; $$;

create function app_private.admin_arranque_vacio(p_division uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.divisions d join public.seasons s on s.id=d.season_id
    where d.id=p_division and s.status='draft')
    or (select count(*) from public.teams where division_id=p_division)<>16
    or exists(select 1 from public.teams where division_id=p_division and (status<>'active' or balance_cents<>0))
    or exists(select 1 from public.roster_ownership where division_id=p_division)
    or exists(select 1 from public.wallet_entries w join public.teams t on t.id=w.team_id where t.division_id=p_division)
    or exists(select 1 from public.transfer_operations where division_id=p_division)
    or exists(select 1 from public.market_cycles where division_id=p_division) then
    raise exception 'El reparto exige 16 equipos activos y vacíos, temporada en borrador y ningún mercado';
  end if;
end; $$;

create function app_private.admin_huella(p_division uuid) returns text
language sql stable security invoker set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_array(
   (select jsonb_build_array(d.id,d.max_roster,d.timezone,s.id,s.status,s.initial_wealth_cents)
      from public.divisions d join public.seasons s on s.id=d.season_id where d.id=p_division),
   (select jsonb_agg(jsonb_build_array(id,team_name,status,balance_cents) order by id) from public.teams where division_id=p_division),
   (select jsonb_agg(jsonb_build_array(id,position,active,current_market_value_cents,name,club_id) order by id) from public.players),
   (select digest from app_private.catalogo_comuniazo_runs order by sport_day desc limit 1)
 )::text,'UTF8')),'hex');
$$;

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

create function public.macroliga_admin_importar_catalogo(p_division uuid,p_catalogo jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_season uuid;
begin
 v_actor:=app_private.admin_exigir(p_division);
 select season_id into strict v_season from public.divisions where id=p_division;
 -- Mismo núcleo de propietario que las descargas. No hay dos rutas de escritura.
 return app_private.importar_catalogo_comuniazo(v_season,p_catalogo,null,v_actor);
end; $$;

-- Simulación: 24 muestras deterministas, asignación descendente al equipo
-- menos valorado por posición y optimización posterior por permutas.
create function public.macroliga_admin_simular_reparto(p_division uuid,p_wealth bigint,p_slots jsonb,p_min_cash bigint,p_seed text,p_market_date date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid; v_season uuid; v_config_wealth bigint; v_max int; v_tz text; v_budget bigint;
 v_slots int[]; v_size int; v_positions text[]:=array['GK','DEF','MID','FWD'];
 v_teams uuid[]; v_names text[]; v_count int:=16;
 v_total bigint[]; v_perpos int[]; v_owner int[]; v_values bigint[]; v_ids uuid[]; v_pos int[];
 v_best_total bigint[]; v_best_owner int[]; v_best_values bigint[]; v_best_ids uuid[]; v_best_pos int[];
 v_best_spread bigint; v_spread bigint; v_min bigint; v_max_value bigint;
 v_attempt int; v_p int; v_i int; v_j int; v_k int; v_team int; v_record record; v_ok boolean;
 v_low int; v_high int; v_delta bigint; v_gain numeric; v_best_gain numeric; v_a int; v_b int;
 v_c int;v_d int;v_pair_a int[];v_pair_b int[];v_pair_diff bigint[];v_p1 int;v_p2 int;
 v_original_spread bigint;
 v_alloc jsonb:='[]'; v_market jsonb; v_plan jsonb; v_preview uuid; v_open timestamptz;
begin
 v_actor:=app_private.admin_exigir(p_division);
 select d.season_id,s.initial_wealth_cents,d.max_roster,d.timezone into strict v_season,v_config_wealth,v_max,v_tz
   from public.divisions d join public.seasons s on s.id=d.season_id where d.id=p_division for update of d,s;
 lock table public.players in share mode;
 perform 1 from public.teams where division_id=p_division order by id for update;
 perform app_private.admin_arranque_vacio(p_division);
 if not exists(select 1 from app_private.catalogo_comuniazo_runs where season_id=v_season) then raise exception 'Cargar primero el catálogo autorizado'; end if;
 if p_wealth is null or p_wealth not between 1 and 1000000000000 or p_min_cash is null or p_min_cash not between 0 and p_wealth
  or jsonb_typeof(p_slots) is distinct from 'object' or p_seed is null or length(p_seed) not between 1 and 100
  or p_market_date is null then raise exception 'Configuración inválida'; end if;
 if exists(select 1 from jsonb_object_keys(p_slots) k where not(k=any(v_positions)))
  or exists(select 1 from unnest(v_positions) p where not coalesce(p_slots->>p ~ '^[1-9][0-9]?$',false)) then
   raise exception 'Cuotas de posición inválidas'; end if;
 v_slots:=array[(p_slots->>'GK')::int,(p_slots->>'DEF')::int,(p_slots->>'MID')::int,(p_slots->>'FWD')::int];
 v_size:=v_slots[1]+v_slots[2]+v_slots[3]+v_slots[4];
 if v_size not between 11 and v_max-1 then raise exception 'Plantilla inicial: al menos 11 y una plaza libre'; end if;
 if p_wealth<>v_config_wealth and exists(select 1 from public.divisions where season_id=v_season and id<>p_division) then
   raise exception 'Patrimonio compartido con otras divisiones; no modificar desde este panel'; end if;
 v_open:=(p_market_date::timestamp+time '06:00') at time zone v_tz;
 if v_open<=clock_timestamp() then raise exception 'Elegir una fecha futura para el mercado en borrador'; end if;
 v_budget:=p_wealth-p_min_cash;
 if (select count(*) from public.players where active and current_market_value_cents>0)<v_count*v_size+15 then
   raise exception 'Faltan futbolistas activos con valor para plantillas y mercado'; end if;
 for v_p in 1..4 loop
   if (select count(*) from public.players where active and current_market_value_cents between 1 and v_budget and position=v_positions[v_p])<v_count*v_slots[v_p] then
      raise exception 'Faltan futbolistas elegibles en %',v_positions[v_p];
   end if;
 end loop;
 select array_agg(id order by md5(p_seed||id::text),id),array_agg(team_name order by md5(p_seed||id::text),id)
 into v_teams,v_names from public.teams where division_id=p_division;
 for v_attempt in 1..24 loop
   v_total:=array_fill(0::bigint,array[v_count]); v_owner:='{}';v_values:='{}';v_ids:='{}';v_pos:='{}';v_ok:=true;
   for v_p in 1..4 loop
     v_perpos:=array_fill(0,array[v_count]);
     -- Último intento: conjunto más barato. Otros intentos muestrean
     -- subconjuntos cada vez más económicos si el patrimonio es ajustado.
     for v_record in
       with ranked as (
         select id,current_market_value_cents val,row_number() over(order by current_market_value_cents,id) rn,
         count(*) over() n
         from public.players where active and current_market_value_cents between 1 and v_budget and position=v_positions[v_p]
       ), sample as (
         select id,val from ranked where rn<=greatest(v_count*v_slots[v_p],n*(24-v_attempt)/23)
         order by case when v_attempt=24 then rn else 0 end,md5(p_seed||':'||v_attempt||':'||id::text),id
         limit v_count*v_slots[v_p]
       ) select * from sample order by val desc,id
     loop
       v_team:=null;
       for v_i in 1..v_count loop
         if v_perpos[v_i]<v_slots[v_p] and v_total[v_i]+v_record.val<=v_budget
            and (v_team is null or v_total[v_i]<v_total[v_team]) then v_team:=v_i; end if;
       end loop;
       if v_team is null then v_ok:=false;exit;end if;
       v_total[v_team]:=v_total[v_team]+v_record.val;v_perpos[v_team]:=v_perpos[v_team]+1;
       v_owner:=array_append(v_owner,v_team);v_values:=array_append(v_values,v_record.val);
       v_ids:=array_append(v_ids,v_record.id);v_pos:=array_append(v_pos,v_p);
     end loop;
     if not v_ok then exit;end if;
   end loop;
   if not v_ok then continue;end if;
   select max(x)-min(x) into v_spread from unnest(v_total) x;
   if v_best_spread is null or v_spread<v_best_spread then
     v_best_spread:=v_spread;v_best_total:=v_total;v_best_owner:=v_owner;v_best_values:=v_values;v_best_ids:=v_ids;v_best_pos:=v_pos;
   end if;
 end loop;
 if v_best_spread is null then raise exception 'No se encontró un reparto viable: ajustar patrimonio o cuotas'; end if;
 -- Refinamiento: hasta 120 rondas de una o dos permutas simultáneas
 -- de igual posición entre extremos. Mejora estricta de dispersión;
 -- el valor conjunto, cuotas y presupuesto máximo no se alteran.
 v_original_spread:=v_best_spread;
 for v_k in 1..120 loop
   select min(x),max(x) into v_min,v_max_value from unnest(v_best_total) x;
   if v_max_value=v_min then exit;end if;
   v_low:=array_position(v_best_total,v_min);v_high:=array_position(v_best_total,v_max_value);
   v_best_gain:=0;v_a:=null;v_b:=null;v_c:=null;v_d:=null;
   v_pair_a:='{}';v_pair_b:='{}';v_pair_diff:='{}';
   for v_i in 1..array_length(v_best_ids,1) loop
     if v_best_owner[v_i]<>v_high then continue;end if;
     for v_j in 1..array_length(v_best_ids,1) loop
       if v_best_owner[v_j]<>v_low or v_best_pos[v_i]<>v_best_pos[v_j] then continue;end if;
       v_delta:=v_best_values[v_i]-v_best_values[v_j];
       v_pair_a:=array_append(v_pair_a,v_i);v_pair_b:=array_append(v_pair_b,v_j);v_pair_diff:=array_append(v_pair_diff,v_delta);
       if v_delta<=0 or v_delta>=v_max_value-v_min then continue;end if;
       v_gain:=2::numeric*v_delta*(v_max_value-v_min-v_delta);
       if v_gain>v_best_gain then v_best_gain:=v_gain;v_a:=v_i;v_b:=v_j;end if;
     end loop;
   end loop;
   -- Dos intercambios con desplazamientos opuestos permiten corregir
   -- diferencias pequeñas sin exigir un precio casi idéntico.
   for v_p1 in 1..coalesce(array_length(v_pair_a,1),0) loop
     for v_p2 in v_p1+1..coalesce(array_length(v_pair_a,1),0) loop
       if v_pair_a[v_p1]=v_pair_a[v_p2] or v_pair_b[v_p1]=v_pair_b[v_p2] then continue;end if;
       v_delta:=v_pair_diff[v_p1]+v_pair_diff[v_p2];
       if v_delta<=0 or v_delta>=v_max_value-v_min then continue;end if;
       v_gain:=2::numeric*v_delta*(v_max_value-v_min-v_delta);
       if v_gain>v_best_gain then
         v_best_gain:=v_gain;v_a:=v_pair_a[v_p1];v_b:=v_pair_b[v_p1];v_c:=v_pair_a[v_p2];v_d:=v_pair_b[v_p2];
       end if;
     end loop;
   end loop;
   if v_a is null then exit;end if;
   v_delta:=v_best_values[v_a]-v_best_values[v_b];
   v_best_owner[v_a]:=v_low;v_best_owner[v_b]:=v_high;
   if v_c is not null then
     v_delta:=v_delta+v_best_values[v_c]-v_best_values[v_d];
     v_best_owner[v_c]:=v_low;v_best_owner[v_d]:=v_high;
   end if;
   v_best_total[v_high]:=v_best_total[v_high]-v_delta;v_best_total[v_low]:=v_best_total[v_low]+v_delta;
 end loop;
 select max(x)-min(x) into v_best_spread from unnest(v_best_total) x;
 for v_i in 1..v_count loop
   v_alloc:=v_alloc||jsonb_build_array(jsonb_build_object('teamId',v_teams[v_i],'teamName',v_names[v_i],
     'players',(select jsonb_agg(jsonb_build_object('id',v_best_ids[n],'name',p.name,'position',v_positions[v_best_pos[n]],'valueCents',v_best_values[n]::text) order by v_best_ids[n]) from generate_subscripts(v_best_ids,1) n join public.players p on p.id=v_best_ids[n] where v_best_owner[n]=v_i),
     'rosterValueCents',v_best_total[v_i]::text,'cashCents',(p_wealth-v_best_total[v_i])::text,'wealthCents',p_wealth::text));
 end loop;
 select jsonb_agg(jsonb_build_object('id',id,'name',name,'position',position,'valueCents',current_market_value_cents::text) order by rank,id)
 into v_market from (select id,name,position,current_market_value_cents,md5(p_seed||':market:'||id::text) rank
  from public.players where active and current_market_value_cents>0 and not(id=any(v_best_ids))
  order by rank,id limit 15) m;
 if jsonb_array_length(v_market) is distinct from 15 then raise exception 'Reserva insuficiente para mercado'; end if;
 v_plan:=jsonb_build_object('wealthCents',p_wealth::text,'minimumCashCents',p_min_cash::text,'slots',p_slots,'marketDate',p_market_date,
   'rosterSpreadCents',v_best_spread::text,'greedySpreadCents',v_original_spread::text,'allocations',v_alloc,'marketPlayers',v_market,'seed',p_seed);
 -- La simulación no cambia plantillas, patrimonio ni mercado. Solo guarda
 -- una propuesta privada, inmutable para el cliente y caducable.
 delete from app_private.admin_repartos where actor=v_actor and division_id=p_division and applied is null;
 insert into app_private.admin_repartos(division_id,actor,fingerprint,plan)
 values(p_division,v_actor,app_private.admin_huella(p_division),v_plan) returning id into v_preview;
 return v_plan||jsonb_build_object('previewId',v_preview);
end; $$;

create function public.macroliga_admin_aplicar_reparto(p_division uuid,p_preview uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid; v_rec app_private.admin_repartos%rowtype; v_plan jsonb; v_season uuid; v_tz text;
 v_team jsonb; v_player jsonb; v_team_id uuid; v_wealth bigint; v_cash bigint; v_total bigint;
 v_market uuid; v_date date; v_open timestamptz; v_close timestamptz; v_publish timestamptz; v_result jsonb; v_old_wealth bigint;
begin
 v_actor:=app_private.admin_exigir(p_division);
 select d.season_id,d.timezone,s.initial_wealth_cents into strict v_season,v_tz,v_old_wealth
 from public.divisions d join public.seasons s on s.id=d.season_id where d.id=p_division for update of d,s;
 lock table public.players in share mode;
 perform 1 from public.teams where division_id=p_division order by id for update;
 select * into v_rec from app_private.admin_repartos where id=p_preview and division_id=p_division and actor=v_actor for update;
 if not found then raise exception 'Simulación inexistente o ajena' using errcode='42501'; end if;
 if v_rec.applied is not null then return v_rec.applied;end if;
 perform app_private.admin_arranque_vacio(p_division);
 if v_rec.expires_at<=clock_timestamp() or v_rec.fingerprint is distinct from app_private.admin_huella(p_division) then
    raise exception 'Simulación caducada o catálogo/configuración modificados; volver a simular';end if;
 v_plan:=v_rec.plan;v_wealth:=(v_plan->>'wealthCents')::bigint;
 if v_wealth<>v_old_wealth and exists(select 1 from public.divisions where season_id=v_season and id<>p_division) then
   raise exception 'No modificar patrimonio compartido';end if;
 v_date:=(v_plan->>'marketDate')::date;
 v_open:=(v_date::timestamp+time '06:00') at time zone v_tz;
 v_close:=((v_date+1)::timestamp+time '01:00') at time zone v_tz;
 v_publish:=((v_date+1)::timestamp+time '06:00') at time zone v_tz;
 if v_open<=clock_timestamp() then raise exception 'Fecha de mercado ya pasada; volver a simular';end if;
 update public.seasons set initial_wealth_cents=v_wealth where id=v_season;
 for v_team in select value from jsonb_array_elements(v_plan->'allocations') loop
   v_team_id:=(v_team->>'teamId')::uuid;v_total:=0;
   for v_player in select value from jsonb_array_elements(v_team->'players') loop
     insert into public.roster_ownership(division_id,player_id,owner_kind,team_id)
       values(p_division,(v_player->>'id')::uuid,'team',v_team_id);
     v_total:=v_total+(v_player->>'valueCents')::bigint;
   end loop;
   v_cash:=v_wealth-v_total;
   if v_cash<(v_plan->>'minimumCashCents')::bigint or v_cash is distinct from (v_team->>'cashCents')::bigint then
     raise exception 'Error de patrimonio';end if;
   update public.teams set balance_cents=v_cash where id=v_team_id and division_id=p_division;
   if not found then raise exception 'Equipo ajeno';end if;
   insert into public.wallet_entries(team_id,operation_key,kind,delta_cents,note)
     values(v_team_id,'initial:'||p_preview,'initial',v_cash,'Compensación inicial de patrimonio');
 end loop;
 insert into public.market_cycles(division_id,opens_at,closes_at,publishes_at,status)
 values(p_division,v_open,v_close,v_publish,'draft') returning id into v_market;
 for v_player in select value from jsonb_array_elements(v_plan->'marketPlayers') loop
   if exists(select 1 from public.roster_ownership where division_id=p_division and player_id=(v_player->>'id')::uuid) then
     raise exception 'Futbolista de mercado ya asignado';end if;
   insert into public.market_lots(cycle_id,division_id,player_id,minimum_bid_cents,day_number,status)
   values(v_market,p_division,(v_player->>'id')::uuid,(v_player->>'valueCents')::bigint,1,'available');
 end loop;
 v_result:=jsonb_build_object('previewId',p_preview,'teams',jsonb_array_length(v_plan->'allocations'),
    'marketId',v_market,'marketStatus','draft','marketPlayers',15,'wealthCents',v_wealth::text);
 update app_private.admin_repartos set applied=v_result where id=p_preview;
 insert into public.admin_audit(actor_manager_id,action,target_type,target_id,reason,before_data,after_data)
 values(v_actor,'initial_distribution','division',p_division,'Reparto confirmado; mercado en borrador',jsonb_build_object('wealthCents',v_old_wealth::text),v_result);
 return v_result;
end; $$;

revoke all on function app_private.admin_exigir(uuid),app_private.admin_arranque_vacio(uuid),app_private.admin_huella(uuid)
 from public,anon,authenticated,service_role,macroliga_runner;
revoke all on function public.macroliga_admin_arranque_estado(uuid),public.macroliga_admin_importar_catalogo(uuid,jsonb),
 public.macroliga_admin_simular_reparto(uuid,bigint,jsonb,bigint,text,date),public.macroliga_admin_aplicar_reparto(uuid,uuid)
 from public,anon,authenticated,service_role,macroliga_runner;
grant execute on function public.macroliga_admin_arranque_estado(uuid),public.macroliga_admin_importar_catalogo(uuid,jsonb),
 public.macroliga_admin_simular_reparto(uuid,bigint,jsonb,bigint,text,date),public.macroliga_admin_aplicar_reparto(uuid,uuid) to authenticated;
commit;
