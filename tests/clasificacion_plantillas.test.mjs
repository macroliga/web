import {test} from 'node:test';
import assert from 'node:assert/strict';
import {agruparPlantilla,crearPanelClasificacion} from '../app/clasificacion.mjs';
const equipo={equipo_id:'rival',nombre_manager:'Manager ficticio',nombre_equipo:'Equipo ficticio',valor_equipo_centimos:'123456789',posicion:2,puntos:15};
const jugador=(id='1',pos='GK',nombre='Jugador ficticio',e='rival',d='division')=>({equipo_id:e,division_id:d,jugador_id:id,nombre_jugador:nombre,posicion:pos,club:'Club ficticio',valor_mercado_centimos:'120000000'});
test('Agrupa por posición y nombre, excluye otras divisiones y duplicados',()=>{
 const grupos=agruparPlantilla([jugador('3','DEF','Zeta'),jugador('2','DEF','Alfa'),jugador('1','POR'),jugador('4','FWD'),jugador('5','MED')],'rival','division');
 assert.deepEqual(grupos.map(g=>g.codigo),['GK','DEF','MID','FWD']);
 assert.deepEqual(grupos[1].jugadores.map(j=>j.nombre_jugador),['Alfa','Zeta']);
 assert.throws(()=>agruparPlantilla([jugador('1','GK','X','otro')],'rival','division'));
 assert.throws(()=>agruparPlantilla([jugador('1','GK','X','rival','otra')],'rival','division'));
 assert.throws(()=>agruparPlantilla([jugador(),jugador()],'rival','division'));
 assert.deepEqual(agruparPlantilla([],'rival','division'),[]);
});
class Nodo{
 constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.listeners={};this.hidden=false;this.classList={add:()=>{}};}
 append(...n){this.children.push(...n);} replaceChildren(){this.children=[];}
 addEventListener(t,fn){this.listeners[t]=fn;} setAttribute(k,v){this[k]=v;} focus(){this.focused=true;}
 click(){this.listeners.click?.({target:{closest:()=>null}});}
}
const ids=['standings-status','standings-rows','standings-overview','standings-team-panel','standings-team-back','standings-team-title','standings-team-manager','standings-team-summary','standings-team-status','standings-team-roster','standings-team-retry'];
function preparar(client){
 const elementos=Object.fromEntries(ids.map(i=>[i,new Nodo('div')]));
 const root=new Nodo('section');root.ownerDocument={createElement:t=>new Nodo(t)};root.querySelector=s=>elementos[s.slice(1)];
 const ctx={client,token:'jwt-local',division:'division',identity:'propio',session:1};
 const panel=crearPanelClasificacion(root,()=>ctx);
 return {elementos,root,ctx,panel};
}
const tick=()=>new Promise(r=>setImmediate(r));
const link=e=>e['standings-rows'].children[0].children[1].children[0];
test('Click en clasificación: plantilla rival, valores públicos y vuelta sin reconsulta',async()=>{
 const calls=[];const {elementos:e,panel}=preparar({async consultar(name,p,token){calls.push({name,p,token});return name==='macroliga_clasificacion'?[equipo]:[jugador(),jugador('2','MID','Otro')];}});
 await panel.show();
 assert.equal(e['standings-overview'].hidden,false);
 link(e).click();await tick();
 assert.deepEqual(calls[1],{name:'macroliga_plantilla_equipo',p:{p_equipo_id:'rival'},token:'jwt-local'});
 assert.equal(e['standings-overview'].hidden,true);
 assert.equal(e['standings-team-title'].textContent,'Equipo ficticio');
 assert.equal(e['standings-team-roster'].children.length,2);
 assert.equal(e['standings-team-summary'].children[3].children[1].textContent,'2');
 e['standings-team-back'].click();
 assert.equal(e['standings-overview'].hidden,false);assert.equal(e['standings-team-roster'].children.length,0);
 assert.equal(calls.length,2);assert.equal(link(e).focused,true);
});
test('Muestra error recuperable sin pintar una respuesta de otra división',async()=>{
 let problema=true;
 const {elementos:e,panel}=preparar({async consultar(n){return n==='macroliga_clasificacion'?[equipo]:problema?[jugador('1','GK','X','rival','otra')]:[jugador()];}});
 await panel.show();link(e).click();await tick();
 assert.equal(e['standings-team-roster'].children.length,0);
 assert.equal(e['standings-team-retry'].hidden,false);
 problema=false;e['standings-team-retry'].click();await tick();
 assert.equal(e['standings-team-roster'].children.length,1);
 assert.equal(e['standings-team-retry'].hidden,true);
});
test('Respuesta tardía tras volver, cambiar sesión o salir no revela plantilla',async()=>{
 let resolver;
 const {elementos:e,ctx,panel}=preparar({consultar(n){return n==='macroliga_clasificacion'?Promise.resolve([equipo]):new Promise(r=>resolver=r);}});
 await panel.show();link(e).click();e['standings-team-back'].click();resolver([jugador()]);await tick();
 assert.equal(e['standings-team-roster'].children.length,0);
 link(e).click();ctx.session++;resolver([jugador()]);await tick();assert.equal(e['standings-team-roster'].children.length,0);
 panel.clear();assert.equal(e['standings-team-title'].textContent,'');
 await panel.show();link(e).click();panel.clear();resolver([jugador()]);await tick();assert.equal(e['standings-team-roster'].children.length,0);
});
