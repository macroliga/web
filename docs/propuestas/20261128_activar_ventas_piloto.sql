-- Activación de ventas exclusivamente en MACROLIGA piloto.
-- No modifica el motor nocturno, las cláusulas ni las fórmulas de precio.
do $guard$
declare n int;
begin
  select count(*) into n from public.divisions d
  join public.seasons s on s.id=d.season_id join public.competitions c on c.id=s.competition_id
  where c.code='MACROLIGA_PILOTO_INVIERNO_2026' and s.code='2026_27' and s.status='active'
    and d.code='PILOTO';
  if n<>1 then raise exception 'División piloto no identificada de forma única';end if;
  if exists(select 1 from app_private.manager_trade_policies p
    join public.divisions d on d.id=p.division_id
    join public.seasons s on s.id=d.season_id join public.competitions c on c.id=s.competition_id
    where c.code='MACROLIGA_PILOTO_INVIERNO_2026' and s.code='2026_27' and d.code='PILOTO')
  then raise exception 'Política de ventas modificada desde la revisión';end if;
end
$guard$;
insert into app_private.manager_trade_policies(division_id,min_sale_percent,enabled)
select d.id,null,true from public.divisions d
join public.seasons s on s.id=d.season_id join public.competitions c on c.id=s.competition_id
where c.code='MACROLIGA_PILOTO_INVIERNO_2026' and s.code='2026_27' and s.status='active' and d.code='PILOTO';

-- Cotizar únicamente un jugador activo de la propia plantilla. Sin escrituras.
create function public.macroliga_cotizar_venta_equipo_malo(p_division_id uuid,p_jugador_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $body$
declare
 v_team uuid:=app_private.equipo_manager_activo(p_division_id);
 v_zona text;v_valor bigint;
begin
 select d.timezone into v_zona from public.divisions d
 join public.seasons s on s.id=d.season_id join public.competitions c on c.id=s.competition_id
 join app_private.manager_trade_policies q on q.division_id=d.id and q.enabled
 where d.id=p_division_id and c.code='MACROLIGA_PILOTO_INVIERNO_2026' and s.code='2026_27'
   and s.status='active' and d.code='PILOTO';
 if not found then return jsonb_build_object('disponible',false,'motivo','Ventas no habilitadas en esta división');end if;
 if (statement_timestamp() at time zone v_zona)::time < time '12:00' then
   return jsonb_build_object('disponible',false,'motivo','Equipo Malo cerrado hasta las 12:00');
 end if;
 select p.current_market_value_cents into v_valor
 from public.roster_ownership r join public.players p on p.id=r.player_id
 where r.division_id=p_division_id and r.team_id=v_team and r.owner_kind='team'
   and p.id=p_jugador_id and p.active and p.current_market_value_cents>0;
 if not found then return jsonb_build_object('disponible',false,'motivo','Jugador no disponible en tu plantilla');end if;
 return jsonb_build_object('disponible',true,'importe_centimos',v_valor::text);
end
$body$;

-- Confirma precio, propietario, horario y saldo mediante el motor transaccional existente.
create function public.macroliga_vender_equipo_malo(p_division_id uuid,p_jugador_id uuid,p_importe_centimos bigint,p_clave uuid)
returns uuid language plpgsql security definer set search_path='' as $body$
declare
 v_team uuid:=app_private.equipo_manager_activo(p_division_id);
 v_key text;v_zona text;v_valor bigint;v_prev public.transfer_operations%rowtype;v_id uuid;
begin
 if p_clave is null or p_jugador_id is null or p_importe_centimos is null or p_importe_centimos<=0
 then raise exception 'Venta no válida' using errcode='22023';end if;
 v_key:='venta-equipo-malo:'||v_team||':'||p_clave;
 -- Mismo bloqueo de división y equipo que el motor económico.
 perform 1 from public.divisions where id=p_division_id for update;
 select d.timezone into v_zona from public.divisions d
 join public.seasons s on s.id=d.season_id join public.competitions c on c.id=s.competition_id
 join app_private.manager_trade_policies q on q.division_id=d.id and q.enabled
 where d.id=p_division_id and c.code='MACROLIGA_PILOTO_INVIERNO_2026' and s.code='2026_27'
   and s.status='active' and d.code='PILOTO';
 if not found then raise exception 'Ventas no habilitadas en esta división' using errcode='42501';end if;
 perform 1 from public.teams where id=v_team and division_id=p_division_id and status='active' for update;
 if not found then raise exception 'Equipo no disponible' using errcode='42501';end if;
 select * into v_prev from public.transfer_operations where idempotency_key=v_key;
 if found then
   if v_prev.status='committed' and v_prev.kind='bad_team_sale' and v_prev.division_id=p_division_id
      and v_prev.player_id=p_jugador_id and v_prev.seller_team_id=v_team and v_prev.seller_kind='team'
      and v_prev.buyer_kind='bad_team' and v_prev.amount_cents=p_importe_centimos then return v_prev.id;end if;
   raise exception 'Clave de venta repetida con otros datos' using errcode='23505';
 end if;
 if (clock_timestamp() at time zone v_zona)::time<time '12:00'
 then raise exception 'Equipo Malo cerrado hasta las 12:00' using errcode='22023';end if;
 select p.current_market_value_cents into v_valor
 from public.roster_ownership r join public.players p on p.id=r.player_id
 where r.division_id=p_division_id and r.team_id=v_team and r.owner_kind='team'
   and p.id=p_jugador_id and p.active and p.current_market_value_cents>0
 for share of p;
 if not found then raise exception 'Jugador no disponible en tu plantilla' using errcode='42501';end if;
 if p_importe_centimos<>v_valor
 then raise exception 'El valor ha cambiado. Consulta y confirma el nuevo precio' using errcode='22023';end if;
 v_id:=app_private.vender_equipo_malo(v_team,p_jugador_id,v_key);
 -- La venta confirmada retira anuncios y rechaza ofertas pendientes del mismo futbolista.
 update public.manager_offers o set status='rejected' from public.sale_listings l
 where o.listing_id=l.id and o.division_id=p_division_id and l.division_id=p_division_id
   and l.player_id=p_jugador_id and l.seller_team_id=v_team and l.status='open' and o.status='pending';
 update public.sale_listings set status='cancelled'
 where division_id=p_division_id and seller_team_id=v_team and player_id=p_jugador_id and status='open';
 return v_id;
end
$body$;

revoke all on function public.macroliga_cotizar_venta_equipo_malo(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.macroliga_vender_equipo_malo(uuid,uuid,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function public.macroliga_cotizar_venta_equipo_malo(uuid,uuid) to authenticated;
grant execute on function public.macroliga_vender_equipo_malo(uuid,uuid,bigint,uuid) to authenticated;
