-- MACROLIGA: reparto con valor objetivo y caja mínima efectiva.
begin;
create or replace function app_private.admin_simular_reparto_core(p_actor uuid,p_division uuid,p_wealth bigint,p_slots jsonb,p_min_cash bigint,p_seed text,p_market_date date) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 v_actor uuid; v_season uuid; v_config_wealth bigint; v_max int; v_tz text; v_budget bigint; v_floor bigint; v_ceiling bigint; v_target bigint;
 v_slots int[]; v_size int; v_positions text[]:=array['GK','DEF','MID','FWD'];
 v_teams uuid[]; v_names text[]; v_count int:=16;
 v_total bigint[]; v_perpos int[]; v_owner int[]; v_values bigint[]; v_ids uuid[]; v_pos int[];
 v_best_total bigint[]; v_best_owner int[]; v_best_values bigint[]; v_best_ids uuid[]; v_best_pos int[]; v_reserva uuid[];
 v_best_spread bigint; v_spread bigint; v_min bigint; v_max_value bigint;
 v_sample_ids uuid[]; v_sample_values bigint[]; v_sample_pos int[];
 v_penalty bigint; v_best_penalty bigint; v_distance numeric; v_best_distance numeric; v_idx int;
 v_attempt int; v_p int; v_i int; v_j int; v_k int; v_team int; v_record record; v_ok boolean;
 v_low int; v_high int; v_delta bigint; v_gain numeric; v_best_gain numeric; v_a int; v_b int;
 v_c int;v_d int;v_pair_a int[];v_pair_b int[];v_pair_diff bigint[];v_p1 int;v_p2 int;
 v_original_spread bigint;
 v_alloc jsonb:='[]'; v_market jsonb; v_plan jsonb; v_preview uuid; v_open timestamptz;
begin
 v_actor:=p_actor;
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
 -- Para 70M, banda 50-60M; la caja es un mínimo en efectivo (no
 -- un máximo ni un objetivo exacto). Con 12M, la banda es 50-58M.
 -- Si cambia el patrimonio, mantener la proporción 5/7 a 6/7.
 v_floor:=(p_wealth*5+6)/7;
 v_ceiling:=least(v_budget,(p_wealth*6)/7);
 if v_floor>v_ceiling then
   raise exception 'Caja mínima incompatible con el valor objetivo de plantilla; reduce la caja mínima o revisa el patrimonio';
 end if;
 v_target:=v_floor+(v_ceiling-v_floor)/2;
 select array_agg(r.jugador_id order by r.orden) into v_reserva from app_private.reserva_mercado_inicial(p_division) r;
 if cardinality(v_reserva) is distinct from 15 then raise exception 'Mercado inicial de 15 no disponible';end if;
 if (select count(*) from public.players where active and current_market_value_cents>0)<v_count*v_size+15 then
   raise exception 'Faltan futbolistas activos con valor para plantillas y mercado'; end if;
 for v_p in 1..4 loop
   if (select count(*) from public.players where active and current_market_value_cents between 1 and v_ceiling and position=v_positions[v_p] and not(id=any(v_reserva)))<v_count*v_slots[v_p] then
      raise exception 'Faltan futbolistas elegibles en %',v_positions[v_p];
   end if;
 end loop;
 select array_agg(id order by md5(p_seed||id::text),id),array_agg(team_name order by md5(p_seed||id::text),id)
 into v_teams,v_names from public.teams where division_id=p_division;
 -- Buscar subconjuntos con diferentes bandas de precios. Los primeros
 -- intentos exploran desde los más cotizados hacia el listado completo;
 -- los segundos exploran hacia los más baratos. No se premia un equipo
 -- de bajo valor por tener menor dispersión.
 for v_attempt in 1..64 loop
   v_total:=array_fill(0::bigint,array[v_count]); v_perpos:=array_fill(0,array[v_count*4]);
   v_owner:='{}';v_values:='{}';v_ids:='{}';v_pos:='{}';v_ok:=true;
   v_sample_ids:='{}';v_sample_values:='{}';v_sample_pos:='{}';
   for v_p in 1..4 loop
     for v_record in
       with ranked as (
         select id,current_market_value_cents val,
          row_number() over(order by current_market_value_cents desc,id) rn,
          count(*) over() n
         from public.players where active and current_market_value_cents between 1 and v_ceiling
          and position=v_positions[v_p] and not(id=any(v_reserva))
       ), sample as (
         select id,val from ranked where
          (v_attempt<=32 and rn<=v_count*v_slots[v_p]+(n-v_count*v_slots[v_p])*(v_attempt-1)/31)
          or (v_attempt>32 and rn>(n-v_count*v_slots[v_p])*(v_attempt-33)/31)
         order by md5(p_seed||':'||v_attempt||':'||id::text),id
         limit v_count*v_slots[v_p]
       ) select * from sample
     loop
       v_sample_ids:=array_append(v_sample_ids,v_record.id);
       v_sample_values:=array_append(v_sample_values,v_record.val);
       v_sample_pos:=array_append(v_sample_pos,v_p);
     end loop;
   end loop;
   if cardinality(v_sample_ids)<>v_count*v_size then continue;end if;
   -- La media del subconjunto debe permitir la banda de todos los equipos.
   if (select sum(x) from unnest(v_sample_values) x) not between v_floor*v_count and v_ceiling*v_count then continue;end if;
   -- Repartir de mayor a menor precio globalmente, siempre respetando
   -- cuotas de posición por equipo y techo de plantilla/caja.
   for v_record in select u.id,u.val,u.pos from unnest(v_sample_ids,v_sample_values,v_sample_pos) u(id,val,pos) order by u.val desc,u.id loop
     v_team:=null;
     for v_i in 1..v_count loop
       v_idx:=(v_i-1)*4+v_record.pos;
       if v_perpos[v_idx]<v_slots[v_record.pos] and v_total[v_i]+v_record.val<=v_ceiling
         and (v_team is null or v_total[v_i]<v_total[v_team]) then v_team:=v_i;end if;
     end loop;
     if v_team is null then v_ok:=false;exit;end if;
     v_idx:=(v_team-1)*4+v_record.pos;
     v_total[v_team]:=v_total[v_team]+v_record.val;v_perpos[v_idx]:=v_perpos[v_idx]+1;
     v_owner:=array_append(v_owner,v_team);v_values:=array_append(v_values,v_record.val);
     v_ids:=array_append(v_ids,v_record.id);v_pos:=array_append(v_pos,v_record.pos);
   end loop;
   if not v_ok then continue;end if;
   select max(x)-min(x),greatest(0,v_floor-min(x)),abs(sum(x)-v_target*v_count)
    into v_spread,v_penalty,v_distance from unnest(v_total) x;
   -- Primero cumplir la banda, después acercar el valor medio al centro,
   -- y finalmente reducir al máximo la dispersión entre plantillas.
   if v_best_spread is null or (v_penalty,v_distance,v_spread)<(v_best_penalty,v_best_distance,v_best_spread) then
     v_best_spread:=v_spread;v_best_penalty:=v_penalty;v_best_distance:=v_distance;
     v_best_total:=v_total;v_best_owner:=v_owner;v_best_values:=v_values;v_best_ids:=v_ids;v_best_pos:=v_pos;
   end if;
 end loop;
 if v_best_spread is null then raise exception 'No se encontró un reparto dentro de la banda de valor objetivo; ajustar patrimonio, caja o cuotas'; end if;
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
 select max(x)-min(x),min(x),max(x) into v_best_spread,v_min,v_max_value from unnest(v_best_total) x;
 if v_min<v_floor or v_max_value>v_ceiling then
   raise exception 'No se encontró un reparto dentro de la banda de valor objetivo; ajustar patrimonio, caja o cuotas';
 end if;
 for v_i in 1..v_count loop
   v_alloc:=v_alloc||jsonb_build_array(jsonb_build_object('teamId',v_teams[v_i],'teamName',v_names[v_i],
     'players',(select jsonb_agg(jsonb_build_object('id',v_best_ids[n],'name',p.name,'position',v_positions[v_best_pos[n]],'valueCents',v_best_values[n]::text) order by v_best_ids[n]) from generate_subscripts(v_best_ids,1) n join public.players p on p.id=v_best_ids[n] where v_best_owner[n]=v_i),
     'rosterValueCents',v_best_total[v_i]::text,'cashCents',(p_wealth-v_best_total[v_i])::text,'wealthCents',p_wealth::text));
 end loop;
 select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'position',p.position,'valueCents',p.current_market_value_cents::text) order by r.n)
 into v_market from unnest(v_reserva) with ordinality r(id,n) join public.players p on p.id=r.id;
 if jsonb_array_length(v_market) is distinct from 15 then raise exception 'Reserva insuficiente para mercado'; end if;
 v_plan:=jsonb_build_object('planVersion',2,'minimumRosterValueCents',v_floor::text,'maximumRosterValueCents',v_ceiling::text,'targetRosterValueCents',v_target::text,
   'wealthCents',p_wealth::text,'minimumCashCents',p_min_cash::text,'slots',p_slots,'marketDate',p_market_date,
   'rosterSpreadCents',v_best_spread::text,'greedySpreadCents',v_original_spread::text,'allocations',v_alloc,'marketPlayers',v_market,'seed',p_seed);
 -- La simulación no cambia plantillas, patrimonio ni mercado. Solo guarda
 -- una propuesta privada, inmutable para el cliente y caducable.
 delete from app_private.admin_repartos where actor is not distinct from v_actor and division_id=p_division and applied is null;
 insert into app_private.admin_repartos(division_id,actor,fingerprint,plan)
 values(p_division,v_actor,app_private.admin_huella(p_division),v_plan) returning id into v_preview;
 return v_plan||jsonb_build_object('previewId',v_preview);
end; $$;
create or replace function app_private.admin_aplicar_reparto_core(p_actor uuid,p_division uuid,p_preview uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 v_actor uuid; v_rec app_private.admin_repartos%rowtype; v_plan jsonb; v_season uuid; v_tz text;
 v_team jsonb; v_player jsonb; v_team_id uuid; v_wealth bigint; v_cash bigint; v_total bigint;
 v_market uuid; v_date date; v_open timestamptz; v_close timestamptz; v_publish timestamptz; v_result jsonb; v_old_wealth bigint;
begin
 v_actor:=p_actor;
 select d.season_id,d.timezone,s.initial_wealth_cents into strict v_season,v_tz,v_old_wealth
 from public.divisions d join public.seasons s on s.id=d.season_id where d.id=p_division for update of d,s;
 lock table public.players in share mode;
 perform 1 from public.teams where division_id=p_division order by id for update;
 select * into v_rec from app_private.admin_repartos where id=p_preview and division_id=p_division and actor is not distinct from v_actor for update;
 if not found then raise exception 'Simulación inexistente o ajena' using errcode='42501'; end if;
 if v_rec.applied is not null then return v_rec.applied;end if;
 perform app_private.admin_arranque_vacio(p_division);
 if v_rec.expires_at<=clock_timestamp() or v_rec.fingerprint is distinct from app_private.admin_huella(p_division) then
    raise exception 'Simulación caducada o catálogo/configuración modificados; volver a simular';end if;
 v_plan:=v_rec.plan;
 if v_plan->>'planVersion' is distinct from '2' then
   raise exception 'Simulación anterior al criterio de valor de plantilla; volver a simular';
 end if;
 v_wealth:=(v_plan->>'wealthCents')::bigint;
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
   if v_cash<(v_plan->>'minimumCashCents')::bigint or v_cash is distinct from (v_team->>'cashCents')::bigint
      or v_total<(v_plan->>'minimumRosterValueCents')::bigint or v_total>(v_plan->>'maximumRosterValueCents')::bigint then
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
 values(v_actor,'initial_distribution','division',p_division,case when v_actor is null then 'Arranque por operador propietario; mercado en borrador' else 'Reparto confirmado; mercado en borrador' end,jsonb_build_object('wealthCents',v_old_wealth::text),v_result);
 return v_result;
end; $$;
revoke all on function app_private.admin_simular_reparto_core(uuid,uuid,bigint,jsonb,bigint,text,date),app_private.admin_aplicar_reparto_core(uuid,uuid,uuid)
 from public,anon,authenticated,service_role,macroliga_runner;
commit;
