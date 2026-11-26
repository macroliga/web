import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogoFicticio} from '../src/demo/catalogo-ficticio.mjs';
import {normalizarCatalogo} from '../src/domain/catalogo-deportivo.mjs';
import {prepararLoteComuniazo} from '../src/domain/lote-comuniazo.mjs';
const raw=catalogoFicticio();
const catalogo=normalizarCatalogo({...raw,kind:'authorized',provider:'comuniazo',permissionRef:'Solo prueba local'});
const report={asOf:catalogo.asOf,snapshotHash:catalogo.snapshotHash,active:500,clubs:20,points:catalogo.players.map(({externalId})=>({externalId,points:0}))};
test('une informe y catálogo de una misma descarga, conserva los puntos como datos acumulados',()=>{
 const lote=prepararLoteComuniazo(catalogo,report);assert.equal(lote.puntos.length,500);assert.equal(lote.catalogo.snapshotHash,catalogo.snapshotHash);
});
test('rechaza puntos incompletos, duplicados, erróneos o de otra descarga',()=>{
 assert.throws(()=>prepararLoteComuniazo(catalogo,{...report,snapshotHash:'0'.repeat(64)}),/otra descarga/);
 assert.throws(()=>prepararLoteComuniazo(catalogo,{...report,points:report.points.slice(1)}),/incompletos/);
 const duplicate=structuredClone(report);duplicate.points[1]=duplicate.points[0];
 assert.throws(()=>prepararLoteComuniazo(catalogo,duplicate),/duplicados/);
 assert.throws(()=>prepararLoteComuniazo(catalogo,{...report,points:[{...report.points[0],points:1.5},...report.points.slice(1)]}),/inválidos/);
});
