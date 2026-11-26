import test from 'node:test';
import assert from 'node:assert/strict';
import {crearPanelClasificacion} from '../app/clasificacion.mjs';
import {crearCliente} from '../app/api.mjs';
class El{constructor(){this.children=[];this.textContent='';this.hidden=true;this.classList={add:c=>this.css=c};}appendChild(x){this.children.push(x);}replaceChildren(){this.children=[];}}
test('clasificación: 16 managers, cero valor y puntos, marca solo el equipo propio y limpia al salir',async()=>{
 const root=new El(),status=new El(),body=new El();
 root.querySelector=id=>id==='#standings-status'?status:body;root.ownerDocument={createElement:()=>new El()};
 const data=Array.from({length:16},(_,i)=>({posicion:1,equipo_id:'e'+i,nombre_manager:'Manager '+i,nombre_equipo:'Equipo '+i,valor_equipo_centimos:'0',puntos:0,es_mi_equipo:i===3}));
 let release;
 const c={division:'d',identity:'e3',token:'fake',client:{consultar:async(n,p,t)=>{assert.equal(n,'macroliga_clasificacion');assert.deepEqual(p,{p_division_id:'d'});assert.equal(t,'fake');return new Promise(r=>release=r);}}};
 const panel=crearPanelClasificacion(root,()=>c);
 let pending=panel.show();release(data);await pending;
 assert.equal(body.children.length,16);assert.equal(body.children.filter(r=>r.css==='my-standing').length,1);
 assert.match(status.textContent,/16 managers/);assert.equal(body.children[0].children[3].textContent,'0');
 panel.clear();assert.equal(body.children.length,0);
 pending=panel.show();c.identity='e4';release(data);await pending;assert.equal(body.children.length,0);
});
test('clasificación exige JWT personal y operación admitida',async()=>{
 const c=crearCliente({supabaseUrl:'https://xuwjbfnhvvbdargcohfe.supabase.co',anonKey:'sb_publishable_ficticia',fetchImpl:async(url,o)=>{
  assert.match(url,/rpc\/macroliga_clasificacion$/);assert.equal(o.headers.Authorization,'Bearer fake');return {ok:true,json:async()=>[]};
 }});
 await assert.rejects(c.consultar('macroliga_clasificacion',{},null),/iniciar sesion/);
 assert.deepEqual(await c.consultar('macroliga_clasificacion',{p_division_id:'d'},'fake'),[]);
});
