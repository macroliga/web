import test from 'node:test';
import assert from 'node:assert/strict';
import {FORMACIONES,plazas,validarOnce,colocarOnce,inferirFormacion} from '../app/alineacion.mjs';
import {crearCliente} from '../app/api.mjs';
const roster=Object.entries({GK:2,DEF:6,MID:6,FWD:4}).flatMap(([posicion,n])=>Array.from({length:n},(_,i)=>({id:posicion+i,posicion,activo:true})));
const once=f=>plazas(f).map((p,i,a)=>p+(a.slice(0,i).filter(x=>x===p).length));
test('siete esquemas válidos y once completo de posiciones correctas',()=>{
 assert.equal(FORMACIONES.length,7);
 for(const f of FORMACIONES){
  const ids=once(f);
  assert.equal(ids.length,11);assert.equal(validarOnce(ids,roster,{completo:true}),true);
  assert.equal(inferirFormacion(ids,roster),f);
  assert.deepEqual(colocarOnce(ids.reverse(),roster,f).sobrantes,[]);
 }
});
test('borradores compatibles, once oficial obligatorio, sin repetidos, inactivos ni ajenos',()=>{
 const partial=['GK0',...Array(10).fill(null)];
 assert.equal(validarOnce(partial,roster),true);
 assert.equal(validarOnce(partial,roster,{completo:true}),false);
 assert.equal(validarOnce(['GK0','GK0',...Array(9).fill(null)],roster),false);
 assert.equal(validarOnce(['GK0','GK1',...Array(9).fill(null)],roster),false);
 assert.equal(validarOnce(['DEF0','DEF1','DEF2','DEF3','DEF4','DEF5',...Array(5).fill(null)],roster),false);
 assert.equal(validarOnce(['FWD0','FWD1','FWD2','FWD3',...Array(7).fill(null)],roster),false);
 assert.equal(validarOnce(['MID0','MID1','MID2','MID3','MID4','MID5',...Array(5).fill(null)],roster),false);
 assert.equal(validarOnce(['otro',...Array(10).fill(null)],roster),false);
 assert.equal(validarOnce(['GK0',...Array(10).fill(null)],roster.map(p=>p.id==='GK0'?{...p,activo:false}:p)),false);
 assert.equal(validarOnce([],roster),false);
});
test('cambio de esquema y datos históricos nunca ocultan ni eliminan jugadores',()=>{
 const ids=[...once('4-4-2')];
 const {slots,sobrantes}=colocarOnce(ids,roster,'3-4-3');
 assert.equal(sobrantes.length,1);assert.equal(roster.find(p=>p.id===sobrantes[0]).posicion,'DEF');
 assert.deepEqual([...slots.filter(Boolean),...sobrantes].sort(),ids.sort());
 const old=colocarOnce(['otro','GK0','GK1'],roster,'4-4-2');
 assert.deepEqual(old.sobrantes,['otro','GK1']);
});
test('RPC de operaciones limitadas al usuario y no confunden error de puja con cierre de sesión',async()=>{
 let calls=0;
 const c=crearCliente({supabaseUrl:'https://prueba.supabase.co',anonKey:'sb_publishable_ficticia',fetchImpl:async(url,options)=>{
  calls++;assert.match(url,/macroliga_presentar_puja$/);assert.equal(options.headers.Authorization,'Bearer usuario-ficticio');
  assert.deepEqual(JSON.parse(options.body),{p_lote_id:'lote',p_importe_centimos:'120000'});
  return {ok:false,status:400,json:async()=>({code:'22023',message:'Mercado cerrado'})};
 }});
 await assert.rejects(c.operar('macroliga_admin_iniciar_todo',{},'usuario-ficticio'),/no permitida/);
 await assert.rejects(c.operar('macroliga_presentar_puja',{},null),/no permitida/);
 await assert.rejects(c.operar('macroliga_presentar_puja',{p_lote_id:'lote',p_importe_centimos:'120000'},'usuario-ficticio'),e=>e.operationMessage==='Mercado cerrado'&&!e.sesionRevocada);
 assert.equal(calls,1);
});

