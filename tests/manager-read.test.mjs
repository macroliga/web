import test from 'node:test';
import assert from 'node:assert/strict';
import {managerRead} from '../src/domain/manager-read.mjs';
const id='00000000-0000-4000-8000-000000000001';
function mock({users=[id,id], rows=[], error=null}={}) {
 const calls=[];
 return {calls,auth:{getUser:async()=>({data:{user:users[0]?{id:users.shift()}:null}})},rpc:async(name,args)=>{calls.push([name,args]);return {data:rows,error}}};
}
test('equity includes negative cash',async()=>{
 const c=mock({rows:[{saldo_centimos:-100,valor_plantilla_centimos:1000}]});
 assert.equal((await managerRead(c).teams())[0].patrimonio_centimos,'900');
 assert.deepEqual(c.calls,[['macroliga_mis_equipos',{}]]);
});
test('no session means no RPC',async()=>{
 const c=mock({users:[null]});await assert.rejects(managerRead(c).teams(),/Sesión no válida/);assert.equal(c.calls.length,0);
});
test('identity change discards results',async()=>{
 const c=mock({users:[id,'other']});await assert.rejects(managerRead(c).teams(),/Sesión modificada/);
});
test('roster forwards only team id',async()=>{
 const c=mock();assert.deepEqual(await managerRead(c).roster(id),[]);assert.deepEqual(c.calls,[['macroliga_mi_plantilla',{p_equipo_id:id}]]);
});
test('invalid team never reaches RPC',()=>{
 const c=mock();assert.throws(()=>managerRead(c).roster('bad'),/Equipo inválido/);assert.equal(c.calls.length,0);
});
test('RPC errors propagate',async()=>{
 const c=mock({error:new Error('denied')});await assert.rejects(managerRead(c).teams(),/denied/);
});
