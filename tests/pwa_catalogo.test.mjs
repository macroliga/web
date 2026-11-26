import test from 'node:test';
import assert from 'node:assert/strict';
import {crearPanelCatalogo,filtrarCatalogo} from '../app/catalogo.mjs';
import {crearCliente} from '../app/api.mjs';
const rows=[
 {nombre_jugador:'Álvaro ficticio',club:'Club ficticio',propietario_equipo:'Computer',propietario_tipo:'computer',activo:true,posicion:'GK',valor_mercado_centimos:10000},
 {nombre_jugador:'Baja ficticia',club:'Club ficticio',propietario_equipo:'Equipo A',propietario_tipo:'team',activo:false,posicion:'DEF',valor_mercado_centimos:10000}
];
test('búsqueda sin tildes, filtro de propietario y bajas visibles del manager',()=>{
 assert.deepEqual(filtrarCatalogo(rows,'alvaro'),[rows[0]]);
 assert.deepEqual(filtrarCatalogo(rows,'','team'),[rows[1]]);
 assert.deepEqual(filtrarCatalogo(rows,'','bad_team'),[]);
});
class Element {constructor(){this.children=[];this.hidden=true;this.value='';this.textContent='';}
 addEventListener(){} replaceChildren(){this.children=[];} appendChild(x){this.children.push(x);}}
test('catálogo no conserva resultados al salir o cambiar identidad, incluso petición pendiente',async()=>{
 const e=Object.fromEntries(['search','owner','list','status'].map(k=>['#catalog-'+k,new Element()]));
 const root=new Element();root.ownerDocument={createElement:()=>new Element()};root.querySelector=k=>e[k];
 let release;
 const ctx={token:'ficticio',division:'d1',identity:'t1',client:{consultar:async(n,p,t)=>{assert.equal(n,'macroliga_catalogo_division');assert.deepEqual(p,{p_division_id:'d1'});assert.equal(t,'ficticio');return new Promise(r=>release=r);}}};
 const panel=crearPanelCatalogo(root,()=>ctx);
 let pending=panel.show();panel.clear();release(rows);await pending;
 assert.equal(root.hidden,true);assert.equal(e['#catalog-list'].children.length,0);
 pending=panel.show();release(rows);await pending;
 assert.equal(e['#catalog-list'].children.length,2);assert.match(e['#catalog-list'].children[1].children[1].textContent,/Baja de LaLiga/);
 pending=panel.show();ctx.identity='t2';release(rows);await pending;assert.equal(e['#catalog-list'].children.length,0);
});
test('consulta catálogo exclusivamente por RPC con JWT de usuario',async()=>{
 const c=crearCliente({supabaseUrl:'https://xuwjbfnhvvbdargcohfe.supabase.co',anonKey:'sb_publishable_ficticia',fetchImpl:async(url,o)=>{
  assert.match(url,/rpc\/macroliga_catalogo_division$/);assert.equal(o.headers.Authorization,'Bearer ficticio');return {ok:true,json:async()=>rows};
 }});
 await assert.rejects(c.consultar('macroliga_catalogo_division',{},null),/iniciar sesion/);
 assert.deepEqual(await c.consultar('macroliga_catalogo_division',{p_division_id:'d1'},'ficticio'),rows);
});
