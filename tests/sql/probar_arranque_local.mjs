// Prueba manual aislada. PGlite se instala fuera del repo, sin credenciales.
// PGLITE_DIR=/ruta/node_modules/@electric-sql/pglite node tests/sql/probar_arranque_local.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { normalizarCatalogo } from '../../src/domain/catalogo-deportivo.mjs';
import { catalogoFicticio } from '../../src/demo/catalogo-ficticio.mjs';
import { planificarReparto } from '../../src/domain/reparto-inicial.mjs';
if(!process.env.PGLITE_DIR) throw Error('Indicar PGLITE_DIR de una instalación local');
const {PGlite}=await import(pathToFileURL(join(process.env.PGLITE_DIR,'dist/index.js')));
let pgcrypto;
try { ({pgcrypto}=await import(pathToFileURL(join(process.env.PGLITE_DIR,'dist/contrib/pgcrypto.js')))); }
catch(error) { if(error.code!=='ERR_MODULE_NOT_FOUND') throw error; }
const db=new PGlite(pgcrypto?{extensions:{pgcrypto}}:{});

const root=new URL('../../',import.meta.url);
const sql=async path=>readFile(new URL(path,root),'utf8');
const proposal='docs/propuestas/20261126_arranque_catalogo_reparto.sql';
const rollback='docs/propuestas/20261126_arranque_catalogo_reparto_rollback.sql';
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
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as
    $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon,service_role;`);
  const migrations=['202611250001_core_schema.sql','202611250002_consistencia_divisiones.sql',
    '202611250003_pujas_seguras.sql','202611250004_integridad_pendiente.sql',
    '202611250005_motor_economico_transaccional.sql','202611250006_ventas_entre_managers_protegidas.sql',
    '202611250007_precio_minimo_compraventa_por_tramos.sql','202611250008_cierre_y_ganadores_congelados.sql',
    '202611250009_mercado_diario_dos_dias.sql','202611250010_runner_minimos_permisos.sql',
    '202611260001_lecturas_seguras_managers.sql'];
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
  await db.exec(await sql(proposal));
  await db.exec(await sql(rollback));
  await db.exec(await sql(proposal));
  console.log('PASS instalación/reversión estructural sin uso; 11 migraciones reales');
  const comp=(await query("insert into public.competitions(code,name) values('test','Test') returning id"))[0].id;
  const season=(await query("insert into public.seasons(competition_id,code,name) values($1,'2026_27','Temporada ficticia') returning id",[comp]))[0].id;
  const division=(await query("insert into public.divisions(season_id,code,name) values($1,'test','Prueba') returning id",[season]))[0].id;
  const foreignDivision=(await query("insert into public.divisions(season_id,code,name) values($1,'otra','Otra prueba') returning id",[season]))[0].id;
  const teams=[];
  for(let i=0;i<17;i++) {
    const user=(await query('insert into auth.users values(gen_random_uuid()) returning id'))[0].id;
    const manager=(await query("insert into public.managers(auth_user_id,display_name) values($1,$2) returning id",[user,'Ficticio '+i]))[0].id;
    const team=(await query("insert into public.teams(division_id,manager_id,team_name) values($1,$2,$3) returning id",[i<16?division:foreignDivision,manager,'Equipo ficticio '+i]))[0].id;
    teams.push({user,team});
  }
  const div={divisionId:division,season:'2026_27',status:'draft',maxRoster:16,initialWealthCents:'7000000000',teamIds:teams.slice(0,16).map(x=>x.team)};
  // El indicador 'authorized' simula un contrato de transporte, SOLO local.
  const snapshot=normalizarCatalogo({...catalogoFicticio(),kind:'authorized',provider:'simulador-local',permissionRef:'Ensayo local artificial, no datos reales'});
  const plan=planificarReparto(snapshot,div,{seed:'sql-local',minimumCashCents:'1000000000'});
  const aplicar=async(p=plan,s=snapshot)=> (await query('select app_private.aplicar_arranque_piloto($1,$2::jsonb,$3::jsonb) as result',[division,JSON.stringify(s),JSON.stringify(p)]))[0].result;
  await assert.rejects(aplicar(plan,catalogoFicticio()),/no autorizado/);
  const tamper=structuredClone(plan);tamper.allocations.at(-1).cashCents='1';
  await assert.rejects(aplicar(tamper),/Presupuesto/);
  assert.deepEqual(await counts(),empty);
  assert.equal((await query('select sum(balance_cents)::text total from public.teams'))[0].total,'0');
  const cross=structuredClone(plan);cross.allocations.at(-1).teamId=teams.at(-1).team;
  await assert.rejects(aplicar(cross),/Equipo ajeno/);
  assert.deepEqual(await counts(),empty);
  const dup=structuredClone(plan);dup.allocations.at(-1).players[0]=dup.allocations[0].players[0];
  await assert.rejects(aplicar(dup),/duplicate key/);
  assert.deepEqual(await counts(),empty);
  console.log('PASS rollback tras fallo tardío, plan ajeno y futbolista duplicado: sin residuos');
  const result=await aplicar();
  assert.equal(result.assignedPlayers,240);
  assert.deepEqual(await counts(),{players:500,ownership:240,wallet:16,imports:1,prices:500,cycles:0});
  const rows=await query(`select t.id,t.balance_cents::text cash,
    count(r.player_id)::int players,
    (t.balance_cents+sum(p.current_market_value_cents))::text wealth,
    (select sum(w.delta_cents)::text from public.wallet_entries w where w.team_id=t.id) ledger
    from public.teams t join public.roster_ownership r on r.team_id=t.id
    join public.players p on p.id=r.player_id where t.division_id=$1 group by t.id`,[division]);
  assert.equal(rows.length,16);
  assert.ok(rows.every(x=>x.players===15&&x.wealth==='7000000000'&&x.cash===x.ledger&&BigInt(x.cash)>=1000000000n));
  assert.equal((await query('select status from public.seasons where id=$1',[season]))[0].status,'draft');
  assert.equal((await query('select balance_cents::text cash from public.teams where id=$1',[teams.at(-1).team]))[0].cash,'0');
  console.log('PASS catálogo, historial, 240 titularidades, 16 apuntes y saldo/patrimonio exactos; división ajena intacta');
  assert.deepEqual(await aplicar(),result);
  assert.deepEqual(await counts(),{players:500,ownership:240,wallet:16,imports:1,prices:500,cycles:0});
  await assert.rejects(aplicar({...plan,seed:'distinta'}),/ya inicializada/);
  for(const role of ['anon','authenticated','service_role','macroliga_runner']) {
    const f=await query("select has_function_privilege($1,'app_private.aplicar_arranque_piloto(uuid,jsonb,jsonb)','execute') allowed, has_table_privilege($1,'app_private.initialization_runs','SELECT') readable",[role]);
    assert.deepEqual(f[0],{allowed:false,readable:false});
  }
  await db.exec("set role authenticated");
  await query("select set_config('request.jwt.claim.sub',$1,false)",[teams[0].user]);
  const own=await query('select * from public.macroliga_mi_equipo()');
  assert.equal(own.length,1);assert.equal(own[0].equipo_id,teams[0].team);
  assert.equal((await query('select * from public.macroliga_plantilla_equipo($1)',[teams[0].team])).length,15);
  await assert.rejects(query('select * from public.macroliga_plantilla_equipo($1)',[teams.at(-1).team]));
  await db.exec('reset role');
  console.log('PASS idempotencia, permisos cerrados y RPC de plantilla en propia división');
  await assert.rejects(db.exec(await sql(rollback)),/requiere un plan/);
  await db.exec('rollback');
  assert.deepEqual(await counts(),{players:500,ownership:240,wallet:16,imports:1,prices:500,cycles:0});
  console.log('PASS rollback DDL protegido tras aplicar, sin borrar datos');
} finally {await db.close();}
