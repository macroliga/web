import test from 'node:test';
import assert from 'node:assert/strict';
import {aplicarPuntuaciones} from '../src/domain/importacion.mjs';
test('la misma importación dos veces no suma puntos dos veces',()=>{
  const entrada=[{claveJugadorPartido:'Jugador1:Partido1',revision:1,puntos:8}];
  const a=aplicarPuntuaciones(new Map(),entrada);
  const b=aplicarPuntuaciones(a.resultado,entrada);
  assert.deepEqual([a.nuevas,b.ignoradas,b.resultado.get('Jugador1:Partido1').puntos],[1,1,8]);
});
test('corrección de revision 2 reemplaza 8 por 6, no acumula 14',()=>{
  const inicio=new Map([['Jugador1:Partido1',{revision:1,puntos:8}]]);
  const b=aplicarPuntuaciones(inicio,[{claveJugadorPartido:'Jugador1:Partido1',revision:2,puntos:6}]);
  assert.equal(b.corregidas,1);
  assert.equal(b.resultado.get('Jugador1:Partido1').puntos,6);
});
test('revisión antigua no puede pisar revisión nueva',()=>{
  const inicio=new Map([['j:p',{revision:3,puntos:5}]]);
  assert.equal(aplicarPuntuaciones(inicio,[{claveJugadorPartido:'j:p',revision:2,puntos:12}]).resultado.get('j:p').puntos,5);
});
test('mismo número de revisión con puntos distintos: incidencia',()=>{
  const inicio=new Map([['j:p',{revision:1,puntos:5}]]);
  assert.throws(()=>aplicarPuntuaciones(inicio,[{claveJugadorPartido:'j:p',revision:1,puntos:12}]),/Conflicto de datos/);
});
