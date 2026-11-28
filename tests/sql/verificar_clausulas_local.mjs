// Ejecutar SOLO contra PostgreSQL 17 desechable, vacío y en loopback.
// npm install --ignore-scripts; PGHOST=127.0.0.1 PGPORT=<puerto local>
// PGDATABASE=macroliga_clause_test PGUSER=postgres PGPASSWORD=fixture-macroliga-only
// node tests/sql/verificar_clausulas_local.mjs
import pg from 'pg';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
const {Client}=pg;
assert.equal(process.env.PGHOST,'127.0.0.1');
assert.equal(process.env.PGDATABASE,'macroliga_clause_test');
assert.equal(process.env.PGUSER,'postgres');
assert.equal(process.env.PGPASSWORD,'fixture-macroliga-only');
assert.match(process.env.PGPORT||'',/^\d{1,5}$/);
const config={host:'127.0.0.1',port:Number(process.env.PGPORT),user:'postgres',
  password:'fixture-macroliga-only',database:'macroliga_clause_test',ssl:false,connectionTimeoutMillis:5000};
const client=new Client(config);await client.connect();client.on('notice',n=>console.log('NOTICE:',n.message));
const root=new URL('../../',import.meta.url);
const sig="app_private._contabilizar_traspaso(uuid,uuid,uuid,uuid,text,text,bigint,text,text)";
const file=async path=>readFile(new URL(path,root),'utf8');
const run=async path=>{console.log('=== '+path);await client.query(await file(path));console.log('OK '+path);};
const paths=async (dir,match)=>(await readdir(new URL(dir+'/',root))).sort().filter(match).map(x=>dir+'/'+x);
const snapshot=async()=>(await client.query("select md5(pg_get_functiondef($1::regprocedure)) as hash,proacl::text as acl from pg_proc where oid=$1::regprocedure",[sig])).rows[0];
const n=async sql=>Number((await client.query(sql)).rows[0].n);
const fixtureId=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
const a=fixtureId(1),b=fixtureId(2),division=fixtureId(12),season=fixtureId(11);
const player=fixtureId(42),teamA=fixtureId(31),teamB=fixtureId(33);
const login=async(c,id)=>{
  await c.query('begin; set local role authenticated');
  await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[id,JSON.stringify({sub:id,role:'authenticated'})]);
};
async function configurarYCarrera(){
  const f=await file('tests/sql/clausulas_equipo_malo.sql');
  // Reutiliza las mismas identidades ficticias, y las confirma temporalmente SOLO
  // aquí: dos sesiones distintas necesitan ver las mismas filas. Se limpian al final.
  const start=f.indexOf('begin;'),end=f.indexOf('do $$',start);
  assert.ok(start>=0&&end>start);
  await client.query(f.slice(start,end)+'; commit;');
  try{
    await client.query("update public.teams set balance_cents=100000000 where id=$1",[teamB]);
    const seed=await file('docs/propuestas/20261127_clausulas_equipo_malo_tramos.sql');
    await client.query(seed.replace(":'season_id'","'"+season+"'"));
    assert.equal(await n("select count(*) as n from public.clause_rules"),388);
    assert.equal(await n("select count(*) as n from public.clause_windows"),0);
    assert.equal(await n("select count(*) as n from public.clause_rules a join public.clause_rules b on a.id<b.id and a.season_id=b.season_id and a.version=b.version and a.from_value_cents<=b.to_value_cents and b.from_value_cents<=a.to_value_cents"),0);
    await client.query("insert into public.clause_windows(division_id,opens_at,closes_at,reason) values ($1,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour','fixture local')",[division]);
    const c1=new Client({...config,application_name:'macroliga-local-race-a'}),c2=new Client({...config,application_name:'macroliga-local-race-b'});
    await c1.connect();await c2.connect();
    let pending;
    try{
      await login(c1,a);await login(c2,b);
      const quote="select public.macroliga_cotizar_clausula_equipo_malo($1,$2) as q";
      for(const c of [c1,c2]){
        const q=(await c.query(quote,[division,player])).rows[0].q;
        assert.equal(q.disponible,true);assert.equal(q.importe_centimos,'70200000');
      }
      const pay="select public.macroliga_pagar_clausula_equipo_malo($1,$2,$3,$4) as op";
      const win=(await c1.query(pay,[division,player,'70200000',fixtureId(96)])).rows[0].op;
      assert.ok(win);
      pending=c2.query(pay,[division,player,'70200000',fixtureId(97)]).then(result=>({result}),error=>({error}));
      let blocked=false;
      for(let i=0;i<80;i++){
        const r=(await client.query("select wait_event_type from pg_stat_activity where application_name='macroliga-local-race-b'")).rows[0];
        if(r?.wait_event_type==='Lock'){blocked=true;break;}await delay(25);
      }
      assert.equal(blocked,true,'No se observó a segunda sesión esperando bloqueo real');
      await c1.query('commit');
      const loser=await pending;
      assert.equal(loser.error?.code,'22023','La segunda compra debe rechazarse tras el bloqueo');
      await c2.query('rollback');
      const rows=(await client.query("select id,balance_cents from public.teams order by id")).rows;
      assert.deepEqual(rows,[{id:teamA,balance_cents:'29800000'},{id:teamB,balance_cents:'100000000'}]);
      assert.equal(await n("select count(*) as n from public.transfer_operations where kind='bad_team_clause' and status='committed'"),1);
      assert.equal(await n("select count(*) as n from public.wallet_entries where delta_cents=-70200000"),1);
      assert.equal((await client.query("select team_id from public.roster_ownership where division_id=$1 and player_id=$2",[division,player])).rows[0].team_id,teamA);
      console.log('OK: 388 reglas con tramos sin solapamiento; sin ventanas por defecto; carrera comprobada: bloqueo real + un único cargo y propietario.');
    }finally{
      try{await c1.query('rollback')}catch{} 
      if(pending)await pending;
      try{await c2.query('rollback')}catch{}
      await Promise.all([c1.end(),c2.end()]);
    }
  }finally{
    // Base local exclusiva inicialmente vacía; limpieza limitada a esta prueba.
    await client.query("begin; delete from public.roster_events; delete from public.wallet_entries; delete from public.transfer_operations; delete from public.roster_ownership; delete from public.clause_windows; delete from public.clause_rules; delete from public.teams; delete from public.managers; delete from public.players; delete from public.divisions; delete from public.seasons; delete from public.competitions; delete from auth.users; commit;");
  }
}
try{
 assert.equal(await n("select count(*) as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private','auth') and c.relkind in ('r','p')"),0,'Base no vacía');
 console.log((await client.query('select version()')).rows[0].version);
 await run('tests/sql/bootstrap_postgres_ci.sql');
 for(const path of await paths('supabase/migrations',x=>x.endsWith('.sql')))await run(path);
 await run('tests/sql/base_helper_manager_activo.sql');
 const before=await snapshot();console.log('ANTES',before);
 const regressions=await paths('tests/sql',x=>/^202611.*\.sql$/.test(x));
 for(const path of regressions)await run(path);
 await run('docs/propuestas/20261127_clausulas_equipo_malo.sql');
 await run('tests/sql/clausulas_equipo_malo.sql');
 await configurarYCarrera();
 for(const path of regressions)await run(path);
 await run('docs/propuestas/20261127_clausulas_equipo_malo_rollback.sql');
 const after=await snapshot();console.log('DESPUÉS',after);assert.deepEqual(after,before);
 assert.equal(await n("select count(*) as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('macroliga_cotizar_clausula_equipo_malo','macroliga_pagar_clausula_equipo_malo')"),0);
 assert.equal(await n("select ((select count(*) from auth.users)+(select count(*) from public.competitions)+(select count(*) from public.transfer_operations)+(select count(*) from public.wallet_entries)+(select count(*) from public.clause_rules)+(select count(*) from public.clause_windows)) as n"),0);
 console.log('VERIFICACIÓN SQL COMPLETA: '+regressions.length+' regresiones antes y después; cláusulas; configuración; concurrencia; RPC y RLS; rollback; cero fixtures.');
}finally{await client.end()}
