import test from 'node:test';
import assert from 'node:assert/strict';
import {comienzoDeJornada,estadoAlineacion,cuentaAtras} from '../src/domain/calendario.mjs';
test('cierre por primer partido real, aunque la jornada comience en miércoles',()=>{
  const p=[
    {estado:'scheduled',horarioConfirmado:true,inicioUtc:'2026-12-02T20:00:00Z'},
    {estado:'scheduled',horarioConfirmado:true,inicioUtc:'2026-12-02T18:00:00Z'}
  ];
  assert.equal(comienzoDeJornada(p),'2026-12-02T18:00:00.000Z');
});
test('si se aplaza el primer partido, se calcula el siguiente',()=>{
  const p=[
    {estado:'postponed',horarioConfirmado:true,inicioUtc:'2026-12-02T18:00:00Z'},
    {estado:'scheduled',horarioConfirmado:true,inicioUtc:'2026-12-02T20:00:00Z'}
  ];
  assert.equal(comienzoDeJornada(p),'2026-12-02T20:00:00.000Z');
});
test('horarios pendientes no producen falsa cuenta atrás',()=>{
  assert.equal(comienzoDeJornada([{estado:'scheduled',horarioConfirmado:false,inicioUtc:null}]),null);
  assert.equal(estadoAlineacion('2026-12-02T12:00:00Z',null),'PENDIENTE_DE_CONFIRMAR');
});
test('a la hora exacta de inicio ya no se guarda alineación',()=>{
  assert.equal(estadoAlineacion('2026-12-02T18:00:00Z','2026-12-02T18:00:00Z'),'BLOQUEADA');
  assert.equal(estadoAlineacion('2026-12-02T17:59:59Z','2026-12-02T18:00:00Z'),'ABIERTA');
  assert.deepEqual(cuentaAtras('2026-12-02T16:00:00Z','2026-12-02T18:00:00Z'), {dias:0,horas:2,minutos:0,segundos:0});
});
