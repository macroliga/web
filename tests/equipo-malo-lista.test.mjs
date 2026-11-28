import test from 'node:test';
import assert from 'node:assert/strict';
import {detalleReferenciaClausula,controlClausula} from '../app/clausulas-equipo-malo.mjs';
import {filtrarCatalogo,crearPanelCatalogo} from '../app/catalogo.mjs';

class Node {
  constructor(tag='div'){this.tag=tag;this.children=[];this.events={};this.attributes={};this.disabled=false;this.hidden=false;this.value='';this.textContent='';this.className='';this.isConnected=true;this.classList={toggle:(name,on)=>{const classes=new Set(this.className.split(/\s+/).filter(Boolean));on?classes.add(name):classes.delete(name);this.className=[...classes].join(' ')}};}
  appendChild(n){n.parent=this;this.children.push(n);return n;}
  remove(){this.parent.children=this.parent.children.filter(c=>c!==this);this.isConnected=false;}
  replaceChildren(...nodes){for(const n of this.children)n.isConnected=false;this.children=[];for(const n of nodes)this.appendChild(n);}
  setAttribute(name,value){this.attributes[name]=value;}
  addEventListener(name,fn){this.events[name]=fn;}
  querySelector(selector){if(selector==='option[value="clause-desc"]')return this.children.find(c=>c.value==='clause-desc')||null;return null;}
  async click(){if(!this.disabled)await this.events.click?.();}
}
const doc={createElement:tag=>new Node(tag)};
const base={posicion:'MID',club:'Club ficticio',puntos_acumulados:0,activo:true,propietario_tipo:'bad_team',propietario_equipo:'Equipo Malo'};
const row=(id,price,extra={})=>({...base,jugador_id:id,nombre_jugador:'Jugador '+id,valor_mercado_centimos:price,...extra});
test('la referencia y el multiplicador proceden de los mismos tramos, sin inventar precios',()=>{
 assert.deepEqual(detalleReferenciaClausula('16000000'),{factor:'3.9',importe:'62400000'});
 assert.deepEqual(detalleReferenciaClausula('35000000'),{factor:'3.7',importe:'129500000'});
 assert.equal(detalleReferenciaClausula('7500000'),null);
});
test('ordena por cláusula real de referencia, no por valor de mercado, con desconocidos al final',()=>{
 const rows=[row('a','34900000'),row('b','35000000'),row('c','7500000'),row('d','50000000',{propietario_tipo:'computer'})];
 assert.deepEqual(filtrarCatalogo(rows,{owner:'bad_team',sort:'clause-desc'}).map(r=>r.jugador_id),['a','b','c']);
});
test('la compra compacta abre cotización sin cargo; solo confirma importe devuelto por servidor',async()=>{
 const pagos=[];
 const c=controlClausula(doc,row('a','16000000'),{compacto:true,euros:String,cotizar:async()=>({disponible:true,importe_centimos:'70000000'}),pagar:async(...args)=>pagos.push(args)});
 const [precio,comprar,detalle]=c.children;
 assert.equal(precio.children[1].textContent,'62400000');assert.equal(comprar.textContent,'Comprar');assert.equal(comprar.attributes['aria-label'],'Comprar a Jugador a');
 assert.equal(detalle.hidden,true);await comprar.click();assert.equal(pagos.length,0);assert.match(detalle.children[0].textContent,/70000000/);
 await detalle.children[1].click();await detalle.children[1].click();assert.equal(pagos.length,1);assert.equal(pagos[0][0],'70000000');
});
test('si el servidor cierra el pago o falta regla local, no se permite una confirmación no cotizada',async()=>{
 const c=controlClausula(doc,row('a','7500000'),{compacto:true,euros:String,cotizar:async()=>({disponible:false,motivo:'Cerrado'}),pagar:async()=>assert.fail('No pagar')});
 assert.equal(c.children[0].children[1].textContent,'Por consultar');await c.children[1].click();assert.equal(c.children[2].children[0].textContent,'Cerrado');assert.equal(c.children[2].children[1].disabled,true);
});
test('solo el filtro Equipo Malo activa las filas compactas y cuenta sus jugadores, no todo el catálogo',async()=>{
 const nodes=new Map();
 const root=new Node();root.ownerDocument=doc;root.querySelector=s=>{if(!nodes.has(s))nodes.set(s,new Node());return nodes.get(s)};
 const n=id=>root.querySelector('#'+id);
 const rows=[row('a','16000000'),row('b','38000000'),row('c','50000000',{activo:false}),row('d','40000000',{propietario_tipo:'computer'})];
 const client={consultar:async name=>name==='macroliga_catalogo_division'?rows:name==='macroliga_mercado_visible'?[]:{lotes:[],plantilla:[],anuncios:[],ofertas:[]},operar:async()=>assert.fail('No operar')};
 const panel=crearPanelCatalogo(root,()=>({client,token:'fixture',division:'fixture',identity:'fixture'}));
 await panel.show('bad');
 assert.equal(n('catalog-sort').value,'clause-desc');assert.match(n('catalog-status').textContent,/3 de 3 jugadores/);assert.ok(n('catalog-list').className.includes('bad-team-list'));
 assert.equal(n('catalog-list').children.length,3);assert.ok(n('catalog-list').children.every(x=>x.className==='bad-team-row'));
 assert.equal(n('catalog-list').children[0].children[1].textContent,'No disponible');
 assert.equal(n('catalog-list').children[1].children[0].children[1].textContent,'Club ficticio · MED · × 3,7');
 await n('catalog-reset').click();
 assert.equal(n('catalog-list').className,'');assert.equal(n('catalog-sort').querySelector('option[value="clause-desc"]'),null);assert.equal(n('catalog-list').children.length,4);
 assert.equal(n('catalog-list').children[0].children[3].children[1].textContent,'Pagar cláusula');
 await panel.show('market');
 assert.equal(n('catalog-list').className,'');assert.equal(n('catalog-sort').value,'name');assert.equal(n('market-current-view').hidden,false);
 panel.clear();assert.equal(n('catalog-list').children.length,0);assert.equal(root.hidden,true);
});
