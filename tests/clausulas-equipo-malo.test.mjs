import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {leerCatalogoCsv} from '../src/domain/clausulas.mjs';
import {referenciaClausula,cotizacionValida,controlClausula} from '../app/clausulas-equipo-malo.mjs';
test('cada referencia coincide con los CSV oficiales, incluidos los saltos',()=>{
 for(const [file,original] of [['tabla_original_383_filas.csv',true],['extension_101_200_millones.csv',false]]){
  for(const row of leerCatalogoCsv(readFileSync(new URL('../datos/clausulas/'+file,import.meta.url),'utf8'),{original})){
   assert.equal(referenciaClausula(row.valorEur*100n),(row.clausulaEur*100n).toString());
  }
 }
});
test('aplica el tramo inferior y respeta exactamente el cambio de umbral',()=>{
 for(const [v,price] of [['16000000','62400000'],['18000000','70200000'],['26000000','101400000'],['34900000','136110000'],['35000000','129500000'],['38000000','140600000'],['45000000','162000000']])
  assert.equal(referenciaClausula(v),price);
});
test('no inventa precios bajo el primer tramo, en la ampliación sin regla ni con fracciones de céntimo',()=>{
 for(const v of [15999999,20000000001,16000001,10200000000,0,-1,null,9007199254740992])assert.equal(referenciaClausula(v),null);
});
test('solo cotizaciones válidas del servidor permiten confirmar',()=>{
 for(const q of [null,{}, {disponible:false,importe_centimos:'62400000'}, {disponible:true,importe_centimos:62400000},{disponible:true,importe_centimos:'0'}, {disponible:true,importe_centimos:'1.5'}])assert.equal(cotizacionValida(q),false);
 assert.equal(cotizacionValida({disponible:true,importe_centimos:'62400000'}),true);
});
class Node{
 constructor(tag){this.tag=tag;this.children=[];this.events={};this.disabled=false;this.hidden=false;}
 appendChild(n){this.children.push(n);}
 setAttribute(){}
 addEventListener(n,fn){this.events[n]=fn;}
 async click(){if(!this.disabled)await this.events.click?.();}
}
const doc={createElement:tag=>new Node(tag)};
const row={propietario_tipo:'bad_team',activo:true,valor_mercado_centimos:16000000,nombre_jugador:'Prueba'};
test('solo Equipo Malo activo y sin cargo antes de confirmar',async()=>{
 let paid=0;const opts={euros:String,cotizar:async()=>({disponible:false,motivo:'Cerrado'}),pagar:async()=>paid++};
 assert.equal(controlClausula(doc,{...row,propietario_tipo:'computer'},opts),null);
 assert.equal(controlClausula(doc,{...row,activo:false},opts),null);
 const c=controlClausula(doc,row,opts),[,open,d]=c.children,[status,confirm]=d.children;
 assert.equal(open.textContent,'Pagar cláusula');assert.equal(confirm.disabled,true);
 await open.click();await confirm.click();assert.equal(status.textContent,'Cerrado');assert.equal(paid,0);
});
test('importe de servidor se confirma una sola vez y no se usa referencia local como autorización',async()=>{
 const paid=[];const c=controlClausula(doc,row,{euros:String,cotizar:async()=>({disponible:true,importe_centimos:'70000000'}),pagar:async(...args)=>paid.push(args)});
 const [,open,d]=c.children,[status,confirm]=d.children;
 await open.click();assert.equal(paid.length,0);assert.equal(confirm.disabled,false);assert.match(status.textContent,/70000000/);
 await confirm.click();await confirm.click();assert.equal(paid.length,1);assert.equal(paid[0][0],'70000000');assert.match(paid[0][1],/^[a-f0-9-]{36}$/);
});
test('error de cotización no habilita el pago',async()=>{
 const c=controlClausula(doc,row,{euros:String,cotizar:async()=>{throw Error('offline')},pagar:async()=>assert.fail('No pagar')});
 const [,open,d]=c.children;await open.click();assert.equal(d.children[1].disabled,true);
});

test('la propuesta SQL utiliza los mismos multiplicadores y límites que la interfaz',()=>{
 const raw=readFileSync(new URL('../docs/propuestas/20261127_clausulas_equipo_malo_tramos.sql',import.meta.url),'utf8');
 const sqlRows=[...raw.matchAll(/^ \((\d+),(\d+),(\d+(?:\.\d+)?)\)[,;]$/gm)].map(m=>({from:BigInt(m[1]),to:BigInt(m[2]),factor:m[3]}));
 const original=leerCatalogoCsv(readFileSync(new URL('../datos/clausulas/tabla_original_383_filas.csv',import.meta.url),'utf8'),{original:true});
 const unique=[...new Map(original.map(x=>[x.valorEur.toString(),x])).values()];
 assert.equal(sqlRows.length,unique.length+6);
 for(let i=0;i<unique.length;i++){
  const expected=unique[i],r=sqlRows[i],next=unique[i+1];
  assert.equal(r.from,expected.valorEur*100n);
  assert.equal(r.to,next?next.valorEur*100n-1n:r.from);
  assert.equal(r.factor,expected.multiplicador);
  const mid=(r.from+r.to)/2n,[int,frac='']=r.factor.split('.'),num=mid*BigInt(int+frac),den=10n**BigInt(frac.length);
  assert.equal(referenciaClausula(mid),num%den===0n?(num/den).toString():null);
 }
 for(let i=1;i<sqlRows.length;i++)assert.ok(sqlRows[i].from>sqlRows[i-1].to);
});
