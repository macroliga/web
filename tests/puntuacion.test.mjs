import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularPuntuacionOnce, premioPorPuntos, premiosPorUltimos, ajustarPremio } from '../src/domain/puntuacion.mjs';
const j = (n,points) => ({playerId:`p${n}`, points});
test('54 puntos netos (incluidos negativos) equivalen a 540 000 euros', () => {
  const puntos=[8,7,-2,9,6,4,3,5,4,5,5];
  assert.equal(puntos.reduce((a,b)=>a+b,0),54);
  const r=calcularPuntuacionOnce(puntos.map((p,i)=>j(i,p)),0n);
  assert.equal(r.puntos,54);
  assert.equal(premioPorPuntos(r.puntos),54_000_000n);
});
test('huecos −4, jugadores que no puntúan no son huecos',()=>{
  const slots=[j(1,5),...Array(9).fill(null),j(11,0)];
  const r=calcularPuntuacionOnce(slots,0n);
  assert.equal(r.puntos,-31);
  assert.equal(r.huecos,9);
});
test('once completamente vacío puntúa cero, no −44',()=>{
  assert.equal(calcularPuntuacionOnce(Array(11).fill(null),0n).puntos,0);
});
test('saldo negativo al inicio anula puntos',()=>{
  assert.equal(calcularPuntuacionOnce(Array.from({length:11},(_,i)=>j(i,7)),-1n).puntos,0);
});
test('puntos deportivos aún no publicados no permiten cerrar jornada',()=>{
  const r=calcularPuntuacionOnce([j(1,null),...Array(10).fill(null)],0n);
  assert.equal(r.definitiva,false);
  assert.equal(r.pendientes,1);
});
test('puntuación negativa no da premio por puntos',()=>{
  assert.equal(premioPorPuntos(-5),0n);
});
test('tres últimos: preferencia al peor en la general anterior si empatan',()=>{
  const m=premiosPorUltimos([
    {equipoId:'a',puntos:20,puestoGeneralAnterior:8},
    {equipoId:'b',puntos:20,puestoGeneralAnterior:15},
    {equipoId:'c',puntos:20,puestoGeneralAnterior:12},
    {equipoId:'d',puntos:70,puestoGeneralAnterior:16},
  ]);
  assert.deepEqual([...m.entries()],[['b',150_000_000n],['c',100_000_000n],['a',50_000_000n]]);
});
test('desempate secundario no aprobado: error explícito',()=>{
  assert.throws(()=>premiosPorUltimos([
    {equipoId:'a',puntos:20,puestoGeneralAnterior:15},
    {equipoId:'b',puntos:20,puestoGeneralAnterior:15},
    {equipoId:'c',puntos:30,puestoGeneralAnterior:3},
  ]),/DESEMPATE_SECUNDARIO_PENDIENTE/);
});
test('corrección +2 puntos genera solo delta de 20.000 euros',()=>{
  assert.equal(ajustarPremio(premioPorPuntos(54),premioPorPuntos(56)),2_000_000n);
});
test('repetir la misma corrección no provoca segundo abono',()=>{
  assert.equal(ajustarPremio(premioPorPuntos(56),premioPorPuntos(56)),0n);
});
