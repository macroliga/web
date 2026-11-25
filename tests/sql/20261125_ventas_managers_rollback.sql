-- MACROLIGA · pruebas integradas de ofertas entre managers.
-- Ejecutar SOLO en macroliga-piloto. Todos los registros ficticios se revierten
-- mediante excepción centinela del propio bloque DO. No crea cuentas reales.
DO $prueba$
DECLARE
  u1 uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid(); u3 uuid:=gen_random_uuid();
  comp uuid:=gen_random_uuid(); temp uuid:=gen_random_uuid(); divi uuid:=gen_random_uuid();
  m1 uuid:=gen_random_uuid(); m2 uuid:=gen_random_uuid(); m3 uuid:=gen_random_uuid();
  t1 uuid:=gen_random_uuid(); t2 uuid:=gen_random_uuid(); t3 uuid:=gen_random_uuid();
  p1 uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); p3 uuid:=gen_random_uuid();
  listing uuid:=gen_random_uuid(); offer_low uuid:=gen_random_uuid();
  offer_ok uuid:=gen_random_uuid(); op uuid; listing2 uuid:=gen_random_uuid(); offer_buyback uuid:=gen_random_uuid();
  listing3 uuid:=gen_random_uuid(); offer_poor uuid:=gen_random_uuid();
  computer_listing uuid:=gen_random_uuid();
  cycle uuid:=gen_random_uuid(); player_fict uuid; lot_id uuid;
  i integer; t1_before bigint; t2_before bigint;
BEGIN
  insert into auth.users(id,email,aud,role) values
    (u1,'test-a-'||u1::text||'@example.invalid','authenticated','authenticated'),
    (u2,'test-b-'||u2::text||'@example.invalid','authenticated','authenticated'),
    (u3,'test-c-'||u3::text||'@example.invalid','authenticated','authenticated');
  insert into public.competitions(id,code,name)
   values(comp,'test-m-'||comp::text,'Competición de ensayo');
  insert into public.seasons(id,competition_id,code,name)
   values(temp,comp,'prueba','Temporada ficticia');
  insert into public.divisions(id,season_id,code,name)
   values(divi,temp,'prueba','División ficticia');
  insert into public.managers(id,auth_user_id,display_name) values
   (m1,u1,'Vendedor prueba'),(m2,u2,'Comprador prueba'),(m3,u3,'Otro comprador prueba');
  insert into public.teams(id,division_id,manager_id,team_name,balance_cents) values
   (t1,divi,m1,'Vendedor',1000000000),(t2,divi,m2,'Comprador',2000000000),(t3,divi,m3,'Sin saldo',0);
  insert into public.wallet_entries(team_id,operation_key,kind,delta_cents) values
   (t1,'seed-'||t1::text,'initial',1000000000),
   (t2,'seed-'||t2::text,'initial',2000000000);
  insert into public.players(id,name,position,current_market_value_cents) values
   (p1,'Ficticio Uno','DEF',300000000),
   (p2,'Ficticio Dos','MID',400000000),
   (p3,'Ficticio Tres','GK',100000000);
  insert into public.roster_ownership(division_id,player_id,owner_kind,team_id)
   values(divi,p1,'team',t1),(divi,p2,'team',t1),(divi,p3,'team',t2);
  insert into public.sale_listings(id,division_id,seller_team_id,player_id,listed_at,expires_at,status)
   values(listing,divi,t1,p1,now()-interval '1 hour',now()+interval '1 day','open');
  insert into public.manager_offers(id,listing_id,division_id,buyer_team_id,amount_cents,status) values
    (offer_low,listing,divi,t3,290000000,'pending'),
    (offer_ok,listing,divi,t2,320000000,'pending');

  -- Sin aprobación del precio mínimo, ni siquiera una oferta buena se admite.
  begin
    perform app_private.aceptar_oferta_manager(offer_ok,'test-disabled-'||offer_ok);
    raise exception 'TEST_ERROR: función activada sin política';
  exception when others then
    if SQLERRM not like 'Ventas entre managers pendientes%' then raise; end if;
  end;

  -- Solo dentro de la prueba activamos un suelo ficticio del 100 %. Se revierte.
  insert into app_private.manager_trade_policies(division_id,min_sale_percent,enabled)
   values(divi,100,true);
  begin
    perform app_private.aceptar_oferta_manager(offer_low,'test-too-low-'||offer_low);
    raise exception 'TEST_ERROR: aceptó oferta por debajo del mínimo';
  exception when others then
    if SQLERRM not like 'La oferta está por debajo%' then raise; end if;
  end;

  op:=app_private.aceptar_oferta_manager(offer_ok,'test-ok-'||offer_ok);
  if op is null then raise exception 'No hubo operación'; end if;
  if app_private.aceptar_oferta_manager(offer_ok,'test-ok-'||offer_ok)<>op then
    raise exception 'La repetición no fue idempotente';
  end if;
  if not exists(select 1 from public.roster_ownership
     where division_id=divi and player_id=p1 and team_id=t2) then
    raise exception 'No se actualizó el propietario';
  end if;
  if (select balance_cents from public.teams where id=t1)<>1320000000
    or (select balance_cents from public.teams where id=t2)<>1680000000 then
    raise exception 'Los saldos de la compraventa no cuadran';
  end if;
  if (select count(*) from public.wallet_entries where operation_key='test-ok-'||offer_ok)<>2 then
    raise exception 'Falta un asiento de venta o compra';
  end if;
  if (select status from public.manager_offers where id=offer_low)<>'rejected'
    or (select status from public.manager_offers where id=offer_ok)<>'accepted'
    or (select status from public.sale_listings where id=listing)<>'accepted' then
    raise exception 'Los estados de ofertas/listado no se ajustaron';
  end if;
  if (select manager_offer_id from public.transfer_operations where id=op)<>offer_ok then
    raise exception 'Falta origen idempotente de la oferta';
  end if;

  -- No se puede utilizar otra clave para volver a aceptar una oferta ya cerrada.
  begin
    perform app_private.aceptar_oferta_manager(offer_ok,'test-otra-'||offer_ok);
    raise exception 'TEST_ERROR: doble venta';
  exception when others then
    if SQLERRM not like 'Anuncio u oferta ya no está vigente%' then raise; end if;
  end;

  -- El manager que vendió no puede recomprar al mismo futbolista durante 2 meses.
  insert into public.sale_listings(id,division_id,seller_team_id,player_id,listed_at,expires_at,status)
   values(listing2,divi,t2,p1,now()-interval '1 hour',now()+interval '1 day','open');
  insert into public.manager_offers(id,listing_id,division_id,buyer_team_id,amount_cents,status)
   values(offer_buyback,listing2,divi,t1,330000000,'pending');
  begin
    perform app_private.aceptar_oferta_manager(offer_buyback,'test-buyback-'||offer_buyback);
    raise exception 'TEST_ERROR: recompra prematura';
  exception when others then
    if SQLERRM not like 'Recompra entre managers prohibida%' then raise; end if;
  end;

  -- Si el comprador no tiene capacidad para pagar, NO se ejecuta transferencia.
  insert into public.sale_listings(id,division_id,seller_team_id,player_id,listed_at,expires_at,status)
   values(listing3,divi,t1,p2,now()-interval '1 hour',now()+interval '1 day','open');
  insert into public.manager_offers(id,listing_id,division_id,buyer_team_id,amount_cents,status)
   values(offer_poor,listing3,divi,t3,410000000,'pending');
  begin
    perform app_private.aceptar_oferta_manager(offer_poor,'test-poor-'||offer_poor);
    raise exception 'TEST_ERROR: comprador sin cobertura';
  exception when others then
    if SQLERRM not like 'La operación dejaría pujas sin cobertura%' then
      -- Si la función solo valida ofertas, hay otro defecto: deuda negativa
      -- sin pujas no está cubierta y la prueba exige una corrección.
      if SQLERRM='TEST_ERROR: comprador sin cobertura' then raise; end if;
      raise;
    end if;
  end;

  raise exception '__MACROLIGA_FASE4_PRUEBAS_OK_ROLLBACK__';
EXCEPTION WHEN OTHERS THEN
  if SQLERRM='__MACROLIGA_FASE4_PRUEBAS_OK_ROLLBACK__' then
    raise notice 'Pruebas OK; se han deshecho todos los datos de ensayo';
  else
    raise;
  end if;
END
$prueba$;