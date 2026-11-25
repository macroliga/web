import test from 'node:test';
import assert from 'node:assert/strict';
import { publicarCicloSimulado } from '../src/domain/publicacion_mercado.mjs';
const M=100_000_000n;
const equipo=(saldo,nombres=[])=>({saldoCentimos:BigInt(saldo)*M,jugadores:new Set(nombres),maximoFutbolistas:16});
const estado=()=>({equipos:new Map([['a',equipo(10,Array.from({length:15},(_,i)=>`a${i}`))],['b',equipo(10)]]),
  propietarios:new Map(), publicaciones:new Set(),movimientos:[]});
const p=(loteId,teamId,importe,id)=>({loteId,teamId,importeCentimos:BigInt(importe)*M,
  id,estado:'active',registradaEn:'2026-11-25T10:00:00Z'});
const plan={cicloId:'ciclo-1', publicaEn:'2026-11-26T05:00:00Z',
  lotes:[{loteId:'lote-1',jugadorId:'jugador-1'}],
  pujasAdmitidas:[p('lote-1','a',5,'1'),p('lote-1','b',4,'2')]};

test('publicar antes de las 06:00 está bloqueado (hora invierno peninsular)',()=>{
  assert.throws(()=>publicarCicloSimulado(estado(),plan,'2026-11-26T04:59:59Z'),/PUBLICACION_PREMATURA/);
});
test('a las 06:00 se aplican dinero, plantilla y registro conjuntamente',()=>{
  const antes=estado();
  const r=publicarCicloSimulado(antes,plan,'2026-11-26T05:00:00Z');
  assert.equal(antes.equipos.get('a').saldoCentimos,10n*M);
  assert.equal(antes.equipos.get('a').jugadores.size,15);
  assert.equal(r.estado.equipos.get('a').saldoCentimos,5n*M);
  assert.equal(r.estado.equipos.get('a').jugadores.size,16);
  assert.equal(r.estado.propietarios.get('jugador-1'),'a');
  assert.equal(r.estado.movimientos.length,1);
});
test('repetir la publicación no descuenta dinero por segunda vez',()=>{
  const primera=publicarCicloSimulado(estado(),plan,'2026-11-26T05:00:00Z');
  const segunda=publicarCicloSimulado(primera.estado,plan,'2026-11-26T05:10:00Z');
  assert.equal(segunda.yaPublicado,true);
  assert.equal(segunda.nuevosMovimientos,0);
  assert.equal(segunda.estado.movimientos.length,1);
  assert.equal(segunda.estado.equipos.get('a').saldoCentimos,5n*M);
});
test('si hay anomalía en mitad del proceso se cancela todo sin segundo ganador',()=>{
  const antes=estado();
  const erroneo={...plan,lotes:[...plan.lotes,{loteId:'lote-2',jugadorId:'jugador-2'}],
    pujasAdmitidas:[...plan.pujasAdmitidas,p('lote-2','a',2,'3')]};
  assert.throws(()=>publicarCicloSimulado(antes,erroneo,'2026-11-26T05:00:00Z'),/INCONSISTENCIA: plantilla/);
  assert.equal(antes.equipos.get('a').saldoCentimos,10n*M);
  assert.equal(antes.movimientos.length,0);
  assert.equal(antes.publicaciones.size,0);
});
