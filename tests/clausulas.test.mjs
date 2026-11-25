import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {leerCatalogoCsv,auditarCatalogoOriginal,consultarPrecioExacto}
 from '../src/domain/clausulas.mjs';

const original=leerCatalogoCsv(readFileSync(new URL('../datos/clausulas/tabla_original_383_filas.csv',import.meta.url),'utf8'),{original:true});
const extension=leerCatalogoCsv(readFileSync(new URL('../datos/clausulas/extension_101_200_millones.csv',import.meta.url),'utf8'));

test('fuente original sin correcciones silenciosas: 383 filas, 382 umbrales',()=>{
  const audit=auditarCatalogoOriginal(original);
  assert.equal(audit.filas,383);
  assert.equal(new Set(original.map(x=>x.valorEur.toString())).size,382);
  assert.equal(audit.duplicados.length,1);
  assert.equal(audit.duplicados[0].valorEur,19100000n);
  assert.equal(audit.duplicados[0].identica,true);
});
test('cláusulas originales: registros exactos, sin redondeos arbitrarios',()=>{
  assert.equal(consultarPrecioExacto(original,160000n).clausulaCentimos,62400000n);
  assert.equal(consultarPrecioExacto(original,9000000n).clausulaCentimos,1190002500n);
  assert.equal(consultarPrecioExacto(original,5900000n).clausulaCentimos,826000000n);
  assert.equal(consultarPrecioExacto(original,6000000n).clausulaCentimos,861000000n);
  assert.equal(consultarPrecioExacto(original,19100000n).registrosOriginales,2);
  assert.equal(consultarPrecioExacto(original,101000000n).clausulaCentimos,11110000000n);
});
test('ampliación aprobada hasta 200 millones: solo valores ancla',()=>{
  assert.equal(extension.length,7);
  for(let i=1;i<extension.length;i++){
    assert.ok(Number(extension[i].multiplicador)<Number(extension[i-1].multiplicador));
    assert.ok(extension[i].primaEur>extension[i-1].primaEur);
  }
  assert.equal(consultarPrecioExacto(extension,175000000n).clausulaCentimos,19118750000n);
  assert.equal(consultarPrecioExacto(extension,200000000n).clausulaCentimos,21800000000n);
});
test('valores intermedios y superiores a 200 millones NO reciben un precio inventado',()=>{
  assert.throws(()=>consultarPrecioExacto(original,5900001n),/UMBRAL_NO_DEFINIDO/);
  assert.throws(()=>consultarPrecioExacto(extension,199000000n),/UMBRAL_NO_DEFINIDO/);
  assert.throws(()=>consultarPrecioExacto(extension,201000000n),/UMBRAL_NO_DEFINIDO/);
});
