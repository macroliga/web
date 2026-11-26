// Prueba manual aislada. PGlite se instala fuera del repo, sin credenciales.
// PGLITE_DIR=/ruta/node_modules/@electric-sql/pglite node tests/sql/probar_arranque_local.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { normalizarCatalogo } from '../../src/domain/catalogo-deportivo.mjs';
import { catalogoFicticio } from '../../src/demo/catalogo-ficticio.mjs';
if(!process.env.PGLITE_DIR) throw Error('Indicar PGLITE_DIR de una instalación local');
const {PGlite}=await import(pathToFileURL(join(process.env.PGLITE_DIR,'dist/index.js')));
let pgcrypto;
try { ({pgcrypto}=await import(pathToFileURL(join(process.env.PGLITE_DIR,'dist/contrib/pgcrypto.js')))); }
catch(error) { if(error.code!=='ERR_MODULE_NOT_FOUND') throw error; }
const db=new PGlite(pgcrypto?{extensions:{pgcrypto}}:{});

const root=new URL('../../',import.meta.url);
const sql=async path=>readFile(new URL(path,root),'utf8');
const proposal='supabase/migrations/202611260004_catalogo_comuniazo_privado.sql';
const rollback='docs/propuestas/20261126_catalogo_comuniazo_privado_rollback.sql';
const query=async(text,args=[])=> (await db.query(text,args)).rows;
const counts=async()=> (await query(`select
 (select count(*)::int from public.players) players,
 (select count(*)::int from public.roster_ownership) ownership,
 (select count(*)::int from public.wallet_entries) wallet,
 (select count(*)::int from public.sport_import_runs) imports,
 (select count(*)::int from public.player_market_values) prices,
 (select count(*)::int from public.market_cycles) cycles`))[0];
const empty={players:0,ownership:0,wallet:0,imports:0,prices:0,cycles:0};
try {
  console.log((await query('select version()'))[0].version);
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function public.rls_auto_enable() returns void language plpgsql as $$ begin null; end $$;
    create function auth.uid() returns uuid language sql as
    $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon,service_role;`);
  const migrations=['202611250001_core_schema.sql','202611250002_consistencia_divisiones.sql',
    '202611250003_pujas_seguras.sql','202611250004_integridad_pendiente.sql',
    '202611250005_motor_economico_transaccional.sql','202611250006_ventas_entre_managers_protegidas.sql',
    '202611250007_precio_minimo_compraventa_por_tramos.sql','202611250008_cierre_y_ganadores_congelados.sql',
    '202611250009_mercado_diario_dos_dias.sql','202611250010_runner_minimos_permisos.sql',
    '202611250011_restringir_funcion_auto_rls.sql','202611260001_lecturas_seguras_managers.sql',
    '202611260002_alta_piloto_rpc_privadas.sql','202611260003_cerrar_alta_piloto.sql'];
  for(const m of migrations) {
    let text=await sql('supabase/migrations/'+m);
    // PGlite 0.3.14/PG17 no empaqueta pgcrypto. La única referencia
    // es CREATE EXTENSION: gen_random_uuid se utiliza desde pg_catalog.
    if(!pgcrypto&&m==='202611250001_core_schema.sql') {
      await db.query('select gen_random_uuid()');
      text=text.replace('create extension if not exists pgcrypto;','-- Omitida extensión no usada en este entorno local.');
      console.log('Adaptación local documentada: sin pgcrypto, UUID nativo de PostgreSQL.');
    }
    await db.exec(text);
  }

  await db.exec(await sql(proposal));await db.exec(await sql(rollback));await db.exec(await sql(proposal));
  const reads='docs/propuestas/20261126_catalogo_lectura_division.sql';
  const sale='docs/propuestas/20261126_bajas_venta_computer.sql';
  const saleRollback='docs/propuestas/20261126_bajas_venta_computer_rollback.sql';
  await db.exec(await sql(reads));await db.exec(await sql('docs/propuestas/20261126_catalogo_lectura_division_rollback.sql'));await db.exec(await sql(reads));
  const comp=(await query("insert into public.competitions(code,name) values('MACROLIGA_PILOTO_INVIERNO_2026','Test') returning id"))[0].id;
  const season=(await query("insert into public.seasons(competition_id,code,name) values($1,'2026_27','Temporada ficticia') returning id",[comp]))[0].id;
  const division=(await query("insert into public.divisions(season_id,code,name) values($1,'PILOTO','Prueba') returning id",[season]))[0].id;
  const other=(await query("insert into public.divisions(season_id,code,name) values($1,'OTRA','Aislada') returning id",[season]))[0].id;
  const mkTeam=async (d,name)=>{
    const user=(await query('insert into auth.users(id) values(gen_random_uuid()) returning id'))[0].id;
    const manager=(await query('insert into public.managers(auth_user_id,display_name) values($1,$2) returning id',[user,name]))[0].id;
    const team=(await query('insert into public.teams(division_id,manager_id,team_name) values($1,$2,$3) returning id',[d,manager,name]))[0].id;
    return {user,manager,team};
  };
  const a=await mkTeam(division,'Equipo A'),b=await mkTeam(division,'Equipo B'),c=await mkTeam(other,'Otra división');
  const login=async(user)=>{await db.exec('set role authenticated');await query("select set_config('request.jwt.claim.sub',$1,false)",[user]);};
  const reset=()=>db.exec('reset role');
  const raw=catalogoFicticio();
  const original=raw.players.map((x,i)=>({...x,externalId:x.externalId.toLowerCase(),...(i===4?{marketValueCents:'0'}:{})}));
  const day=offset=>new Date(Date.now()-offset*86400000).toISOString();
  const snap=(players,offset)=>normalizarCatalogo({...raw,kind:'authorized',provider:'comuniazo',asOf:day(offset),permissionRef:'Prueba artificial local, no permiso real',players});
  const s1=snap(original,4);
  const points=s=>s.players.filter(p=>p.active).map((p,i)=>({externalId:p.externalId,points:i-10}));
  const load=async(s,p=points(s),actor=null)=>(await query('select app_private.importar_catalogo_comuniazo($1,$2::jsonb,$3::jsonb,$4) result',[season,JSON.stringify(s),p===null?null:JSON.stringify(p),actor]))[0].result;
  const lookup=async(key)=>(await query("select p.id,p.active,p.name,p.position,p.club_id,p.current_market_value_cents::text val from public.players p join public.provider_player_ids i on i.player_id=p.id where i.provider='comuniazo' and i.external_id=$1",[key]))[0];
  await assert.rejects(load({...s1,kind:'diagnostic'}),/no autorizado/);
  await assert.rejects(load(s1,points(s1),a.manager),/no autorizado/);
  await assert.rejects(load(s1,points(s1).slice(1)),/incompleto/);
  const dupe=structuredClone(s1);dupe.players[1].externalId=dupe.players[0].externalId;
  await assert.rejects(load(dupe),/duplicado/);
  const incomplete=structuredClone(s1);incomplete.players=incomplete.players.filter(p=>p.club!==original[0].club);
  await assert.rejects(load(incomplete),/Cobertura|Plantillas/);
  assert.deepEqual(await counts(),empty);
  const initial=await load(s1);
  assert.equal(initial.active,500);assert.equal(initial.accumulatedPoints,500);assert.deepEqual(await load(s1),initial);
  assert.equal((await query("select count(*)::int n from app_private.catalogo_comuniazo_puntos"))[0].n,500);
  await assert.rejects(load({...s1,permissionRef:'diferente'}),/distinto/);
  await login(a.user);
  await assert.rejects(load(s1),/permission denied/);
  await assert.rejects(query('select * from app_private.catalogo_comuniazo_runs'),/permission denied/);
  await reset();
  console.log('PASS carga inicial, puntos acumulados sin premios, idempotencia, cobertura, permisos privados');
  const [oldA,oldB,oldBad,rename,zero]=original;
  const owned=await lookup(oldA.externalId),free=await lookup(oldB.externalId),bad=await lookup(oldBad.externalId),renamed=await lookup(rename.externalId);
  // Ficticios exclusivamente en memoria: dos divisiones pueden tener al mismo jugador.
  await query("insert into public.roster_ownership(division_id,player_id,owner_kind,team_id) values($1,$2,'team',$3),($4,$2,'team',$5)",[division,owned.id,a.team,other,c.team]);
  await query("insert into public.roster_ownership(division_id,player_id,owner_kind) values($1,$2,'bad_team')",[division,bad.id]);
  const zeroPlayer=await lookup(zero.externalId);
  assert.equal(zeroPlayer.val,'0');
  await query("insert into public.roster_ownership(division_id,player_id,owner_kind,team_id) values($1,$2,'team',$3),($1,$4,'team',$3)",[division,zeroPlayer.id,b.team,renamed.id]);
  const initialOwnership=(await counts()).ownership;
  const second=original.filter(x=>![oldA.externalId,oldB.externalId,oldBad.externalId,zero.externalId].includes(x.externalId)).map(x=>x.externalId===rename.externalId?{...x,name:'Nombre actualizado',marketValueCents:'120000000'}:x);
  second.push({...oldA,externalId:'fichaje-nuevo',name:'Fichaje nuevo ficticio',active:true});
  const s2=snap(second,3);
  // Ciclo sin liquidar: no cambian valores ni activos.
  const cycle=(await query("insert into public.market_cycles(division_id,opens_at,closes_at,publishes_at,status) values($1,now()+interval '1 day',now()+interval '2 days',now()+interval '3 days','draft') returning id",[division]))[0].id;
  await assert.rejects(load(s2),/Mercado pendiente/);
  await query("delete from public.market_cycles where id=$1",[cycle]); // SOLO fixture local.
  const before=await counts();
  await db.exec('alter table public.player_market_values add constraint test_fallo_valor check(amount_cents<2000000000)');
  const corrupt=snap(second.map((x,i)=>i===second.length-1?{...x,marketValueCents:'3000000000'}:x),3);
  await assert.rejects(load(corrupt),/test_fallo_valor/);assert.deepEqual(await counts(),before);
  assert.deepEqual(await lookup(rename.externalId),renamed);
  await db.exec('alter table public.player_market_values drop constraint test_fallo_valor');
  const update=await load(s2);
  assert.equal(update.newPlayers,1);assert.equal(update.deactivated,4);assert.equal(update.nameChanges,1);assert.equal(update.priceChanges,1);
  assert.equal(update.active,497);
  assert.equal((await counts()).ownership,initialOwnership-1);
  assert.equal(update.badTeamReleased,1);
  assert.equal((await query("select count(*)::int n from app_private.catalogo_comuniazo_bajas_equipo_malo where division_id=$1 and player_id=$2",[division,bad.id]))[0].n,1);
  assert.equal((await query("select count(*)::int n from public.roster_ownership where player_id=$1",[bad.id]))[0].n,0);
  assert.equal((await counts()).wallet,0);
  const newPlayer=await lookup('fichaje-nuevo');
  assert.equal((await lookup(oldA.externalId)).active,false);assert.equal((await lookup(oldA.externalId)).val,owned.val);
  assert.equal((await lookup(rename.externalId)).id,renamed.id);
  assert.equal((await lookup(rename.externalId)).name,'Nombre actualizado');
  // Días sucesivos: un registro histórico de la fuente con contenido distinto
  // no puede alterar ninguna parte de la última ficha activa ni sus puntos.
  const frozen={...owned,active:false};
  const next=snap([...second,{...oldA,active:false,name:'Dato histórico erróneo',club:'Club ajeno',position:oldA.position==='GK'?'FWD':'GK',marketValueCents:'1'}],2);
  const day3=await load(next);
  assert.equal(day3.deactivated,0);
  assert.deepEqual(await lookup(oldA.externalId),frozen);
  const history=(await query("select count(*)::int n,min(amount_cents)::text val from public.player_market_values where player_id=$1",[owned.id]))[0];
  assert.deepEqual(history,{n:1,val:owned.val});
  const accumulated=(await query("select count(*)::int n from app_private.catalogo_comuniazo_puntos where player_id=$1",[owned.id]))[0];
  assert.equal(accumulated.n,1);
  console.log('PASS ficha, valor e histórico de puntos congelados durante dos descargas consecutivas');
  const list=async(d)=>(await query('select * from public.macroliga_catalogo_division($1)',[d]));
  await login(a.user);let rows=await list(division);
  assert.equal(rows.find(x=>x.jugador_id===newPlayer.id).propietario_tipo,'computer');
  assert.equal(rows.find(x=>x.jugador_id===owned.id).activo,false);
  assert.equal(rows.find(x=>x.jugador_id===owned.id).propietario_equipo,'Equipo A');
  assert(!rows.some(x=>x.jugador_id===free.id||x.jugador_id===bad.id));
  await assert.rejects(list(other),/No autorizado/);await reset();
  await login(c.user);assert.equal((await list(other)).find(x=>x.jugador_id===owned.id).propietario_equipo,'Otra división');await reset();
  console.log('PASS altas Computer, cambios de nombre/valor sin cambiar identidad, bajas retenidas, listado aislado, rollback tardío');
  // Oferta anterior incorrecta: debe actualizarse y confirmarse explícitamente.
  const offer=(await query("insert into public.sale_listings(division_id,seller_team_id,player_id,expires_at,computer_offer_cents,computer_offer_at) values($1,$2,$3,now()+interval '1 day',$4,now()-interval '1 second') returning id",[division,a.team,owned.id,String(BigInt(owned.val)+1000000n)]))[0].id;
  const sell=async()=>(await query("select app_private.vender_computer($1,'venta-baja-fixture-01') id",[offer]))[0].id;
  await assert.rejects(sell(),/inactivo/);
  await db.exec(await sql(sale));await db.exec(await sql(saleRollback));await assert.rejects(sell(),/inactivo/);await db.exec(await sql(sale));
  const transfer=async(player,seller,buyer,from,to,kind,key)=>query('select app_private._contabilizar_traspaso($1,$2,$3,$4,$5,$6,$7,$8,$9)',[division,player,seller,buyer,from,to,1000000,kind,key]);
  await assert.rejects(transfer(owned.id,b.team,null,'team','computer','computer_sale','venta-ajena-fixture'),/no es propietario/);
  await assert.rejects(sell(),/Oferta antigua/);
  await assert.rejects(transfer(owned.id,a.team,null,'team','computer','computer_sale','importe-incorrecto-fixture'),/último valor/);
  assert.equal((await counts()).wallet,0);
  const quote=async(id)=>(await query('select app_private.preparar_oferta_baja_computer($1)::text val',[id]))[0].val;
  assert.equal(await quote(offer),owned.val);
  assert.equal((await counts()).wallet,0);
  await assert.rejects(transfer(owned.id,a.team,b.team,'team','team','manager_sale','venta-manager-fixture'),/inactivo/);
  await assert.rejects(transfer(owned.id,a.team,null,'team','bad_team','bad_team_sale','venta-malo-fixture'),/inactivo/);
  await assert.rejects(transfer(free.id,null,b.team,'computer','team','market','compra-baja-fixture'),/inactivo/);
  const operation=await sell();assert.equal(await sell(),operation);
  assert.equal((await query("select balance_cents::text balance from public.teams where id=$1",[a.team]))[0].balance,owned.val);
  assert.equal((await query("select count(*)::int n from public.roster_ownership where player_id=$1",[owned.id]))[0].n,1);
  assert.equal((await query("select count(*)::int n from public.wallet_entries where team_id=$1",[a.team]))[0].n,1);
  await login(a.user);assert(!(await list(division)).some(x=>x.jugador_id===owned.id));await reset();
  await login(c.user);assert((await list(other)).some(x=>x.jugador_id===owned.id));await reset();
  assert.equal((await lookup(oldA.externalId)).active,false);
  // Valor cero real: la baja se puede liberar por 0; un activo no.
  const zeroOffer=(await query("insert into public.sale_listings(division_id,seller_team_id,player_id,expires_at) values($1,$2,$3,now()+interval '1 day') returning id",[division,b.team,zeroPlayer.id]))[0].id;
  assert.equal(await quote(zeroOffer),'0');
  const sellZero=async()=>(await query("select app_private.vender_computer($1,'venta-cero-fixture') id",[zeroOffer]))[0].id;
  const zeroOp=await sellZero();assert.equal(await sellZero(),zeroOp);
  assert.equal((await query("select balance_cents::text balance from public.teams where id=$1",[b.team]))[0].balance,'0');
  const activeOffer=(await query("insert into public.sale_listings(division_id,seller_team_id,player_id,expires_at,computer_offer_cents,computer_offer_at) values($1,$2,$3,now()+interval '1 day',1000000,now()-interval '1 second') returning id",[division,b.team,renamed.id]))[0].id;
  await assert.rejects(quote(activeOffer),/no pertenece/);
  await query("select app_private.vender_computer($1,'venta-activa-fixture')",[activeOffer]);
  assert.equal((await query("select balance_cents::text balance from public.teams where id=$1",[b.team]))[0].balance,'1000000');
  console.log('PASS oferta obsoleta rechazada, pago exacto, baja de valor cero y oferta normal de activo intacta');
  const s3=snap([...second,oldA,oldBad],1);const third=await load(s3);
  assert.equal(third.reactivated,2);assert.equal((await lookup(oldA.externalId)).id,owned.id);
  await login(a.user);const reactivated=await list(division);
  assert.equal(reactivated.find(x=>x.jugador_id===owned.id).propietario_tipo,'computer');
  assert.equal(reactivated.find(x=>x.jugador_id===bad.id).propietario_tipo,'computer');await reset();
  assert.equal((await lookup(oldBad.externalId)).id,bad.id);
  await login(c.user);assert.equal((await list(other)).find(x=>x.jugador_id===owned.id).propietario_tipo,'team');await reset();
  for(const role of ['anon','authenticated','service_role','macroliga_runner']){
    const grants=(await query("select has_function_privilege($1,'app_private.importar_catalogo_comuniazo(uuid,jsonb,jsonb,uuid)','EXECUTE') imp,has_function_privilege($1,'public.macroliga_catalogo_division(uuid)','EXECUTE') read,has_table_privilege($1,'app_private.catalogo_comuniazo_puntos','SELECT') points,has_function_privilege($1,'app_private.preparar_oferta_baja_computer(uuid)','EXECUTE') quote",[role]))[0];
    assert.deepEqual(grants,{imp:false,read:role==='authenticated',points:false,quote:false});
  }
  await assert.rejects(db.exec(await sql(rollback)),/plan de datos/);await db.exec('rollback');
  assert.equal((await query('select count(*)::int n from public.player_fixture_points'))[0].n,0);
  assert.equal((await query('select count(*)::int n from app_private.catalogo_comuniazo_bajas_equipo_malo'))[0].n,1);
  console.log('PASS baja de Equipo Malo auditada, sin pago ni titularidad, regreso a Computer');
  console.log('PASS venta de baja solo a Computer, pago una vez, desaparición en su división, otra intacta, reactivación, permisos y rollback protegido');
} finally {await db.close();}
