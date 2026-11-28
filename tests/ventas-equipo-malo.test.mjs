import test from 'node:test';import assert from 'node:assert/strict';
import {conectarVentaEquipoMalo} from '../app/ventas-equipo-malo.mjs';
class Boton{disabled=false;isConnected=true;addEventListener(_,fn){this.click=fn}}
const player={jugador_id:'player',nombre_jugador:'Ensayo'};
const oid='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const fixture=(opts={})=>{
  const btn=new Boton(),calls=[],msgs=[];let updated=0;const c={division:'d',identity:'t',session:1,token:'a'};
  const client={consultar:async(n,args,token)=>{calls.push(['quote',n,args,token]);return opts.quote??{disponible:true,importe_centimos:'50000000'};},operar:async(n,args,token)=>{calls.push(['sell',n,args,token]);return oid;}};
  c.client=client;
  conectarVentaEquipoMalo(btn,player,{contexto:()=>c,euros:String,confirmar:opts.confirmar??(()=>true),mensaje:x=>msgs.push(x),actualizar:async()=>updated++,generarClave:()=>oid});
  return {btn,c,calls,msgs,updated:()=>updated};
}
test('venta propia consulta y confirma precio del servidor, refrescando plantilla',async()=>{
 const f=fixture();await f.btn.click();assert.deepEqual(f.calls.map(x=>x[0]),['quote','sell']);
 assert.equal(f.calls[1][2].p_importe_centimos,'50000000');assert.equal(f.calls[1][2].p_clave,oid);assert.equal(f.updated(),1);assert.match(f.msgs.at(-1),/Venta confirmada/);
});
test('no se vende sin confirmación explícita',async()=>{const f=fixture({confirmar:()=>false});await f.btn.click();assert.equal(f.calls.length,1);assert.equal(f.updated(),0);});
test('si el servidor indica cerrado no hay escritura',async()=>{const f=fixture({quote:{disponible:false,motivo:'Equipo Malo cerrado hasta las 12:00'}});await f.btn.click();assert.equal(f.calls.length,1);assert.match(f.msgs.at(-1),/12:00/);});
test('no se permite cotización con importe inválido',async()=>{const f=fixture({quote:{disponible:true,importe_centimos:'1.5'}});await f.btn.click();assert.equal(f.calls.length,1);});
test('si cambia la identidad antes de confirmar no hay escritura',async()=>{let f;f=fixture({confirmar:()=>{f.c.identity='otro';return true;}});await f.btn.click();assert.equal(f.calls.length,1);});
test('bloqueo de doble clic durante solicitud',async()=>{const f=fixture();await Promise.all([f.btn.click(),f.btn.click()]);assert.equal(f.calls.filter(x=>x[0]==='sell').length,1);});
import {crearPanelCatalogo} from '../app/catalogo.mjs';
class Nodo{
  constructor(tag='div'){this.tag=tag;this.children=[];this.events={};this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.className='';this.isConnected=true;this.classList={toggle(){}};}
  appendChild(n){n.parent=this;this.children.push(n);if(this.tag==='select'&&!this.value&&n.tag==='option')this.value=n.value;return n}
  replaceChildren(...nodes){this.children=[];if(this.tag==='select')this.value='';for(const n of nodes)this.appendChild(n)}
  setAttribute(){}
  addEventListener(name,fn){this.events[name]=fn}
  querySelector(s){return s==='option[value="clause-desc"]'?this.children.find(c=>c.value==='clause-desc')||null:null}
  click(){if(!this.disabled)return this.events.click?.()}
}
test('Poner en venta desde Mi equipo preselecciona el jugador y envía su precio mínimo',async()=>{
 const nodes=new Map(),doc={createElement:t=>new Nodo(t)},root=new Nodo();
 root.ownerDocument=doc;root.querySelector=s=>{if(!nodes.has(s))nodes.set(s,new Nodo());return nodes.get(s)};
 const n=id=>root.querySelector('#'+id),actions=[];
 const operations={pujas_abiertas:true,ventas_abiertas:true,lotes:[],plantilla:[{id:'p1',nombre:'Uno',minimo:'50000000'},{id:'p2',nombre:'Dos',minimo:'60000000'}],anuncios:[],ofertas:[]};
 const client={consultar:async(name)=>name==='macroliga_operaciones_mercado'?operations:[],operar:async(name,args)=>{actions.push([name,args]);return oid;}};
 const panel=crearPanelCatalogo(root,()=>({client,division:'d',identity:'t',token:'a'}));
 await panel.show('sales','p2');await new Promise(r=>setImmediate(r));
 const [label,price]=n('market-sales-controls').children;
 assert.equal(label.children[0].value,'p2');
 assert.equal(price.children[0].children[0].children[0].value,'600000');
 price.children[0].children[1].click();await new Promise(r=>setImmediate(r));
 assert.deepEqual(actions,[['macroliga_operar_venta',{p_division_id:'d',p_accion:'listar',p_objeto:'p2',p_importe_centimos:'60000000'}]]);
 panel.clear();
});
