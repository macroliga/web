-- MACROLIGA: pasarela de mercado y ventas. No abre ciclos ni habilita políticas.
begin;
create function public.macroliga_operaciones_mercado(p_division_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_team uuid:=app_private.equipo_manager_activo(p_division_id);
 v_cycle public.market_cycles%rowtype; v_open boolean; v_sales boolean;
 v_lots jsonb; v_listings jsonb; v_offers jsonb; v_roster jsonb;
begin
 select * into v_cycle from public.market_cycles c where c.division_id=p_division_id
  and c.status in ('draft','open','closed','calculated') order by c.opens_at desc limit 1;
 v_open:=coalesce(v_cycle.status='open' and statement_timestamp()>=v_cycle.opens_at and statement_timestamp()<v_cycle.closes_at,false);
 v_sales:=v_open and exists(select 1 from app_private.manager_trade_policies where division_id=p_division_id and enabled);
 select coalesce(jsonb_agg(jsonb_build_object('lote_id',l.id,'jugador_id',l.player_id,'minimo',l.minimum_bid_cents::text,
   'puja_id',b.id,'importe',b.amount_cents::text) order by l.id),'[]'::jsonb) into v_lots
 from public.market_lots l left join public.bids b on b.lot_id=l.id and b.team_id=v_team and b.status='active'
 where l.cycle_id=v_cycle.id and l.division_id=p_division_id and l.status='available';
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'jugador',p.name,'posicion',p.position,'vendedor',t.team_name,
    'propia',s.seller_team_id=v_team,'precio',s.ask_cents::text,'vence',s.expires_at,
    'minimo',greatest(s.ask_cents,case when p.active and p.current_market_value_cents>0 and p.current_market_value_cents%100=0
    then app_private.precio_minimo_venta_manager(p.current_market_value_cents) end)::text) order by s.listed_at desc),'[]'::jsonb) into v_listings
 from public.sale_listings s join public.players p on p.id=s.player_id join public.teams t on t.id=s.seller_team_id
 join public.roster_ownership r on r.division_id=s.division_id and r.player_id=s.player_id and r.team_id=s.seller_team_id
 where s.division_id=p_division_id and s.status='open' and s.expires_at>statement_timestamp() and s.listed_at<=statement_timestamp() and p.active;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'anuncio',s.id,'jugador',p.name,'importe',o.amount_cents::text,
   'enviada',o.buyer_team_id=v_team,'comprador',t.team_name) order by o.created_at desc),'[]'::jsonb) into v_offers
 from public.manager_offers o join public.sale_listings s on s.id=o.listing_id and s.division_id=o.division_id
 join public.players p on p.id=s.player_id join public.teams t on t.id=o.buyer_team_id
 where o.division_id=p_division_id and o.status='pending' and s.status='open' and s.expires_at>statement_timestamp()
 and (o.buyer_team_id=v_team or s.seller_team_id=v_team);
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'nombre',p.name,'minimo',app_private.precio_minimo_venta_manager(p.current_market_value_cents)::text) order by p.name),'[]'::jsonb) into v_roster
 from public.roster_ownership r join public.players p on p.id=r.player_id
 where r.division_id=p_division_id and r.team_id=v_team and r.owner_kind='team' and p.active
 and p.current_market_value_cents>0 and p.current_market_value_cents%100=0;
 return jsonb_build_object('estado',v_cycle.status,'abre',v_cycle.opens_at,'cierra',v_cycle.closes_at,
   'pujas_abiertas',v_open,'ventas_abiertas',v_sales,'lotes',v_lots,'anuncios',v_listings,'ofertas',v_offers,'plantilla',v_roster);
end; $$;

-- Una sola pasarela tipada para los anuncios y ofertas. Los IDs no otorgan autoridad.
-- Las ofertas entre managers no reservan saldo: la aceptación transaccional vuelve a validar.
create function public.macroliga_operar_venta(p_division_id uuid,p_accion text,p_objeto uuid,p_importe_centimos bigint default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_team uuid:=app_private.equipo_manager_activo(p_division_id);
 v_cycle public.market_cycles%rowtype; v_listing public.sale_listings%rowtype;
 v_offer public.manager_offers%rowtype; v_min bigint; v_id uuid;
 v_balance bigint; v_debt numeric; v_max int; v_count int; v_value bigint; v_bids int; v_reserved bigint;
begin
 if p_accion is null or p_accion not in ('listar','cancelar','ofertar','retirar','aceptar') or p_objeto is null
 then raise exception 'Operación no válida'; end if;
 if p_accion in ('listar','ofertar','aceptar') then
   select * into v_cycle from public.market_cycles c where c.division_id=p_division_id and c.status='open'
     and c.opens_at<=clock_timestamp() and c.closes_at>clock_timestamp() order by c.opens_at desc limit 1 for share;
   if not found then raise exception 'Mercado cerrado'; end if;
 end if;
 perform 1 from public.divisions where id=p_division_id for update;
 -- Igual orden de bloqueo que la contabilidad y las pujas: ciclo, división, equipos.
 perform 1 from public.teams where division_id=p_division_id order by id for update;
 if not exists(select 1 from public.teams where id=v_team and status='active') then raise exception 'Equipo no disponible'; end if;
 if p_accion in ('listar','ofertar','aceptar') and (
   clock_timestamp()>=v_cycle.closes_at or not exists(select 1 from app_private.manager_trade_policies where division_id=p_division_id and enabled))
 then raise exception 'Ventas entre managers no activadas o mercado cerrado'; end if;
 if p_accion='listar' then
   select app_private.precio_minimo_venta_manager(p.current_market_value_cents) into v_min
   from public.roster_ownership r join public.players p on p.id=r.player_id
   where r.division_id=p_division_id and r.team_id=v_team and r.owner_kind='team' and p.id=p_objeto and p.active;
   if not found then raise exception 'Solo puedes vender jugadores activos de tu plantilla'; end if;
   if p_importe_centimos is null or p_importe_centimos<v_min then raise exception 'Precio inferior al mínimo'; end if;
   if exists(select 1 from public.sale_listings s where s.division_id=p_division_id and s.player_id=p_objeto and s.status='open' and s.expires_at>clock_timestamp())
   then raise exception 'El jugador ya está en venta'; end if;
   if clock_timestamp()>=v_cycle.closes_at then raise exception 'El mercado acaba de cerrar'; end if;
   insert into public.sale_listings(division_id,seller_team_id,player_id,ask_cents,listed_at,expires_at)
    values(p_division_id,v_team,p_objeto,p_importe_centimos,clock_timestamp(),v_cycle.closes_at) returning id into v_id;
   return v_id;
 end if;
 if p_accion in ('retirar','aceptar') then
   select * into v_offer from public.manager_offers where id=p_objeto and division_id=p_division_id for update;
   if not found then raise exception 'Oferta no disponible'; end if;
   select * into v_listing from public.sale_listings where id=v_offer.listing_id and division_id=p_division_id for update;
 else
   select * into v_listing from public.sale_listings where id=p_objeto and division_id=p_division_id for update;
 end if;
 if v_listing.id is null then raise exception 'Anuncio no disponible'; end if;
 if p_accion='cancelar' then
   if v_listing.seller_team_id<>v_team or v_listing.status<>'open' then raise exception 'Anuncio no disponible'; end if;
   update public.sale_listings set status='cancelled' where id=v_listing.id;
   update public.manager_offers set status='rejected' where listing_id=v_listing.id and status='pending';
   return v_listing.id;
 elsif p_accion='retirar' then
   if v_offer.buyer_team_id<>v_team or v_offer.status<>'pending' then raise exception 'Oferta no disponible'; end if;
   update public.manager_offers set status='withdrawn' where id=v_offer.id;
   return v_offer.id;
 elsif p_accion='aceptar' then
   if v_listing.seller_team_id<>v_team then raise exception 'Oferta no disponible'; end if;
   if clock_timestamp()>=v_cycle.closes_at then raise exception 'El mercado acaba de cerrar'; end if;
   return app_private.aceptar_oferta_manager(v_offer.id,'manager-offer:'||v_offer.id::text);
 end if;
 if v_listing.seller_team_id=v_team or v_listing.status<>'open' or v_listing.expires_at<=clock_timestamp() then
   raise exception 'Anuncio no disponible'; end if;
 select greatest(v_listing.ask_cents,app_private.precio_minimo_venta_manager(p.current_market_value_cents)) into v_min
 from public.players p join public.roster_ownership r on r.player_id=p.id
 where p.id=v_listing.player_id and p.active and r.division_id=p_division_id and r.team_id=v_listing.seller_team_id;
 if not found or p_importe_centimos is null or p_importe_centimos<v_min then raise exception 'Oferta inferior al mínimo o jugador no disponible'; end if;
 if exists(select 1 from public.manager_offers where listing_id=v_listing.id and buyer_team_id=v_team and status='pending')
   then raise exception 'Ya tienes una oferta pendiente'; end if;
 select t.balance_cents,d.max_roster,d.max_debt_percent into v_balance,v_max,v_debt from public.teams t join public.divisions d on d.id=t.division_id where t.id=v_team;
 select count(*)::int,coalesce(sum(p.current_market_value_cents),0)::bigint into v_count,v_value
 from public.roster_ownership r join public.players p on p.id=r.player_id where r.division_id=p_division_id and r.team_id=v_team;
 select count(*)::int,coalesce(sum(amount_cents),0)::bigint into v_bids,v_reserved from public.bids
 where division_id=p_division_id and team_id=v_team and status='active';
 if v_count+v_bids>=v_max then raise exception 'No hay plazas libres'; end if;
 if p_importe_centimos+v_reserved>v_balance+floor(v_value::numeric*v_debt/100) then raise exception 'La oferta supera el margen económico'; end if;
 if clock_timestamp()>=v_cycle.closes_at then raise exception 'El mercado acaba de cerrar'; end if;
 insert into public.manager_offers(listing_id,buyer_team_id,division_id,amount_cents) values(v_listing.id,v_team,p_division_id,p_importe_centimos) returning id into v_id;
 return v_id;
end; $$;
revoke all on function public.macroliga_operaciones_mercado(uuid),public.macroliga_operar_venta(uuid,text,uuid,bigint) from public,anon,authenticated,service_role,macroliga_runner;
grant execute on function public.macroliga_operaciones_mercado(uuid),public.macroliga_operar_venta(uuid,text,uuid,bigint) to authenticated;
commit;
