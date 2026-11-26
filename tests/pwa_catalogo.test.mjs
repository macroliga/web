import test from 'node:test';
import assert from 'node:assert/strict';
import {crearPanelCatalogo,filtrarCatalogo,cargarCatalogo} from '../app/catalogo.mjs';
import {crearCliente} from '../app/api.mjs';
const rows=[
 {jugador_id:'01',nombre_jugador:'Álvaro ficticio',club:'Club A',propietario_equipo:'Computer',propietario_tipo:'computer',activo:true,posicion:'GK',valor_mercado_centimos:'10000',puntos_acumulados:0},
 {jugador_id:'02',nombre_jugador:'Baja ficticia',club:'Club B',propietario_equipo:'Equipo A',propietario_manager:'González',propietario_equipo_id:'t1',propietario_tipo:'team',activo:false,posicion:'DEF',valor_mercado_centimos:'810050',puntos_acumulados:50},
 {jugador_id:'03',nombre_jugador:'Otro ficticio',club:'Club B',propietario_equipo:'Equipo Malo',propietario_tipo:'bad_team',activo:true,posicion:'FWD',valor_mercado_centimos:'850000',puntos_acumulados:null}
];
test('búsqueda sin tildes, filtros combinados de club, manager, posición, puntos y valor',()=>{
 assert.deepEqual(filtrarCatalogo(rows,{search:'alvaro'}),[rows[0]]);
 assert.deepEqual(filtrarCatalogo(rows,{search:'gonzalez',owner:'team:t1',club:'Club B',position:'DEF',minPoints:'50',maxPoints:'50',minValue:'8100,50',maxValue:'8100.50'}),[rows[1]]);
 assert.deepEqual(filtrarCatalogo(rows,{owner:'bad_team'}),[rows[2]]);
 assert.deepEqual(filtrarCatalogo(rows,{minPoints:'0',maxPoints:'0'}),[rows[0]]);
 assert.deepEqual(filtrarCatalogo(rows,{minPoints:'1',maxPoints:'49'}),[]);
 assert.throws(()=>filtrarCatalogo(rows,{minValue:'10',maxValue:'2'}),/mínimo/);
 assert.throws(()=>filtrarCatalogo(rows,{minPoints:'1.5'}),/enteros/);
});
test('orden de puntos y valor numérico; desconocidos quedan últimos',()=>{
 assert.deepEqual(filtrarCatalogo(rows,{sort:'points-desc'}),[rows[1],rows[0],rows[2]]);
 assert.deepEqual(filtrarCatalogo(rows,{sort:'points-asc'}),[rows[0],rows[1],rows[2]]);
 assert.deepEqual(filtrarCatalogo(rows,{sort:'value-desc'}),[rows[2],rows[1],rows[0]]);
});
test('paginación obtiene más de 1000 resultados completos y rechaza duplicados',async()=>{
 const many=Array.from({length:1201},(_,i)=>({...rows[0],jugador_id:String(i).padStart(5,'0')}));
 const calls=[];
 const result=await cargarCatalogo(async(n,p)=>{calls.push(p);const from=p.p_despues==null?0:many.findIndex(x=>x.jugador_id===p.p_despues)+1;return many.slice(from,from+p.p_limite);});
 assert.equal(result.length,1201);assert.equal(calls.length,5);
 await assert.rejects(cargarCatalogo(async()=>many.slice(0,250)),/Paginación/);
 let valid=true;
 assert.equal(await cargarCatalogo(async()=>{valid=false;return many.slice(0,250);},()=>valid),null);
});
class Element {
 constructor(){this.children=[];this.hidden=true;this.value='';this.textContent='';this.events=new Map();this.disabled=false;}
 addEventListener(name,fn){this.events.set(name,fn);} dispatch(name){return this.events.get(name)?.();} setAttribute(){} replaceChildren(...children){this.children=children;} appendChild(x){this.children.push(x);}
}
function dom(){
 const keys=['catalog-heading','catalog-description','catalog-search','catalog-owner','catalog-club','catalog-position','catalog-min-points','catalog-max-points','catalog-min-value','catalog-max-value','catalog-sort','catalog-list','catalog-status','catalog-prev','catalog-next','catalog-reset','history-list','history-status','history-more','market-players-view','market-history-view','market-players-tab','market-history-tab','market-current-view','market-current-tab','market-current-list','market-current-status'];
 const e=Object.fromEntries(keys.map(k=>[k,new Element()]));
 const root=new Element();root.ownerDocument={createElement:()=>new Element()};root.querySelector=k=>e[k.slice(1)];
 return {root,e};
}
test('catálogo y resultados no persisten al salir o cambiar identidad, incluso petición pendiente',async()=>{
 const {root,e}=dom();let release;
 const ctx={token:'ficticio',division:'d1',identity:'t1',client:{consultar:async(n,p,t)=>{if(n==='macroliga_mercado_visible')return [];assert.equal(n,'macroliga_catalogo_division');assert.deepEqual(p,{p_division_id:'d1',p_despues:null,p_limite:250});assert.equal(t,'ficticio');return new Promise(r=>release=r);}}};
 const panel=crearPanelCatalogo(root,()=>ctx);
 let pending=panel.show();panel.clear();release(rows);await pending;
 assert.equal(root.hidden,true);assert.equal(e['catalog-list'].children.length,0);
 pending=panel.show();release(rows);await pending;
 assert.equal(e['catalog-list'].children.length,3);assert.match(e['catalog-list'].children[1].children[2].textContent,/Baja de LaLiga/);
 assert.match(e['catalog-owner'].children.at(-1).textContent,/González/);
 e['catalog-owner'].value='team:t1';e['catalog-owner'].dispatch('change');assert.equal(e['catalog-list'].children.length,1);
 pending=panel.show();ctx.identity='t2';release(rows);await pending;assert.equal(e['catalog-list'].children.length,0);
});
test('historial de solo lectura carga de forma diferida y se borra al salir',async()=>{
 const {root,e}=dom();let release=null,historyCalls=0;
 const rec={traspaso_id:'h1',fecha:'2026-11-26T10:00:00+00:00',nombre_jugador:'Ficticio',importe_centimos:'810050',origen:'Equipo A',destino:'Computer',tipo:'computer_sale'};
 const ctx={token:'ficticio',division:'d1',identity:'t1',client:{consultar:async(n,p,t)=>{
   if(n==='macroliga_catalogo_division')return rows;
   if(n==='macroliga_mercado_visible')return [];
   historyCalls++;assert.equal(n,'macroliga_historial_traspasos');assert.equal(t,'nuevo-token');assert.deepEqual(p,{p_division_id:'d1',p_antes_fecha:null,p_antes_id:null,p_limite:50});return new Promise(r=>release=r);
 }}};
 const panel=crearPanelCatalogo(root,()=>ctx);await panel.show();assert.equal(historyCalls,0);
 ctx.token='nuevo-token';e['market-history-tab'].dispatch('click');assert.equal(historyCalls,1);release([rec]);await new Promise(r=>setImmediate(r));
 assert.equal(e['history-list'].children.length,1);assert.match(e['history-list'].children[0].children[1].textContent,/Equipo A → Computer/);
 assert.equal(e['history-more'].hidden,true);panel.clear();assert.equal(e['history-list'].children.length,0);
 await panel.show();e['market-history-tab'].dispatch('click');panel.clear();release([rec]);await new Promise(r=>setImmediate(r));assert.equal(e['history-list'].children.length,0);
});
test('consulta catálogo e historial exclusivamente por RPC con JWT de usuario',async()=>{
 const c=crearCliente({supabaseUrl:'https://xuwjbfnhvvbdargcohfe.supabase.co',anonKey:'sb_publishable_ficticia',fetchImpl:async(url,o)=>{
  assert.match(url,/rpc\/macroliga_(catalogo_division|historial_traspasos|mercado_visible)$/);assert.equal(o.headers.Authorization,'Bearer ficticio');return {ok:true,json:async()=>rows};
 }});
 for(const name of ['macroliga_catalogo_division','macroliga_historial_traspasos','macroliga_mercado_visible']){
  await assert.rejects(c.consultar(name,{},null),/iniciar sesion/);
  assert.deepEqual(await c.consultar(name,{p_division_id:'d1'},'ficticio'),rows);
 }
});

test('mercado inicial muestra 15 variados, sin admitir pujas ni generar movimientos',async()=>{
 const {root,e}=dom();
 const pos=['GK','GK',...Array(5).fill('DEF'),...Array(5).fill('MID'),...Array(3).fill('FWD')];
 const market=pos.map((p,i)=>({jugador_id:'m'+i,nombre_jugador:'Ficticio '+i,posicion:p,club:'Club de prueba',estado:'preview',valor_mercado_centimos:'1000000',puntos_acumulados:i}));
 const calls=[];
 const ctx={token:'ficticio',division:'d1',identity:'t1',client:{consultar:async(n,p)=>{calls.push(n);assert.equal(p.p_division_id,'d1');return n==='macroliga_mercado_visible'?market:rows;}}};
 const panel=crearPanelCatalogo(root,()=>ctx);await panel.show();
 assert.equal(e['market-current-view'].hidden,false);
 assert.equal(e['market-current-list'].children.length,15);
 assert.match(e['market-current-status'].textContent,/Vista previa.*sin pujas.*2 POR.*5 DEF.*5 MED.*3 DEL/);
 assert.deepEqual(calls,['macroliga_mercado_visible','macroliga_catalogo_division']);
 e['market-players-tab'].dispatch('click');assert.equal(e['market-current-view'].hidden,true);
 panel.clear();assert.equal(e['market-current-list'].children.length,0);
});

test('acceso Equipo Malo abre su plantilla real, avisa si aún no hay compras y no conserva el filtro al salir',async()=>{
 const {root,e}=dom();let catalog=rows;
 const ctx={token:'ficticio',division:'d1',identity:'t1',client:{consultar:async(n)=>n==='macroliga_catalogo_division'?catalog:[]}};
 const panel=crearPanelCatalogo(root,()=>ctx);
 await panel.show('bad');
 assert.equal(root.hidden,false);assert.equal(e['market-players-view'].hidden,false);assert.equal(e['catalog-owner'].value,'bad_team');assert.equal(e['catalog-heading'].textContent,'Equipo Malo');assert.equal(e['catalog-list'].children.length,1);
 assert.equal(e['catalog-list'].children[0].children[0].textContent,rows[2].nombre_jugador);
 catalog=rows.slice(0,2);await panel.show('bad');
 assert.match(e['catalog-status'].textContent,/aún no tiene jugadores/);assert.equal(e['catalog-list'].children.length,0);
 await panel.show('market');assert.equal(e['market-current-view'].hidden,false);assert.equal(e['catalog-owner'].value,'all');assert.equal(e['catalog-heading'].textContent,'Todos los jugadores');
});
