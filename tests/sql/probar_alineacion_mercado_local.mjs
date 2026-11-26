import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
if(!process.env.PGLITE_DIR)throw Error('Indicar PGLITE_DIR local, nunca una URL alojada');
const {PGlite}=await import(pathToFileURL(join(process.env.PGLITE_DIR,'dist/index.js')));
const db=new PGlite();
const migrations=new URL('../../supabase/migrations/',import.meta.url);
const root=new URL('../../',import.meta.url);
const q=async(s,args=[]) => (await db.query(s,args)).rows;
const scalar=async(s,args=[])=>Object.values((await q(s,args))[0])[0];
const id=()=>scalar('select gen_random_uuid()');
const denied=async(p,pattern)=>assert.rejects(p,pattern);
const as=async(user,role='authenticated')=>{await db.exec('reset role; set role '+role);await q("select set_config('request.jwt.claim.sub',$1,false)",[user??'']);};
const owner=()=>db.exec('reset role');
const rpc=(name,args)=>scalar('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+')',args);
try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
 create function public.rls_auto_enable() returns void language plpgsql as $$ begin null;end $$;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon,service_role;`);
 const names=(await readdir(migrations)).filter(x=>x.endsWith('.sql')).sort();
 for(const name of names){let sql=await readFile(new URL(name,migrations),'utf8');if(name.includes('0001_core'))sql=sql.replace('create extension if not exists pgcrypto;','-- UUID nativo PostgreSQL local');await db.exec(sql);}
 await db.exec(await readFile(new URL(names.at(-1),migrations),'utf8'));
 console.log('PASS '+names.length+' migraciones reales en '+await scalar('select version()'));
 const comp=await scalar("insert into public.competitions(code,name) values('test','Test') returning id");
 const season=await scalar("insert into public.seasons(competition_id,code,name) values($1,'test','Test') returning id",[comp]);
 const div=await scalar("insert into public.divisions(season_id,code,name) values($1,'a','A') returning id",[season]);
 const foreign=await scalar("insert into public.divisions(season_id,code,name) values($1,'b','B') returning id",[season]);
 const users=[],teams=[];
 for(let i=0;i<4;i++){const u=await id();await q('insert into auth.users(id) values($1)',[u]);users.push(u);
 const m=await scalar("insert into public.managers(auth_user_id,display_name) values($1,'Ficticio') returning id",[u]);
 teams.push(await scalar("insert into public.teams(division_id,manager_id,team_name,balance_cents) values($1,$2,'Ficticio',2000000000) returning id",[i===3?foreign:div,m]));}
 const player=async(name,pos='MID')=>scalar("insert into public.players(name,position,current_market_value_cents) values($1,$2,100000000) returning id",[name,pos]);
 const p1=await player('Uno','GK'),p2=await player('Dos'),p3=await player('Tres'),p4=await player('Computer');
 for(const [p,t,d] of [[p1,teams[0],div],[p2,teams[0],div],[p3,teams[1],div]])await q("insert into public.roster_ownership(division_id,player_id,team_id,owner_kind) values($1,$2,$3,'team')",[d,p,t]);
 const lineas={GK:[p1],DEF:[],MID:[p2],FWD:[]};
 for(const [pos,n] of Object.entries({GK:2,DEF:5,MID:5,FWD:3})){
   while(lineas[pos].length<n){
     const p=await player('Ficticio '+pos+lineas[pos].length,pos);
     await q("insert into public.roster_ownership(division_id,player_id,team_id,owner_kind) values($1,$2,$3,'team')",[div,p,teams[0]]);
     lineas[pos].push(p);
   }
 }
 const slots=[p1,p2,...Array(9).fill(null)];
 const formaciones=[[3,4,3],[3,5,2],[4,3,3],[4,4,2],[4,5,1],[5,3,2],[5,4,1]];
 const once=([d,m,f])=>[p1,...lineas.DEF.slice(0,d),...lineas.MID.slice(0,m),...lineas.FWD.slice(0,f)];

 await as(null,'anon');
 await denied(rpc('macroliga_estado_alineacion',[div]),/permission denied/);
 await denied(rpc('macroliga_operaciones_mercado',[div]),/permission denied/);
 await as(users[0]);
 await denied(q('select * from app_private.lineup_drafts'),/permission denied/);
 await denied(q('select * from public.bids'),/permission denied/);
 await denied(rpc('macroliga_estado_alineacion',[foreign]),/No autorizado/);
 await denied(rpc('macroliga_operaciones_mercado',[foreign]),/No autorizado/);
 assert.equal((await rpc('macroliga_estado_alineacion',[div])).jornada_id,null);
 assert.equal(await rpc('macroliga_guardar_alineacion',[div,null,slots,0]),1);
 assert.deepEqual((await rpc('macroliga_estado_alineacion',[div])).borrador.slots,slots);
 await denied(rpc('macroliga_guardar_alineacion',[div,null,slots,0]),/ha cambiado/);
 await denied(rpc('macroliga_guardar_alineacion',[div,null,[p1,p1,...Array(9).fill(null)],1]),/No repitas/);
 await denied(rpc('macroliga_guardar_alineacion',[div,null,[p3,...Array(10).fill(null)],1]),/tu plantilla/);
 await denied(rpc('macroliga_guardar_alineacion',[div,null,[...lineas.GK,...Array(9).fill(null)],1]),/Formación inválida/);
 await as(users[1]);assert.equal((await rpc('macroliga_estado_alineacion',[div])).borrador,null);
 await denied(rpc('macroliga_guardar_alineacion',[div,null,slots,0]),/tu plantilla/);
 await owner();
 const j=await scalar("insert into public.gameweeks(division_id,number,lineup_lock_at) values($1,1,now()+interval '1 hour') returning id",[div]);
 const f=await scalar("insert into public.fixtures(provider,external_id,kickoff_at,status) values('test','1',now()+interval '20 minutes','TIMED') returning id");
 await q('insert into public.gameweek_fixtures values($1,$2)',[j,f]);
 await as(users[0]);let data=await rpc('macroliga_estado_alineacion',[div]);assert.equal(data.editable,true);assert.equal(data.partidos.length,1);
 await denied(rpc('macroliga_guardar_alineacion',[div,j,slots,0]),/Formación inválida/);
 await denied(rpc('macroliga_guardar_alineacion',[div,j,[...lineas.GK,...lineas.DEF.slice(0,3),...lineas.MID.slice(0,4),...lineas.FWD.slice(0,2)],0]),/Formación inválida/);
 await denied(rpc('macroliga_guardar_alineacion',[div,j,[p1,...lineas.DEF.slice(0,2),...lineas.MID,...lineas.FWD],0]),/Formación inválida/);
 await denied(rpc('macroliga_guardar_alineacion',[div,j,[p1,...lineas.DEF,...lineas.MID],0]),/Formación inválida/);
 let version=0;
 for(const f of formaciones){
   const seleccion=once(f);
   assert.equal(await rpc('macroliga_guardar_alineacion',[div,j,seleccion,version]),++version);
   assert.deepEqual((await rpc('macroliga_estado_alineacion',[div])).slots,seleccion);
 }
 await denied(rpc('macroliga_guardar_alineacion',[div,j,once(formaciones[0]),0]),/ha cambiado/);

 await owner();await q("update public.fixtures set kickoff_at=now()-interval '1 second' where id=$1",[f]);
 await as(users[0]);assert.equal((await rpc('macroliga_estado_alineacion',[div])).editable,false);
 await denied(rpc('macroliga_guardar_alineacion',[div,j,once(formaciones[0]),version]),/cerrada/);
 await as(users[3]);await denied(rpc('macroliga_guardar_alineacion',[foreign,j,slots,0]),/Jornada no disponible/);
 console.log('PASS borrador privado, once real, versión, propietario, división y bloqueo por primer partido');
 await owner();const cycle=await scalar("insert into public.market_cycles(division_id,opens_at,closes_at,publishes_at,status) values($1,now()-interval '1 hour',now()+interval '1 hour',now()+interval '2 hour','draft') returning id",[div]);
 const lot=await scalar('insert into public.market_lots(cycle_id,division_id,player_id,minimum_bid_cents) values($1,$2,$3,100000000) returning id',[cycle,div,p4]);
 await as(users[0]);let market=await rpc('macroliga_operaciones_mercado',[div]);assert.equal(market.pujas_abiertas,false);assert.equal(market.lotes[0].lote_id,lot);
 await denied(rpc('macroliga_presentar_puja',[lot,100000000]),/cerrado/);
 await denied(rpc('macroliga_operar_venta',[div,'listar',p2,130000000]),/Mercado cerrado/);
 await owner();await q("update public.market_cycles set status='open' where id=$1",[cycle]);
 await as(users[0]);await denied(rpc('macroliga_operar_venta',[div,'listar',p2,130000000]),/no activadas/);
 const bid=await rpc('macroliga_presentar_puja',[lot,150000000]);assert.equal((await rpc('macroliga_operaciones_mercado',[div])).lotes[0].puja_id,bid);
 await as(users[1]);assert.equal((await rpc('macroliga_operaciones_mercado',[div])).lotes[0].puja_id,null);await denied(rpc('macroliga_retirar_puja',[bid]),/autorizad|disponible|inexistente|no encontrada/i);
 await as(users[0]);assert.equal(await rpc('macroliga_retirar_puja',[bid]),true);
 await owner();await q('insert into app_private.manager_trade_policies(division_id,enabled) values($1,true)',[div]);
 await as(users[0]);await denied(rpc('macroliga_operar_venta',[div,'listar',p3,130000000]),/tu plantilla/);
 await denied(rpc('macroliga_operar_venta',[div,'listar',p2,100000000]),/inferior/);
 const listing=await rpc('macroliga_operar_venta',[div,'listar',p2,130000000]);
 await denied(rpc('macroliga_operar_venta',[div,'listar',p2,130000000]),/ya está/);
 await denied(rpc('macroliga_operar_venta',[div,'ofertar',listing,140000000]),/no disponible/);
 await as(users[1]);await denied(rpc('macroliga_operar_venta',[div,'cancelar',listing,null]),/no disponible/);
 const offer=await rpc('macroliga_operar_venta',[div,'ofertar',listing,140000000]);
 assert.equal((await rpc('macroliga_operaciones_mercado',[div])).ofertas[0].id,offer);
 await denied(rpc('macroliga_operar_venta',[div,'aceptar',offer,null]),/no disponible/);
 await as(users[2]);assert.equal((await rpc('macroliga_operaciones_mercado',[div])).ofertas.length,0);
 await as(users[3]);assert.equal((await rpc('macroliga_operaciones_mercado',[foreign])).anuncios.length,0);
 await denied(rpc('macroliga_operar_venta',[foreign,'cancelar',listing,null]),/no disponible/);
 await as(users[0]);assert.equal((await rpc('macroliga_operaciones_mercado',[div])).ofertas[0].enviada,false);
 const transfer=await rpc('macroliga_operar_venta',[div,'aceptar',offer,null]);
 assert.equal(await rpc('macroliga_operar_venta',[div,'aceptar',offer,null]),transfer);
 await owner();assert.equal(await scalar('select team_id from public.roster_ownership where division_id=$1 and player_id=$2',[div,p2]),teams[1]);
 assert.equal(Number(await scalar('select count(*) from public.wallet_entries')),2);
 assert.equal(Number(await scalar('select count(*) from public.transfer_operations')),1);
 console.log('PASS puja/retirada, privacidad, bloqueo por ciclo y política, venta, doble aceptación idempotente y saldo contable');
 for(const name of ['20261126_reglas_formacion_rollback.sql','20261126_operaciones_mercado_rollback.sql','20261126_alineacion_segura_rollback.sql'])await db.exec(await readFile(new URL('docs/propuestas/'+name,root),'utf8'));
 assert.equal(Number(await scalar('select count(*) from public.lineups')),1);
 assert.equal(Number(await scalar('select count(*) from app_private.lineup_drafts')),1);
 assert.equal(Number(await scalar('select count(*) from public.transfer_operations')),1);
 for(const name of names.slice(-3))await db.exec(await readFile(new URL(name,migrations),'utf8'));
 console.log('PASS rollback sin borrar datos y reinstalación');
 const officialComp=await scalar("insert into public.competitions(code,name) values('MACROLIGA_PILOTO_INVIERNO_2026','Ficticio calendario') returning id");
 const officialSeason=await scalar("insert into public.seasons(competition_id,code,name) values($1,'2026_27','Ficticio') returning id",[officialComp]);
 const officialDiv=await scalar("insert into public.divisions(season_id,code,name) values($1,'PILOTO','Ficticio') returning id",[officialSeason]);
 for(let i=0;i<16;i++){
   const user=await id();await q('insert into auth.users(id) values($1)',[user]);
   const m=await scalar("insert into public.managers(auth_user_id,display_name) values($1,'Ficticio') returning id",[user]);
   await q("insert into public.teams(division_id,manager_id,team_name) values($1,$2,'Ficticio')",[officialDiv,m]);
 }
 for(const club of ['Levante','Racing','Betis','Rayo Vallecano','Málaga','Athletic','Elche','Atlético','Real Madrid','Alavés','Valencia','Osasuna','Deportivo','Barcelona','Celta','Villarreal','Real Sociedad','Sevilla','Espanyol','Getafe']){
   const c=await scalar('insert into public.football_clubs(name) values($1) returning id',[club]);
   await q("insert into public.players(name,position,club_id) values('Ficticio','MID',$1)",[c]);
 }
 const seed=await readFile(new URL('scripts/sql/configurar_jornada14_20261127.sql',root),'utf8');
 // No alterar el SQL de producción: si se ejecuta después del 27/11, sustituir
 // solo la fecha para comprobar el guard (la prueba histórica usa fecha futura).
 const seedTest=Date.now()<Date.parse('2026-11-27T21:00:00+01:00')?seed:seed.replaceAll('2026-11-27 21:00:00+01','2099-11-27 21:00:00+01');
 await db.exec(seedTest);
 assert.equal(Number(await scalar("select count(*) from public.gameweek_fixtures gf join public.gameweeks g on g.id=gf.gameweek_id where g.division_id=$1",[officialDiv])),10);
 await denied(db.exec(seedTest),/Ya hay jornadas/);await db.exec('rollback');
 await db.exec(await readFile(new URL('docs/propuestas/20261126_jornada14_rollback.sql',root),'utf8'));
 assert.equal(Number(await scalar('select count(*) from public.gameweeks where division_id=$1',[officialDiv])),0);
 console.log('PASS alta de calendario completo, rechazo de sobreescritura y rollback seguro');
}finally{await db.close();}
