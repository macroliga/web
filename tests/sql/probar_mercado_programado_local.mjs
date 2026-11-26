import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
if(!process.env.PGLITE_DIR)throw Error('Indicar PGLITE_DIR local, nunca base alojada');
const {PGlite}=await import(pathToFileURL(join(process.env.PGLITE_DIR,'dist/index.js')));
const db=new PGlite();
const q=async(sql,args=[]) =>(await db.query(sql,args)).rows;
const scalar=async(sql,args=[])=>Object.values((await q(sql,args))[0])[0];
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
 create function public.rls_auto_enable() returns void language plpgsql as $$ begin null;end $$;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon,service_role;`);
 const migrations=new URL('../../supabase/migrations/',import.meta.url);
 const names=(await readdir(migrations)).filter(n=>n.endsWith('.sql')).sort();
 for(const n of names){let sql=await readFile(new URL(n,migrations),'utf8');if(n.includes('0001_core'))sql=sql.replace('create extension if not exists pgcrypto;','-- UUID nativo local'); await db.exec(sql);}
 console.log('PASS '+names.length+' migraciones en '+await scalar('select version()'));
 const comp=await scalar("insert into public.competitions(code,name) values('test','Test') returning id");
 const season=await scalar("insert into public.seasons(competition_id,code,name,status) values($1,'test','Test','active') returning id",[comp]);
 const division=async code=>scalar("insert into public.divisions(season_id,code,name) values($1,$2,'Ficticio') returning id",[season,code]);
 const div=await division('pilot'),normal=await division('normal'),disabled=await division('disabled');
 const user=await scalar("insert into auth.users(id) values(gen_random_uuid()) returning id");
 const manager=await scalar("insert into public.managers(auth_user_id,display_name) values($1,'Ficticio') returning id",[user]);
 const team=await scalar("insert into public.teams(division_id,manager_id,team_name,balance_cents) values($1,$2,'Test',5000000000) returning id",[div,manager]);
 await q("insert into public.wallet_entries(team_id,operation_key,kind,delta_cents) values($1,'test-inicio','initial',5000000000)",[team]);
 const player=async(name,value,active=true)=>scalar("insert into public.players(name,position,current_market_value_cents,active) values($1,'MID',$2,$3) returning id",[name,value,active]);
 const cheap=await player('barato',40000000),bound=await player('límite',75000000),exp=await player('caro',100000000),winner=await player('puja barata',50000000),inactive=await player('inactivo',10000000,false),normalDay2=await player('segundo día',74000000);
 for(let i=0;i<30;i++)await player('nuevo '+i,100000000+i*100);
 const day=await scalar("select ((clock_timestamp() at time zone 'Europe/Madrid')::date-case when (clock_timestamp() at time zone 'Europe/Madrid')::time>=time '06:00' then 1 else 2 end)::text");
 const insertCycle=async d=>scalar("insert into public.market_cycles(division_id,opens_at,closes_at,publishes_at,status) values($1,($2::date+time '06:00') at time zone 'Europe/Madrid',(($2::date+1)+time '01:00') at time zone 'Europe/Madrid',(($2::date+1)+time '06:00') at time zone 'Europe/Madrid','open') returning id",[d,day]);
 const first=await insertCycle(div),second=await insertCycle(normal);
 for(const [d,c] of [[div,first],[normal,second]]){
  for(const [p,value,n] of [[cheap,40000000,1],[bound,75000000,1],[exp,100000000,1],[winner,50000000,1],[inactive,10000000,1],[normalDay2,74000000,2]])await q('insert into public.market_lots(cycle_id,division_id,player_id,minimum_bid_cents,day_number) values($1,$2,$3,$4,$5)',[c,d,p,value,n]);
 }
 const lot=await scalar('select id from public.market_lots where cycle_id=$1 and player_id=$2',[first,winner]);
 await q("insert into public.bids(lot_id,division_id,team_id,amount_cents,accepted_at) select $1,$2,$3,50000000,opens_at+interval '1 hour' from public.market_cycles where id=$4",[lot,div,team,first]);
 await q('insert into app_private.market_runner_divisions(division_id,enabled,bootstrap_cycle_id) values($1,true,$2),($3,true,null),($4,false,null)',[div,first,normal,disabled]);
 await assert.rejects(q('select app_private.procesar_mercado_programado($1)',[disabled]),/no habilitada/);
 const r=await scalar('select app_private.procesar_mercado_programado($1)',[div]);
 assert.equal(r.cerrados,1);assert.equal(r.publicados,1);
 const bad=await q("select player_id from public.roster_ownership where division_id=$1 and owner_kind='bad_team' order by player_id",[div]);
 assert.deepEqual(bad.map(x=>x.player_id).sort(),[cheap,normalDay2].sort());
 assert.equal(await scalar('select team_id from public.roster_ownership where division_id=$1 and player_id=$2',[div,winner]),team);
 assert.equal(Number(await scalar('select balance_cents from public.teams where id=$1',[team])),4950000000);
 assert.equal(Number(await scalar("select count(*) from public.transfer_operations where division_id=$1 and buyer_kind='bad_team'",[div])),2);
 assert.equal(await scalar('select status from public.market_cycles where id=$1',[first]),'published');
 await scalar('select app_private.procesar_mercado_programado($1)',[div]);
 assert.equal(Number(await scalar("select count(*) from public.transfer_operations where division_id=$1",[div])),3);
 assert.equal(await scalar('select app_private.publicar_ciclo($1)',[first]),0);
 const normalResult=await scalar('select app_private.procesar_mercado_programado($1)',[normal]);
 assert.equal(normalResult.publicados,1);
 assert.deepEqual((await q("select player_id from public.roster_ownership where division_id=$1 and owner_kind='bad_team'",[normal])).map(x=>x.player_id),[normalDay2]);
 if(r.preparados){
  assert.equal(r.abiertos,1);
  const current=await scalar("select id from public.market_cycles where division_id=$1 and status='open'",[div]);
  assert.equal(Number(await scalar('select count(*) from public.market_lots where cycle_id=$1',[current])),15);
  assert.equal(Number(await scalar('select count(*) from public.market_lots where cycle_id=$1 and player_id=$2',[current,cheap])),0);
  assert.equal(Number(await scalar("select count(*) from public.market_lots where cycle_id=$1 and player_id=$2 and day_number=2",[current,bound])),1);
 }
 assert.equal(await scalar("select has_function_privilege('authenticated','app_private.procesar_mercado_programado(uuid)','execute')"),false);
 assert.equal(await scalar("select has_function_privilege('anon','app_private.procesar_mercado_programado(uuid)','execute')"),false);
 console.log('PASS cierre, comprador real prioritario, excepción inicial, umbral estricto, activos, historial, reapertura, no duplicados y aislamiento');
}finally{await db.close();}
