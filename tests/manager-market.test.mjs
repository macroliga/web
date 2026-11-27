import test from 'node:test';
import assert from 'node:assert/strict';
import {managerMarket} from '../src/domain/manager-market.mjs';
const id='00000000-0000-4000-8000-000000000001';
function mock(user=id){const calls=[];return {calls,auth:{getUser:async()=>({data:{user:user?{id:user}:null}})},rpc:async(n,a)=>{calls.push([n,a]);return {data:[]}}};}
test('market and bids use scoped RPCs',async()=>{const c=mock(),m=managerMarket(c);await m.market(id);await m.bids();await m.bid(id,75000000);await m.withdraw(id);assert.deepEqual(c.calls,[['macroliga_mi_mercado',{p_equipo_id:id}],['macroliga_mis_pujas',{}],['macroliga_presentar_puja',{p_lote_id:id,p_importe_centimos:75000000}],['macroliga_retirar_puja',{p_puja_id:id}]]);});
test('reject invalid amounts and IDs before RPC',()=>{const c=mock(),m=managerMarket(c);for(const n of [0,-1,1.5,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>m.bid(id,n));assert.throws(()=>m.withdraw('bad'));assert.equal(c.calls.length,0);});
test('unauthenticated user cannot bid',async()=>{const c=mock(null);await assert.rejects(managerMarket(c).bid(id,100),/Sesión no válida/);assert.equal(c.calls.length,0);});
