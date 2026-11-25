import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { comienzoDeJornada, cuentaAtras } from '../src/domain/calendario.mjs';
import { ordenarPujasDeLote, calcularGanadores } from '../src/domain/mercado.mjs';
import { publicarCicloSimulado } from '../src/domain/publicacion_mercado.mjs';
import { aplicarPuntuaciones } from '../src/domain/importacion.mjs';

const partido=(estado, inicioUtc, horarioConfirmado=true) => ({estado, inicioUtc, horarioConfirmado});

test('calendario: POSTPONED mayúsculas no adelanta la cuenta atrás', () => {
  const partidos=[
    partido('POSTPONED','2026-12-04T18:00:00Z'),
    partido('TIMED','2026-12-05T20:00:00Z'),
  ];
  assert.equal(comienzoDeJornada(partidos),'2026-12-05T20:00:00.000Z');
});
test('calendario: estados inesperados o suspendidos no dan falsa hora de cierre', () => {
  assert.equal(comienzoDeJornada([
    partido('SUSPENDED','2026-12-04T18:00:00Z'),
    partido('DESCONOCIDO','2026-12-04T20:00:00Z'),
  ]),null);
});
test('calendario: TIMED, scheduled, IN_PLAY mantienen el inicio real', () => {
  assert.equal(comienzoDeJornada([
    partido('TIMED','2026-12-10T18:00:00Z'),
    partido('scheduled','2026-12-11T18:00:00Z'),
    partido('IN_PLAY','2026-12-10T19:00:00Z'),
  ]),'2026-12-10T18:00:00.000Z');
});
test('calendario: cuenta atrás rechaza fechas imposibles',()=>{
  assert.throws(()=>cuentaAtras('no-es-fecha','2026-12-10T18:00:00Z'),/Fechas inválidas/);
  assert.throws(()=>cuentaAtras('2026-12-10T17:00:00Z','no-es-fecha'),/Fechas inválidas/);
});

test('mercado: empate de importe y momento se resuelve por secuencia del servidor',()=>{
  const base={loteId:'lote-1',importeCentimos:700n,registradaEn:'2026-12-04T00:20:00.000Z',estado:'active'};
  const pujas=[{...base, id:'uuid-A',teamId:'equipo-A',secuenciaRegistro:22n},
               {...base, id:'uuid-Z',teamId:'equipo-Z',secuenciaRegistro:21n}];
  assert.equal(calcularGanadores(pujas)[0].ganador.teamId,'equipo-Z');
});
test('mercado: no se adjudica arbitrariamente un empate temporal sin secuencia',()=>{
  const base={loteId:'lote-1',importeCentimos:700n,registradaEn:'2026-12-04T00:20:00.000Z',estado:'active'};
  assert.throws(()=>calcularGanadores([{...base,id:'x'},{...base,id:'y'}]),/PRIORIDAD_NO_DETERMINABLE/);
});
test('mercado: fecha de puja inválida se detecta aunque haya una sola oferta',()=>{
  assert.throws(()=>ordenarPujasDeLote([{
    loteId:'lote-1',importeCentimos:700n,registradaEn:'fecha-no-valida'
  }]),/Fecha de puja inválida/);
});

const estadoVacio=()=>({equipos:new Map(),propietarios:new Map(),publicaciones:new Set(),movimientos:[]});
const planVacio=(publicaEn)=>({cicloId:'ciclo-1',publicaEn,pujasAdmitidas:[],lotes:[]});

test('publicación: fecha actual inválida no salta la protección de las 06:00',()=>{
  assert.throws(()=>publicarCicloSimulado(estadoVacio(),planVacio('2026-12-04T05:00:00Z'),'fecha-rota'),/Fechas de publicación inválidas/);
});
test('publicación: hora de publicación inválida tampoco puede pasar',()=>{
  assert.throws(()=>publicarCicloSimulado(estadoVacio(),planVacio('fecha-rota'),'2026-12-04T06:00:00Z'),/Fechas de publicación inválidas/);
});
test('importación: clave vacía rechazada y no altera la fotografía anterior',()=>{
  const anterior=new Map([['jugador1:partido1',{revision:1,puntos:2}]]);
  assert.throws(()=>aplicarPuntuaciones(anterior,[{claveJugadorPartido:'   ',revision:1,puntos:5}]),/Puntuación deportiva inválida/);
  assert.deepEqual(anterior.get('jugador1:partido1'),{revision:1,puntos:2});
});

test('SQL: las pujas tienen secuencia de recepción asignada por servidor',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/202611250004_integridad_pendiente.sql',import.meta.url),'utf8');
  assert.match(sql,/submission_order\s+bigint\s+generated always as identity/i);
  assert.match(sql,/bids_winner_lookup_idx/);
  assert.match(sql,/where status='active'/);
});
test('SQL: transferencias consistentes y eventos con NULL no duplicables',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/202611250004_integridad_pendiente.sql',import.meta.url),'utf8');
  assert.match(sql,/transfer_seller_kind_consistent/);
  assert.match(sql,/transfer_buyer_kind_consistent/);
  assert.match(sql,/transfer_cannot_sell_to_self/);
  assert.match(sql,/unique nulls not distinct/i);
});
