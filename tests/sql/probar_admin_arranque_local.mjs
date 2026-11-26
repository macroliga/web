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
const core='supabase/migrations/202611260008_arranque_combinado_privado.sql';
const coreRollback='docs/propuestas/20261126_arranque_propietario_rollback.sql';
const proposal='supabase/migrations/202611260009_arranque_admin_division.sql';
const rollback='docs/propuestas/20261126_admin_arranque_rollback.sql';
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
  await db.exec(await sql("supabase/migrations/202611260004_catalogo_comuniazo_privado.sql"));
  const selector='supabase/migrations/202611260006_mercado_variado_lecturas.sql';
  const selectorRollback='docs/propuestas/20261126_mercado_variado_lectura_rollback.sql';
  await db.exec(await sql(selector));await db.exec(await sql(selectorRollback));await db.exec(await sql(selector));
  const standings='supabase/migrations/202611260007_clasificacion_managers.sql';
  await db.exec(await sql(standings));await db.exec(await sql('docs/propuestas/20261126_clasificacion_managers_rollback.sql'));await db.exec(await sql(standings));
  await db.exec(await sql(core));await db.exec(await sql(proposal));
  await db.exec(await sql(rollback));await db.exec(await sql(coreRollback));
  await db.exec(await sql(core));await db.exec(await sql(proposal));
  console.log('PASS instalación/reversión estructural sin uso; 14 migraciones versionadas; auth y función Supabase automática simuladas');

  const comp=(await query("insert into public.competitions(code,name) values('MACROLIGA_PILOTO_INVIERNO_2026','Test') returning id"))[0].id;
  const season=(await query("insert into public.seasons(competition_id,code,name) values($1,'2026_27','Temporada ficticia') returning id",[comp]))[0].id;
  const otherSeason=(await query("insert into public.seasons(competition_id,code,name) values($1,'otra','Otra prueba') returning id",[comp]))[0].id;
  const division=(await query("insert into public.divisions(season_id,code,name) values($1,'test','Prueba') returning id",[season]))[0].id;
  const foreignDivision=(await query("insert into public.divisions(season_id,code,name) values($1,'otra','Otra prueba') returning id",[otherSeason]))[0].id;
  const teams=[];
  for(let i=0;i<17;i++) {
    const user=(await query('insert into auth.users values(gen_random_uuid()) returning id'))[0].id;
    const manager=(await query("insert into public.managers(auth_user_id,display_name,is_admin) values($1,$2,$3) returning id",[user,'Ficticio '+i,i===0||i===2||i===16]))[0].id;
    const team=(await query("insert into public.teams(division_id,manager_id,team_name) values($1,$2,$3) returning id",[i<16?division:foreignDivision,manager,'Equipo ficticio '+i]))[0].id;
    teams.push({user,team,manager});
  }
  const snapshot=normalizarCatalogo({...catalogoFicticio(),kind:'authorized',provider:'comuniazo',permissionRef:'Ensayo local artificial, no datos reales',players:catalogoFicticio().players.map(p=>({...p,externalId:p.externalId.toLowerCase()}))});
  const login=async i=>{await db.exec('set role authenticated');await query("select set_config('request.jwt.claim.sub',$1,false)",[teams[i].user]);};
  const reset=()=>db.exec('reset role');
  const estado=async(d=division)=>(await query('select public.macroliga_admin_arranque_estado($1) result',[d]))[0].result;
  const puntos=snapshot.players.map((p,i)=>({externalId:p.externalId,points:i}));
  const importar=async(s=snapshot)=>(await query('select public.macroliga_admin_importar_catalogo($1,$2::jsonb,$3::jsonb) result',[division,JSON.stringify(s),JSON.stringify(puntos)]))[0].result;
  const simular=async(w='7200000000',slots={GK:2,DEF:5,MID:5,FWD:3},seed='prueba',cash='1000000000')=>(await query("select public.macroliga_admin_simular_reparto($1,$2,$3::jsonb,$4,$5,current_date+2) result",[division,w,JSON.stringify(slots),cash,seed]))[0].result;
  const requestId='00000000-0000-4000-8000-000000000001';
  const combinado=async({owner=false,d=division,s=snapshot,pts=puntos,w='7000000000',slots={GK:2,DEF:5,MID:5,FWD:3},cash='0',request=requestId}={})=>(await query('select '+(owner?'app_private.iniciar_todo_propietario':'public.macroliga_admin_iniciar_todo')+'($1,$2::jsonb,$3::jsonb,$4,$5::jsonb,$6,current_date+2,$7) result',[d,JSON.stringify(s),JSON.stringify(pts),w,JSON.stringify(slots),cash,request]))[0].result;
  const aplicar=async(id)=>(await query('select public.macroliga_admin_aplicar_reparto($1,$2) result',[division,id]))[0].result;
  const visible=async(d=division)=>query('select * from public.macroliga_mercado_visible($1)',[d]);
  const classification=async(d=division)=>query('select * from public.macroliga_clasificacion($1)',[d]);
  await login(1);
  const initialStandings=await classification();
  assert.equal(initialStandings.length,16);
  assert.ok(initialStandings.every(t=>Number(t.posicion)===1&&Number(t.puntos)===0&&t.valor_equipo_centimos==='0'));
  assert.equal(initialStandings.filter(t=>t.es_mi_equipo).length,1);
  await assert.rejects(classification(foreignDivision),/No autorizado/);
  assert.deepEqual(await visible(),[]);
  await assert.rejects(visible(foreignDivision),/No autorizado/);
  await assert.rejects(estado(),/denegado/);
  await assert.rejects(query("update public.managers set is_admin=true"),/permission denied/);
  await assert.rejects(importar(),/denegado/);
  await assert.rejects(combinado(),/denegado/);
  await assert.rejects(combinado({owner:true}),/permission denied/);
  await assert.rejects(simular(),/denegado/);
  await assert.rejects(aplicar(division),/denegado/);
  await reset();await login(16);
  await assert.rejects(estado(),/denegado/);
  await assert.rejects(importar(),/denegado/);
  await reset();await login(0);
  assert.equal((await estado()).teamCount,16);
  await assert.rejects(simular(),/Cargar primero/);
  await assert.rejects(importar(catalogoFicticio()),/no autorizado/);
  const bad=structuredClone(snapshot);bad.players.at(-1).externalId=bad.players[0].externalId;
  await assert.rejects(importar(bad),/duplicado/);
  await reset();assert.deepEqual(await counts(),empty);await login(0);
  await assert.rejects(combinado({pts:null}),/lote completo/);
  await assert.rejects(combinado({s:catalogoFicticio()}),/no autorizado/);
  await assert.rejects(combinado({slots:{GK:0,DEF:7,MID:5,FWD:3}}),/Cuotas/);
  // Aunque la importación ya había ocurrido en la llamada, no deja nada.
  await reset();assert.deepEqual(await counts(),empty);
  await db.exec("alter table public.market_lots add constraint test_combined_failure check(minimum_bid_cents=0)");
  await login(0);await assert.rejects(combinado(),/test_combined_failure/);await reset();
  assert.deepEqual(await counts(),empty);
  assert.equal((await query('select count(*)::int n from app_private.admin_repartos'))[0].n,0);
  assert.equal((await query('select count(*)::int n from public.admin_audit'))[0].n,0);
  await db.exec('alter table public.market_lots drop constraint test_combined_failure');
  // Caso completo, verificación de la repetición y conflicto en una
  // transacción local que se revierte para conservar las pruebas separadas.
  await db.exec('begin');
  await login(0);
  const combined=await combinado();
  assert.equal(combined.catalog.active,500);
  assert.equal(combined.catalog.accumulatedPoints,500);
  assert.equal(combined.teams,16);assert.equal(combined.marketPlayers,15);
  assert.equal(combined.marketStatus,'draft');assert.equal(combined.wealthCents,'7000000000');
  assert.ok(BigInt(combined.rosterSpreadCents)<=70000000n);
  assert.deepEqual(await combinado(),combined);
  await db.exec('savepoint conflict');
  await assert.rejects(combinado({w:'7100000000'}),/Clave de arranque/);
  await db.exec('rollback to savepoint conflict');
  await reset();
  assert.deepEqual(await counts(),{players:500,ownership:240,wallet:16,imports:1,prices:500,cycles:1});
  assert.equal((await query("select count(*)::int n from public.market_lots l join public.roster_ownership o on o.division_id=l.division_id and o.player_id=l.player_id"))[0].n,0);
  assert.equal((await query("select count(*)::int n from public.bids"))[0].n,0);
  await db.exec('rollback');assert.deepEqual(await counts(),empty);
  await db.exec('begin');
  const ownerCombined=await combinado({owner:true});
  assert.equal(ownerCombined.teams,16);
  assert.deepEqual(await combinado({owner:true}),ownerCombined);
  assert.equal((await query("select count(*)::int n from public.admin_audit where actor_manager_id is null"))[0].n,2);
  assert.equal((await query("select count(*)::int n from app_private.admin_repartos where actor is null and applied is not null"))[0].n,1);
  await db.exec('rollback');assert.deepEqual(await counts(),empty);
  console.log('PASS operador propietario sin suplantar manager, auditoría y repetición');
  console.log('PASS arranque combinado: lote completo, todo o nada, 16 equipos, 15 libres, idempotencia y conflicto de clave');
  await login(0);
  const imported=await importar();assert.equal(imported.catalogCount,500);assert.equal(imported.accumulatedPoints,500);assert.deepEqual(await importar(),imported);
  await assert.rejects(importar({...snapshot,permissionRef:'otra'}),/catálogo distinto/);
  assert.equal((await estado()).catalogReady,true);await reset();
  assert.deepEqual(await counts(),{...empty,players:500,prices:500,imports:1});
  await login(1);
  const preview=await visible();
  assert.equal(preview.length,15);assert.ok(preview.every(x=>x.estado==='preview'&&Number.isInteger(x.puntos_acumulados)));
  assert.deepEqual(await visible(),preview);
  assert.deepEqual(Object.fromEntries(['GK','DEF','MID','FWD'].map(pos=>[pos,preview.filter(x=>x.posicion===pos).length])),{GK:2,DEF:5,MID:5,FWD:3});
  await reset();
  assert.deepEqual(await counts(),{...empty,players:500,prices:500,imports:1});
  assert.equal((await query("select count(*)::int n from public.bids"))[0].n,0);
  console.log('PASS vista previa sin mercado, reserva estable 2/5/5/3, permisos y carga idempotente');
  await login(0);
  await assert.rejects(simular('7200000000',{GK:0,DEF:6,MID:6,FWD:3}),/Cuotas/);
  await assert.rejects(simular('7200000000',{GK:2,DEF:5,MID:5,FWD:4}),/plaza libre/);
  const defaultPlan=await simular('7000000000',{GK:2,DEF:5,MID:5,FWD:3},'patrimonio por defecto','0');
  assert.ok(defaultPlan.allocations.every(x=>x.players.length===15&&x.wealthCents==='7000000000'&&BigInt(x.cashCents)>=0n));
  console.log('PASS patrimonio por defecto 70 millones: diferencia',defaultPlan.rosterSpreadCents,'céntimos');
  const shorter=await simular('6500000000',{GK:1,DEF:4,MID:4,FWD:3},'12 jugadores');
  assert.ok(shorter.allocations.every(x=>x.players.length===12&&x.wealthCents==='6500000000'));
  const plan=await simular();
  const repeat=await simular();assert.deepEqual({...plan,previewId:null},{...repeat,previewId:null});
  assert.equal(repeat.allocations.length,16);
  assert.ok(BigInt(repeat.rosterSpreadCents)<=BigInt(repeat.greedySpreadCents));
  const allocated=repeat.allocations.flatMap(x=>x.players.map(p=>p.id));
  assert.equal(new Set(allocated).size,240);
  assert.equal(repeat.marketPlayers.length,15);
  assert.deepEqual(repeat.marketPlayers.map(p=>p.id).sort(),preview.map(p=>p.jugador_id).sort());
  assert.equal(new Set(repeat.marketPlayers.map(p=>p.id)).size,15);
  assert.ok(repeat.marketPlayers.every(p=>!allocated.includes(p.id)&&BigInt(p.valueCents)>0));
  for(const t of repeat.allocations) {
    assert.equal(BigInt(t.rosterValueCents)+BigInt(t.cashCents),7200000000n);
    assert.ok(BigInt(t.cashCents)>=1000000000n);
    for(const [pos,n] of Object.entries(repeat.slots))assert.equal(t.players.filter(x=>x.position===pos).length,n);
  }
  await assert.rejects(aplicar(shorter.previewId),/inexistente/);
  await reset();
  assert.deepEqual(await counts(),{...empty,players:500,prices:500,imports:1});
  console.log('PASS simulación reproducible, 12/15 futbolistas, cuotas, 16 equipos, 15 libres; diferencia:',repeat.rosterSpreadCents,'céntimos desde',repeat.greedySpreadCents);
  await db.exec("update public.players set current_market_value_cents=current_market_value_cents+1");
  await login(0);await assert.rejects(aplicar(repeat.previewId),/modificados/);
  const fresh=await simular();await reset();
  await login(2);await assert.rejects(aplicar(fresh.previewId),/inexistente o ajena/);await reset();
  // Forzar fallo en el último tramo para comprobar atomicidad real.
  await db.exec("alter table public.market_lots add constraint test_fallo check(minimum_bid_cents=0)");
  await login(0);await assert.rejects(aplicar(fresh.previewId),/test_fallo/);await reset();
  assert.deepEqual(await counts(),{...empty,players:500,prices:500,imports:1});
  assert.equal((await query('select initial_wealth_cents::text wealth from public.seasons where id=$1',[season]))[0].wealth,'7000000000');
  await db.exec('alter table public.market_lots drop constraint test_fallo');
  await login(16);await assert.rejects(aplicar(fresh.previewId),/denegado/);await reset();
  await login(0);
  const result=await aplicar(fresh.previewId);assert.equal(result.marketStatus,'draft');assert.deepEqual(await aplicar(fresh.previewId),result);
  await assert.rejects(simular(),/equipos activos y vacíos/);
  await reset();
  assert.deepEqual(await counts(),{players:500,ownership:240,wallet:16,imports:1,prices:500,cycles:1});
  const rows=await query(`select t.id,t.balance_cents::text cash,count(r.player_id)::int players,
     (t.balance_cents+sum(p.current_market_value_cents))::text wealth
     from public.teams t join public.roster_ownership r on r.team_id=t.id join public.players p on p.id=r.player_id
     where t.division_id=$1 group by t.id`,[division]);
  assert.equal(rows.length,16);assert.ok(rows.every(x=>x.players===15&&x.wealth==='7200000000'));
  const lots=await query("select player_id from public.market_lots where cycle_id=$1",[result.marketId]);
  assert.deepEqual(lots.map(x=>x.player_id).sort(),fresh.marketPlayers.map(x=>x.id).sort());
  assert.equal((await query("select count(*)::int n from public.market_cycles where status='draft'"))[0].n,1);
  assert.equal((await query("select count(*)::int n from public.bids"))[0].n,0);
  assert.equal((await query("select status from public.seasons where id=$1",[season]))[0].status,'draft');
  assert.equal((await query("select balance_cents::text cash from public.teams where id=$1",[teams[16].team]))[0].cash,'0');
  assert.equal((await query("select initial_wealth_cents::text wealth from public.seasons where id=$1",[otherSeason]))[0].wealth,'7000000000');
  for(const role of ['anon','authenticated','service_role','macroliga_runner']) {
    const f=(await query("select has_function_privilege($1,'public.macroliga_admin_aplicar_reparto(uuid,uuid)','execute') allowed,has_function_privilege($1,'public.macroliga_admin_iniciar_todo(uuid,jsonb,jsonb,bigint,jsonb,bigint,date,uuid)','execute') combined,has_function_privilege($1,'app_private.iniciar_todo_propietario(uuid,jsonb,jsonb,bigint,jsonb,bigint,date,uuid)','execute') owner,has_table_privilege($1,'app_private.admin_repartos','SELECT') readable,has_function_privilege($1,'public.macroliga_mercado_visible(uuid)','EXECUTE') market,has_function_privilege($1,'app_private.seleccionar_mercado_variado(uuid,text,uuid[],uuid[])','EXECUTE') selector,has_function_privilege($1,'public.macroliga_clasificacion(uuid)','EXECUTE') standings",[role]))[0];
    assert.deepEqual(f,{allowed:role==='authenticated',combined:role==='authenticated',owner:false,readable:false,market:role==='authenticated',selector:false,standings:role==='authenticated'});
  }
  await login(1);
  const actual=await visible();assert.equal(actual.length,15);assert.ok(actual.every(x=>x.estado==='draft'));
  assert.deepEqual(actual.map(p=>p.jugador_id).sort(),preview.map(p=>p.jugador_id).sort());
  let afterStandings=await classification();assert.equal(afterStandings.length,16);
  assert.ok(afterStandings.every(t=>BigInt(t.valor_equipo_centimos)>0n&&Number(t.puntos)===0));
  assert.equal((await query('select * from public.macroliga_mi_equipo()')).length,1);
  assert.equal((await query('select * from public.macroliga_plantilla_equipo($1)',[teams[1].team])).length,15);
  await assert.rejects(query('select * from public.macroliga_plantilla_equipo($1)',[teams[16].team]));await reset();
  // Puntos de competición reales (ficticios solo en BD desechable), no
  // acumulados del proveedor, y no provisionales. Empate sin desempate inventado.
  const gw=(await query("insert into public.gameweeks(division_id,number,status) values($1,1,'final') returning id",[division]))[0].id;
  const live=(await query("insert into public.gameweeks(division_id,number,status) values($1,2,'live') returning id",[division]))[0].id;
  await query("insert into public.team_gameweek_scores(gameweek_id,team_id,division_id,points,status) values($1,$2,$3,7,'final'),($1,$4,$3,7,'final'),($1,$5,$3,-2,'final'),($6,$5,$3,100,'provisional')",[gw,teams[0].team,division,teams[1].team,teams[2].team,live]);
  await login(1);afterStandings=await classification();
  assert.ok(afterStandings.slice(0,2).every(t=>Number(t.puntos)===7&&Number(t.posicion)===1));
  assert.equal(Number(afterStandings.at(-1).puntos),-2);
  await reset();
  console.log('PASS clasificación: 16 managers a cero antes del reparto; valor de plantillas tras reparto; puntos confirmados, empate y división aislada');
  await assert.rejects(db.exec(await sql(rollback)),/requiere un plan/);await db.exec('rollback');
  await assert.rejects(db.exec(await sql(coreRollback)),/requiere un plan/);await db.exec('rollback');
  console.log('PASS datos obsoletos, rollback tardío, aplicación idempotente, 15 lotes en borrador, sin pujas ni activación; división ajena intacta');
} finally {await db.close();}
