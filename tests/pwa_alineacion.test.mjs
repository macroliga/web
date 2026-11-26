import test from 'node:test';
import assert from 'node:assert/strict';
import {validarOnce} from '../app/alineacion.mjs';
import {crearCliente} from '../app/api.mjs';
test('once de 11 plazas, incompleto permitido, no admite repetidos, inactivos ni ajenos',()=>{
 const roster=[{id:'a',activo:true},{id:'b',activo:false}];
 assert.equal(validarOnce(['a',...Array(10).fill(null)],roster),true);
 assert.equal(validarOnce(['a','a',...Array(9).fill(null)],roster),false);
 assert.equal(validarOnce(['b',...Array(10).fill(null)],roster),false);
 assert.equal(validarOnce(['otro',...Array(10).fill(null)],roster),false);
 assert.equal(validarOnce([],roster),false);
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
