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
test('no inventa precios para valores intermedios ni fuera de tabla',()=>{
 for(const v of [18000000,26000000,38000000,20000000001,16000001,0,-1,null])assert.equal(referenciaClausula(v),null);
 assert.equal(referenciaClausula('16000000'),'62400000');
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
