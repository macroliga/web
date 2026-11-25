import test from 'node:test';
import assert from 'node:assert/strict';
import {ejecutarPasoMercado,relojMadrid} from '../src/server/mercado-ejecutor.mjs';

const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const C='33333333-3333-4333-8333-333333333333';
const NUEVO='44444444-4444-4444-8444-444444444444';
const PREVIO={
  id:C,status:'open',opens_at:'2026-11-24T05:00:00Z',
  closes_at:'2026-11-25T00:00:00Z',
  publishes_at:'2026-11-25T05:00:00Z'
};
const HOY={
  id:NUEVO,status:'draft',opens_at:'2026-11-25T05:00:00Z',
  closes_at:'2026-11-26T00:00:00Z',
  publishes_at:'2026-11-26T05:00:00Z'
};
function simulador({ahora='2026-11-25T05:05:00Z',ciclos=[],porDivision,temporada='active',zona='Europe/Madrid',errorEn,preparacion}={}) {
  const llamadas=[];
  const mapa=new Map(Object.entries(porDivision||{[A]:ciclos.map(c=>({...c}))}));
  const db={
    llamadas,
    async horaServidor(){return ahora;},
    async division(id){return {id,timezone:zona,season_status:temporada};},
    async ciclos(id){return mapa.get(id)||[];},
    async cerrar(id){
      llamadas.push('cerrar:'+id);
      if(errorEn==='cerrar')throw new Error('Fallo de cierre simulado');
      for(const l of mapa.values())for(const c of l)if(c.id===id)c.status='calculated';
    },
    async publicar(id){
      llamadas.push('publicar:'+id);
      if(errorEn==='publicar')throw new Error('Fallo de publicación simulado');
      for(const l of mapa.values())for(const c of l)if(c.id===id)c.status='published';
    },
    async preparar(id,dia){
      llamadas.push('preparar:'+id+':'+dia);
      if(errorEn==='preparar')throw new Error('Fallo de preparación simulado');
      const r=preparacion||{ciclo_id:NUEVO,arrastrados:2,nuevos:13};
      if(r.ciclo_id===NUEVO){
        const anteriores=mapa.get(id)||[];
        anteriores.push({...HOY});
        mapa.set(id,anteriores);
      }
      return r;
    },
    async abrir(id){
      llamadas.push('abrir:'+id);
      if(errorEn==='abrir')throw new Error('Fallo de apertura simulado');
      for(const l of mapa.values())for(const c of l)if(c.id===id)c.status='open';
    }
  };
  return db;
}
function acciones(informe){return informe.resultado[0].pasos.map(x=>x.accion);}

test('no hay operaciones si se consulta antes de la hora del cierre',async()=>{
  const store=simulador({ahora:'2026-11-24T23:59:00Z',ciclos:[PREVIO]});
  const r=await ejecutarPasoMercado({store,divisiones:[A]});
  assert.deepEqual(acciones(r),[]);assert.deepEqual(store.llamadas,[]);
});
test('01:05 España: solo cerrar, no publicar ni abrir otro mercado',async()=>{
  const store=simulador({ahora:'2026-11-25T00:05:00Z',ciclos:[PREVIO]});
  const r=await ejecutarPasoMercado({store,divisiones:[A],soloLectura:false});
  assert.deepEqual(acciones(r),['cerrar']);
  assert.deepEqual(store.llamadas,['cerrar:'+C]);
});
test('06:05 España: cerrar pendiente, publicar, preparar hoy y abrir',async()=>{
  const store=simulador({ciclos:[PREVIO]});
  const r=await ejecutarPasoMercado({store,divisiones:[A],soloLectura:false});
  assert.equal(r.errores,0);
  assert.deepEqual(acciones(r),['cerrar','publicar','preparar','abrir']);
  assert.deepEqual(store.llamadas,[
    'cerrar:'+C,'publicar:'+C,'preparar:'+A+':2026-11-25','abrir:'+NUEVO
  ]);
  const r2=await ejecutarPasoMercado({store,divisiones:[A],soloLectura:false});
  assert.equal(r2.errores,0);
  assert.deepEqual(acciones(r2),[]);
  assert.equal(store.llamadas.length,4);
});
test('modo predeterminado solo lectura: informa pero no modifica nada',async()=>{
  const store=simulador({ciclos:[PREVIO]});
  const r=await ejecutarPasoMercado({store,divisiones:[A]});
  assert.equal(r.soloLectura,true);
  assert.deepEqual(acciones(r),['cerrar','publicar','preparar','abrir']);
  assert.deepEqual(store.llamadas,[]);
});
test('06:05 primer mercado, sin ciclos previos: preparar y abrir',async()=>{
  const store=simulador();
  const r=await ejecutarPasoMercado({store,divisiones:[A],soloLectura:false});
  assert.deepEqual(acciones(r),['preparar','abrir']);
  assert.equal(r.errores,0);
});
test('una preparación existente en draft se abre sin crear otra',async()=>{
  const store=simulador({ciclos:[HOY]});
  const r=await ejecutarPasoMercado({store,divisiones:[A],soloLectura:false});
  assert.deepEqual(acciones(r),['abrir']);
  assert.deepEqual(store.llamadas,['abrir:'+NUEVO]);
});
test('no abrir mercado de temporada draft ni zona horaria equivocada',async()=>{
  for(const cambios of [{temporada:'draft'},{temporada:'finished'},{zona:'UTC'}]){
    const store=simulador(cambios);
    const r=await ejecutarPasoMercado({store,divisiones:[A],soloLectura:false});
    assert.equal(r.errores,1);assert.deepEqual(store.llamadas,[]);
  }
});
test('un día perdido no se salta de forma silenciosa',async()=>{
  const store=simulador({ciclos:[{...PREVIO,status:'published',
    opens_at:'2026-11-22T05:00:00Z',closes_at:'2026-11-23T00:00:00Z',
    publishes_at:'2026-11-23T05:00:00Z'}]});
  const r=await ejecutarPasoMercado({store,divisiones:[A],soloLectura:false});
  assert.equal(r.errores,1);assert.match(r.resultado[0].error,/días saltados/);
  assert.deepEqual(store.llamadas,[]);
});
test('no operar ciclos draft caducados, fallidos ni ventanas inválidas',async()=>{
  for(const ciclo of [
    {...PREVIO,status:'draft'},
    {...PREVIO,status:'failed'},
    {...PREVIO,closes_at:'2026-11-23T00:00:00Z'}
  ]){
    const store=simulador({ciclos:[ciclo]});
    const r=await ejecutarPasoMercado({store,divisiones:[A],soloLectura:false});
    assert.equal(r.errores,1);assert.deepEqual(store.llamadas,[]);
  }
});
test('un fallo del cierre no publica ni prepara la división afectada',async()=>{
  const store=simulador({ciclos:[PREVIO],errorEn:'cerrar'});
  const r=await ejecutarPasoMercado({store,divisiones:[A],soloLectura:false});
  assert.equal(r.errores,1);assert.deepEqual(store.llamadas,['cerrar:'+C]);
});
test('un fallo de apertura permite reintentar el draft sin nueva preparación',async()=>{
  const store=simulador({errorEn:'abrir'});
  const r=await ejecutarPasoMercado({store,divisiones:[A],soloLectura:false});
  assert.equal(r.errores,1);
  assert.deepEqual(store.llamadas,['preparar:'+A+':2026-11-25','abrir:'+NUEVO]);
});
test('respuesta de preparación con más de quince no abre el mercado',async()=>{
  const store=simulador({preparacion:{ciclo_id:NUEVO,arrastrados:15,nuevos:1}});
  const r=await ejecutarPasoMercado({store,divisiones:[A],soloLectura:false});
  assert.equal(r.errores,1);assert.deepEqual(acciones(r),['preparar']);
});
test('una división fallida no bloquea otra división autorizada',async()=>{
  const bad={...PREVIO,status:'failed'};
  const store=simulador({porDivision:{[A]:[bad],[B]:[]}});
  const r=await ejecutarPasoMercado({store,divisiones:[A,B],soloLectura:false});
  assert.equal(r.errores,1);
  assert.equal(r.resultado[0].correcto,false);
  assert.equal(r.resultado[1].correcto,true);
  assert.ok(store.llamadas.includes('preparar:'+B+':2026-11-25'));
});
test('evitar UUID inválidos, repetidos o lista de divisiones vacía',async()=>{
  const store=simulador();
  await assert.rejects(()=>ejecutarPasoMercado({store,divisiones:[]}),/lista explícita/);
  await assert.rejects(()=>ejecutarPasoMercado({store,divisiones:['comuniolaviana']}),/lista explícita/);
  await assert.rejects(()=>ejecutarPasoMercado({store,divisiones:[A,A]}),/lista explícita/);
});
test('cambio horario verano e invierno España; apertura local a las 06:00',()=>{
  assert.deepEqual(relojMadrid('2027-03-28T04:00:00Z'),
    {dia:'2027-03-28',minutos:360});
  assert.deepEqual(relojMadrid('2027-10-31T05:00:00Z'),
    {dia:'2027-10-31',minutos:360});
  assert.deepEqual(relojMadrid('2027-03-28T00:00:00Z'),
    {dia:'2027-03-28',minutos:60});
});
test('ciclo calculado espera las 06:00 para publicarse',async()=>{
  const store=simulador({ahora:'2026-11-25T04:59:00Z',
    ciclos:[{...PREVIO,status:'calculated'}]});
  const r=await ejecutarPasoMercado({store,divisiones:[A],soloLectura:false});
  assert.deepEqual(acciones(r),[]);
});
