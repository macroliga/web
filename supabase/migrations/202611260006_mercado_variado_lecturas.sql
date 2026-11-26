-- Selección de 15 para MACROLIGA. SIN modificar titularidades, caja ni ciclos.
begin;
create function app_private.seleccionar_mercado_variado(
 p_division uuid,p_semilla text,p_excluir uuid[] default '{}',p_arrastrados uuid[] default '{}'
) returns table(jugador_id uuid,orden integer)
language plpgsql stable security invoker set search_path='' as $$
declare v_ids uuid[]:=coalesce(p_arrastrados,'{}');v_inicio integer:=cardinality(coalesce(p_arrastrados,'{}'));
 v_id uuid;v_npos integer;
begin
 if p_semilla is null or length(p_semilla) not between 1 and 200 or v_inicio>15
 or exists(select 1 from unnest(v_ids) i group by i having count(*)>1)
 or array_position(v_ids,null::uuid) is not null
 or not exists(select 1 from public.divisions where id=p_division) then
   raise exception 'Selección de mercado inválida';end if;
 if exists(select 1 from unnest(v_ids) i left join public.players p on p.id=i
   where p.id is null or not p.active or p.current_market_value_cents<=0 or exists(
     select 1 from public.roster_ownership o where o.division_id=p_division and o.player_id=i)) then
   raise exception 'Arrastres de mercado no elegibles';end if;
 -- Primero llenar cada puesto ausente, después acercarse a 2/5/5/3.
 -- Se conservan todos los lotes del segundo día; no se fuerza una baja.
 while cardinality(v_ids)<15 loop
   with quotas(pos,target) as (values('GK',2),('DEF',5),('MID',5),('FWD',3)),
   counts as (select q.pos,q.target,(select count(*)::int from public.players p where p.id=any(v_ids) and p.position=q.pos) n from quotas q)
   select p.id into v_id from public.players p join counts c on c.pos=p.position
   where p.active and p.current_market_value_cents>0
     and not(p.id=any(v_ids)) and not(p.id=any(coalesce(p_excluir,'{}')))
     and not exists(select 1 from public.roster_ownership o where o.division_id=p_division and o.player_id=p.id)
   order by (c.n=0) desc,(c.target-c.n) desc,c.n,md5(p_semilla||':'||p.id::text),p.id limit 1;
   if not found then raise exception 'No hay 15 jugadores elegibles para el mercado';end if;
   v_ids:=array_append(v_ids,v_id);
 end loop;
 select count(distinct p.position) into v_npos from public.players p where p.id=any(v_ids);
 if v_npos<>4 then raise exception 'No se puede cubrir las cuatro posiciones conservando los arrastres';end if;
 return query select u.id,u.n::int from unnest(v_ids) with ordinality u(id,n) where u.n>v_inicio order by u.n;
end; $$;
revoke all on function app_private.seleccionar_mercado_variado(uuid,text,uuid[],uuid[])
 from public,anon,authenticated,service_role,macroliga_runner;

-- Reserva virtual estable para la misma descarga y división. Se usa tanto
-- en la vista previa como en el reparto inicial; no crea lotes anticipados.
create function app_private.reserva_mercado_inicial(p_division uuid)
returns table(jugador_id uuid,orden integer)
language plpgsql stable security invoker set search_path='' as $$
declare v_seed text;
begin
 select r.digest||':'||d.id::text into v_seed
 from public.divisions d join app_private.catalogo_comuniazo_runs r on r.season_id=d.season_id
 where d.id=p_division order by r.sport_day desc limit 1;
 if not found then return;end if;
 return query select s.jugador_id,s.orden from app_private.seleccionar_mercado_variado(p_division,v_seed) s;
end; $$;
revoke all on function app_private.reserva_mercado_inicial(uuid) from public,anon,authenticated,service_role,macroliga_runner;

create function public.macroliga_mercado_visible(p_division_id uuid)
returns table (
 jugador_id uuid,nombre_jugador text,posicion text,club text,valor_mercado_centimos text,
 puntos_acumulados integer,estado text,dia_mercado integer,precio_minimo_centimos text
)
language plpgsql stable security definer set search_path='' as $$
declare v_season uuid;v_ciclo uuid;v_status text;
begin
 select d.season_id into v_season from public.teams t join public.managers m on m.id=t.manager_id
 join public.divisions d on d.id=t.division_id
 where t.division_id=p_division_id and m.auth_user_id=auth.uid() and t.status='active';
 if not found then raise exception 'No autorizado para esta división' using errcode='42501';end if;
 select c.id,c.status into v_ciclo,v_status from public.market_cycles c
 where c.division_id=p_division_id order by c.opens_at desc limit 1;
 if found and v_status not in ('draft','open') then return;end if;
 if v_ciclo is null and exists(select 1 from public.roster_ownership where division_id=p_division_id) then return;end if;
 return query
 with visible as (
  select l.player_id id,l.day_number::int dia,l.minimum_bid_cents price,v_status state
  from public.market_lots l where l.cycle_id=v_ciclo and l.division_id=p_division_id and l.status='available'
  union all
  select s.jugador_id,1,p.current_market_value_cents,'preview'
  from app_private.reserva_mercado_inicial(p_division_id) s join public.players p on p.id=s.jugador_id
  where v_ciclo is null
 )
 select p.id,p.name,p.position,c.name,p.current_market_value_cents::text,pt.accumulated_points,v.state,v.dia,v.price::text
 from visible v join public.players p on p.id=v.id left join public.football_clubs c on c.id=p.club_id
 left join lateral (
   select cp.accumulated_points from app_private.catalogo_comuniazo_puntos cp
    join app_private.catalogo_comuniazo_runs cr on cr.import_run_id=cp.import_run_id
    where cp.player_id=p.id and cr.season_id=v_season order by cr.sport_day desc limit 1
 ) pt on true
 where p.active and not exists(select 1 from public.roster_ownership o where o.division_id=p_division_id and o.player_id=p.id)
 order by case p.position when 'GK' then 1 when 'DEF' then 2 when 'MID' then 3 else 4 end,p.name,p.id;
end; $$;
revoke all on function public.macroliga_mercado_visible(uuid) from public,anon,authenticated,service_role,macroliga_runner;
grant execute on function public.macroliga_mercado_visible(uuid) to authenticated;
commit;
