-- MACROLIGA PILOTO. Recargos fijos del apartado 9 de normas Comunio Laviana.
-- Datos CONSULTADOS en lectura; esta migración no modifica Comunio Laviana.
-- Valores en CENTIMOS. En MACROLIGA las ventas permanecen desactivadas
-- por defecto hasta disponer de una pasarela autenticada con permisos.
begin;

-- El porcentaje anterior ya no se utiliza; conservar su columna histórica
-- sin borrarla, pero impedir que se guarde un porcentaje no aplicable.
alter table app_private.manager_trade_policies
  drop constraint manager_trade_policies_check;
alter table app_private.manager_trade_policies
  add constraint manager_trade_policies_no_percent check(min_sale_percent is null);
comment on column app_private.manager_trade_policies.min_sale_percent
  is 'OBSOLETA: NULL obligatorio. El precio minimo usa recargos fijos segun tramo.';

create or replace function app_private.precio_minimo_venta_manager(p_valor_cents bigint)
returns bigint language plpgsql immutable strict security invoker
set search_path=''
as $$
begin
  if p_valor_cents<=0 then
    raise exception 'Valor de mercado no positivo' using errcode='22023';
  end if;
  -- Fuente expresada en euros completos; no asignar automáticamente
  -- un tramo a valores de mercado que incluyan fracciones de euro.
  if p_valor_cents%100<>0 then
    raise exception 'Precio minimo pendiente para valores con centimos' using errcode='22023';
  end if;
  if p_valor_cents<50000000 then
    return p_valor_cents+20000000;  -- <500.000 EUR: +200.000 EUR
  elsif p_valor_cents<=100000000 then
    return p_valor_cents+30000000;  -- 500.000-1.000.000: +300.000 EUR
  elsif p_valor_cents<=200000000 then
    return p_valor_cents+40000000;  -- 1.000.001-2.000.000: +400.000 EUR
  else
    return p_valor_cents+50000000;  -- >2.000.000: +500.000 EUR
  end if;
end; $$;
revoke all on function app_private.precio_minimo_venta_manager(bigint)
  from public,anon,authenticated,service_role;

create or replace function app_private.aceptar_oferta_manager(
  p_oferta_id uuid,p_clave text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_oferta public.manager_offers%rowtype;
  v_anuncio public.sale_listings%rowtype;
  v_previa public.transfer_operations%rowtype;
  v_valor bigint;
  v_enabled boolean;
  v_minimo bigint;
  v_operacion uuid;
begin
  select * into v_oferta from public.manager_offers where id=p_oferta_id;
  if not found then raise exception 'Oferta de manager inexistente' using errcode='22023'; end if;
  select * into v_anuncio from public.sale_listings where id=v_oferta.listing_id;
  if not found then raise exception 'Anuncio inexistente' using errcode='22023'; end if;

  -- Idempotencia: una clave solo puede identificar ESTA oferta.
  select * into v_previa from public.transfer_operations where idempotency_key=p_clave;
  if found then
    if v_previa.status='committed' and v_previa.kind='manager_sale'
      and v_previa.manager_offer_id=p_oferta_id then
      return v_previa.id;
    end if;
    raise exception 'Clave repetida para otra operación' using errcode='23505';
  end if;

  -- Sin una norma comercial aprobada la función queda cerrada.
  select enabled into v_enabled
    from app_private.manager_trade_policies
   where division_id=v_anuncio.division_id;
  if not found or v_enabled is distinct from true then
    raise exception 'Ventas entre managers no activadas para esta división'
      using errcode='22023';
  end if;
  if v_anuncio.status<>'open' or v_oferta.status<>'pending'
     or v_anuncio.expires_at<=pg_catalog.clock_timestamp()
     or v_anuncio.listed_at>pg_catalog.clock_timestamp() then
    raise exception 'Anuncio u oferta ya no está vigente' using errcode='22023';
  end if;
  if v_oferta.division_id<>v_anuncio.division_id
      or v_oferta.buyer_team_id=v_anuncio.seller_team_id then
    raise exception 'Oferta incompatible con la división o el vendedor' using errcode='22023';
  end if;
  select current_market_value_cents into v_valor
    from public.players where id=v_anuncio.player_id and active;
  if not found or v_valor<=0 then
    raise exception 'Valor de jugador no válido' using errcode='22023';
  end if;
  v_minimo:=app_private.precio_minimo_venta_manager(v_valor);
  if v_oferta.amount_cents < v_minimo
     or (v_anuncio.ask_cents is not null and v_oferta.amount_cents<v_anuncio.ask_cents) then
    raise exception 'La oferta está por debajo del precio mínimo' using errcode='22023';
  end if;
  v_operacion:=app_private._contabilizar_traspaso(
    v_anuncio.division_id,v_anuncio.player_id,v_anuncio.seller_team_id,
    v_oferta.buyer_team_id,'team','team',v_oferta.amount_cents,
    'manager_sale',p_clave
  );
  update public.transfer_operations set manager_offer_id=p_oferta_id
   where id=v_operacion and manager_offer_id is null;
  update public.manager_offers set status='accepted'
   where id=p_oferta_id and status='pending';
  if not found then raise exception 'Oferta modificada simultáneamente' using errcode='40001'; end if;
  update public.manager_offers set status='rejected'
   where listing_id=v_anuncio.id and id<>p_oferta_id and status='pending';
  update public.sale_listings set status='accepted'
   where id=v_anuncio.id and status='open';
  if not found then raise exception 'Anuncio modificado simultáneamente' using errcode='40001'; end if;
  return v_operacion;
end;
$$;
revoke all on function app_private.aceptar_oferta_manager(uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function app_private.aceptar_oferta_manager(uuid,text) to service_role;
commit;
