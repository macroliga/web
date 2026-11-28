-- SOLO base desechable. Test de las dos ventas y seguridad, revertido al finalizar.
begin;
do $test$
declare
 di uuid; se uuid;
 other_di uuid:=gen_random_uuid();
 u uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); m2 uuid:=gen_random_uuid();
 t uuid:=gen_random_uuid(); t2 uuid:=gen_random_uuid(); p1 uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); p3 uuid:=gen_random_uuid(); p4 uuid:=gen_random_uuid();
 k uuid:=gen_random_uuid(); l1 uuid;l2 uuid;off uuid;op uuid;repeat_op uuid;balance0 bigint:=1000000000;
 z_open text;z_closed text;j jsonb;
begin
 select id,season_id into strict di,se from public.divisions where code='PILOTO';
 insert into public.divisions(id,season_id,code,name) values(other_di,se,'OTRA','Otra');
 select name into strict z_open from pg_timezone_names where name like 'Etc/GMT%' and (clock_timestamp() at time zone name)::time between time '13:00' and time '22:00' limit 1;
 select name into strict z_closed from pg_timezone_names where name like 'Etc/GMT%' and (clock_timestamp() at time zone name)::time between time '02:00' and time '10:00' limit 1;
 update public.divisions set timezone=z_closed where id=di;
 insert into auth.users(id) values(u),(u2);
 insert into public.managers(id,auth_user_id,display_name) values(m,u,'Vendedor ficticio'),(m2,u2,'Comprador ficticio');
 insert into public.teams(id,division_id,manager_id,team_name,balance_cents) values(t,di,m,'Vendedor',balance0),(t2,di,m2,'Comprador',balance0);
 insert into public.players(id,name,position,current_market_value_cents,active) values
 (p1,'Venta Equipo Malo','MID',50000000,true),(p2,'Anuncio independiente','DEF',40000000,true),
 (p3,'Jugador ajeno','GK',20000000,true),(p4,'Jugador inactivo','FWD',10000000,false);
 insert into public.roster_ownership(division_id,player_id,owner_kind,team_id) values(di,p1,'team',t),(di,p2,'team',t),(di,p3,'team',t2),(di,p4,'team',t);
 insert into public.market_cycles(division_id,opens_at,closes_at,publishes_at,status)
 values(di,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '2 hours',clock_timestamp()+interval '7 hours','open');
 perform set_config('request.jwt.claim.sub',u::text,true);
 if (public.macroliga_operaciones_mercado(di)->>'ventas_abiertas')::boolean is distinct from true then raise exception 'Anuncios no activados';end if;
 j:=public.macroliga_cotizar_venta_equipo_malo(di,p1);
 if (j->>'disponible')::boolean is distinct from false or j->>'motivo' not like '%12:00%' then raise exception 'Horario cerrado no respetado';end if;
 begin
   perform public.macroliga_vender_equipo_malo(di,p1,50000000,k);
   raise exception 'Venta anticipada permitida';
 exception when sqlstate '22023' then null;end;
 update public.divisions set timezone=z_open where id=di;
 j:=public.macroliga_cotizar_venta_equipo_malo(di,p1);
 if (j->>'disponible')::boolean is distinct from true or j->>'importe_centimos'<>'50000000' then raise exception 'Cotización errónea: %',j;end if;
 if (public.macroliga_cotizar_venta_equipo_malo(di,p3)->>'disponible')::boolean is distinct from false or (public.macroliga_cotizar_venta_equipo_malo(di,p4)->>'disponible')::boolean is distinct from false then raise exception 'Cotizó jugador no autorizado';end if;
 begin
   perform public.macroliga_vender_equipo_malo(di,p1,51000000,k);
   raise exception 'Aceptó importe inventado';
 exception when sqlstate '22023' then null;end;
 begin
   perform public.macroliga_vender_equipo_malo(di,p3,20000000,k);
   raise exception 'Vendió jugador ajeno';
 exception when insufficient_privilege then null;end;
 begin
   perform public.macroliga_vender_equipo_malo(other_di,p1,50000000,k);
   raise exception 'Vendió en división ajena';
 exception when insufficient_privilege then null;end;
 if exists(select 1 from public.transfer_operations) then raise exception 'Transferencia prematura';end if;
 -- Regla ya aprobada: 500.000 € -> mínimo 800.000 €; 400.000 € -> 600.000 €.
 begin
   perform public.macroliga_operar_venta(di,'listar',p1,79999999);
   raise exception 'Precio menor aceptado';
 exception when raise_exception then if SQLERRM<>'Precio inferior al mínimo' then raise;end if;end;
 l1:=public.macroliga_operar_venta(di,'listar',p1,80000000);
 l2:=public.macroliga_operar_venta(di,'listar',p2,60000000);
 if (select count(*) from public.sale_listings where division_id=di and status='open' and seller_team_id=t)<>2 then raise exception 'No se publicaron anuncios';end if;
 if (select balance_cents from public.teams where id=t)<>balance0 then raise exception 'Anunciar alteró el saldo';end if;
 perform set_config('request.jwt.claim.sub',u2::text,true);
 off:=public.macroliga_operar_venta(di,'ofertar',l1,80000000);
 perform set_config('request.jwt.claim.sub',u::text,true);
 op:=public.macroliga_vender_equipo_malo(di,p1,50000000,k);
 repeat_op:=public.macroliga_vender_equipo_malo(di,p1,50000000,k);
 if op is distinct from repeat_op then raise exception 'Duplicado de venta';end if;
 if (select count(*) from public.transfer_operations where division_id=di and kind='bad_team_sale' and status='committed' and amount_cents=50000000 and seller_team_id=t and buyer_kind='bad_team')<>1 then raise exception 'Traspaso no confirmado';end if;
 if (select count(*) from public.roster_events where operation_id=op)<>2 then raise exception 'Eventos no asentados';end if;
 if not exists(select 1 from public.roster_ownership where division_id=di and player_id=p1 and owner_kind='bad_team' and team_id is null) then raise exception 'Propiedad no actualizada';end if;
 if (select balance_cents from public.teams where id=t)<>balance0+50000000 or (select count(*) from public.wallet_entries where team_id=t)<>1 then raise exception 'Saldo incorrecto o doble';end if;
 if (select status from public.sale_listings where id=l1)<>'cancelled' or (select status from public.manager_offers where id=off)<>'rejected' or (select status from public.sale_listings where id=l2)<>'open' then raise exception 'Cancelación de anuncio incorrecta';end if;
 if (select count(*) from public.macroliga_historial_traspasos(di,null,null,50) where tipo='bad_team_sale' and destino='Equipo Malo')<>1 then raise exception 'Venta ausente en noticias';end if;
 begin
   perform public.macroliga_vender_equipo_malo(di,p1,50000000,gen_random_uuid());
   raise exception 'Segunda venta admitida';
 exception when insufficient_privilege then null;end;
 begin
   perform public.macroliga_vender_equipo_malo(di,p2,40000000,k);
   raise exception 'Clave reutilizada con otro jugador';
 exception when unique_violation then null;end;
 if has_function_privilege('anon','public.macroliga_vender_equipo_malo(uuid,uuid,bigint,uuid)','EXECUTE') or has_function_privilege('anon','public.macroliga_cotizar_venta_equipo_malo(uuid,uuid)','EXECUTE') or not has_function_privilege('authenticated','public.macroliga_vender_equipo_malo(uuid,uuid,bigint,uuid)','EXECUTE') then raise exception 'ACL insegura';end if;
 perform set_config('request.jwt.claim.sub','',true);
 begin
   perform public.macroliga_cotizar_venta_equipo_malo(di,p2);
   raise exception 'Cotización anónima permitida';
 exception when insufficient_privilege then null;end;
 raise notice 'OK: horario, cotización, propietario, división, precio, anuncios, ofertas, saldo, plantilla, noticias, cancelación, idempotencia y ACL.';
end
$test$;
rollback;
