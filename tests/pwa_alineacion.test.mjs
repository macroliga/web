import test from 'node:test';
import assert from 'node:assert/strict';
import {FORMACIONES,plazas,validarOnce,colocarOnce,inferirFormacion,agruparPartidos} from '../app/alineacion.mjs';
import {crearCliente} from '../app/api.mjs';
const roster=Object.entries({GK:2,DEF:6,MID:6,FWD:4}).flatMap(([posicion,n])=>Array.from({length:n},(_,i)=>({id:posicion+i,posicion,activo:true})));
const once=f=>plazas(f).map((p,i,a)=>p+(a.slice(0,i).filter(x=>x===p).length));
test('siete esquemas válidos y once completo de posiciones correctas',()=>{
 assert.equal(FORMACIONES.length,7);
 for(const f of FORMACIONES){
  const ids=once(f);
  assert.equal(ids.length,11);assert.equal(validarOnce(ids,roster,{completo:true}),true);
  assert.equal(inferirFormacion(ids,roster),f);
  assert.deepEqual(colocarOnce(ids.reverse(),roster,f).sobrantes,[]);
 }
});
test('borradores compatibles, once oficial obligatorio, sin repetidos, inactivos ni ajenos',()=>{
 const partial=['GK0',...Array(10).fill(null)];
 assert.equal(validarOnce(partial,roster),true);
 assert.equal(validarOnce(partial,roster,{completo:true}),false);
 assert.equal(validarOnce(['GK0','GK0',...Array(9).fill(null)],roster),false);
 assert.equal(validarOnce(['GK0','GK1',...Array(9).fill(null)],roster),false);
 assert.equal(validarOnce(['DEF0','DEF1','DEF2','DEF3','DEF4','DEF5',...Array(5).fill(null)],roster),false);
 assert.equal(validarOnce(['FWD0','FWD1','FWD2','FWD3',...Array(7).fill(null)],roster),false);
 assert.equal(validarOnce(['MID0','MID1','MID2','MID3','MID4','MID5',...Array(5).fill(null)],roster),false);
 assert.equal(validarOnce(['otro',...Array(10).fill(null)],roster),false);
 assert.equal(validarOnce(['GK0',...Array(10).fill(null)],roster.map(p=>p.id==='GK0'?{...p,activo:false}:p)),false);
 assert.equal(validarOnce([],roster),false);
});
test('cambio de esquema y datos históricos nunca ocultan ni eliminan jugadores',()=>{
 const ids=[...once('4-4-2')];
 const {slots,sobrantes}=colocarOnce(ids,roster,'3-4-3');
 assert.equal(sobrantes.length,1);assert.equal(roster.find(p=>p.id===sobrantes[0]).posicion,'DEF');
 assert.deepEqual([...slots.filter(Boolean),...sobrantes].sort(),ids.sort());
 const old=colocarOnce(['otro','GK0','GK1'],roster,'4-4-2');
 assert.deepEqual(old.sobrantes,['otro','GK1']);
});
test('RPC de operaciones limitadas al usuario y no confunden error de puja con cierre de sesión',async()=>{
 let calls=0;
 const c=crearCliente({supabaseUrl:'https://prueba.supabase.co',anonKey:'sb_publishable_ficticia',fetchImpl:async(url,options)=>{
  calls++;assert.match(url,/macroliga_presentar_puja$/);assert.equal(options.headers.Authorization,'Bearer usuario-ficticio');
  assert.deepEqual(JSON.parse(options.body),{p_lote_id:'lote',p_importe_centimos:'120000'});
  return {ok:false,status:400,json:async()=>({code:'22023',message:'Mercado cerrado'})};
 }});
 await assert.rejects(c.operar('macroliga_admin_iniciar_todo',{},'usuario-ficticio'),/no permitida/);
 await assert.rejects(c.operar('macroliga_presentar_puja',{},null),/no permitida/);
 await assert.rejects(c.operar('macroliga_presentar_puja',{p_lote_id:'lote',p_importe_centimos:'120000'},'usuario-ficticio'),e=>e.operationMessage==='Mercado cerrado'&&!e.sesionRevocada);
 assert.equal(calls,1);
});


test('calendario agrupa y ordena por fecha y hora de Madrid, sin códigos técnicos',()=>{
 const grupos=agruparPartidos([
  {local:'C',visitante:'D',inicio:'2026-11-28T13:00:00Z',estado:'FINISHED'},
  {local:'E',visitante:'F',inicio:'2026-11-27T23:30:00Z',estado:'TIMED'},
  {local:'A',visitante:'B',inicio:'2026-11-27T20:00:00Z',estado:'TIMED'},
  {local:'G',visitante:'H',inicio:null,estado:'POSTPONED'},
  {local:'I',visitante:'J',inicio:'2026-11-28T15:15:00Z',estado:'IN_PLAY'},
  {local:'K',visitante:'L',inicio:'incorrecta',estado:'DESCONOCIDO'}
 ]);
 assert.deepEqual(grupos.map(g=>g.clave),['2026-11-27','2026-11-28','pendiente']);
 assert.equal(grupos[0].dia,'viernes, 27 de noviembre');
 assert.deepEqual(grupos[0].partidos.map(p=>[p.local,p.hora,p.estado]),[['A','21:00',null]]);
 assert.deepEqual(grupos[1].partidos.map(p=>[p.local,p.hora,p.estado,p.enJuego]),[['E','00:30',null,false],['C','14:00','Finalizado',false],['I','16:15','En juego',true]]);
 assert.equal(grupos[2].partidos[0].estado,'Aplazado');
 assert.equal(grupos[2].partidos[1].inicio,null);
 assert.equal(grupos[2].partidos[1].estado,'Estado por confirmar');
 assert.deepEqual(agruparPartidos([]),[]);
});

test('calendario real del panel presenta tarjetas diarias, horarios y limpia datos al salir',async()=>{
 const {crearPanelAlineacion}=await import('../app/alineacion.mjs');
 class Nodo{
  constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.listeners={};this.hidden=false;this.textContent='';}
  replaceChildren(...nodes){this.children=nodes;}
  appendChild(n){this.children.push(n);return n;}
  append(...nodes){this.children.push(...nodes);}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,v){this.listeners[k]=v;}
 }
 const ids=['lineup-status','lineup-message','lineup-count','lineup-positions','lineup-fixtures-summary','lineup-fixtures-legend',
 'lineup-slots','lineup-fixtures','lineup-save','lineup-draft','lineup-reload','lineup-formation','lineup-validation','lineup-extras','lineup-controls'];
 const elementos=Object.fromEntries(ids.map(id=>[id,new Nodo()]));
 const root=new Nodo();
 root.ownerDocument={createElement:tag=>new Nodo(tag)};
 root.querySelector=id=>elementos[id.slice(1)];
 const fixtures=[{local:'Betis',visitante:'Rayo Vallecano',inicio:'2026-11-28T13:00:00Z',estado:'TIMED'},
 {local:'Levante',visitante:'Racing',inicio:'2026-11-27T20:00:00Z',estado:'TIMED'},
 {local:'Málaga',visitante:'Athletic',inicio:'2026-11-28T15:15:00Z',estado:'FINISHED'}];
 const client={consultar:async()=>({plantilla:[],partidos:fixtures,jornada_id:'j14',numero:14,version:0,editable:true,slots:Array(11).fill(null)})};
 const panel=crearPanelAlineacion(root,()=>({client,identity:'manager-test',division:'d-test',token:'ficticio'}));
 await panel.show();
 const lista=elementos['lineup-fixtures'];
 assert.equal(lista.children.length,2);
 assert.equal(elementos['lineup-fixtures-summary'].textContent,'3 partidos');
 assert.equal(elementos['lineup-fixtures-legend'].hidden,false);
 const [viernes,sabado]=lista.children;
 assert.equal(viernes.className,'fixture-day');
 assert.equal(viernes.children[0].children[0].textContent,'viernes, 27 de noviembre');
 const primer=viernes.children[1].children[0];
 assert.equal(primer.children[0].textContent,'Levante');
 assert.equal(primer.children[1].children[0].textContent,'21:00');
 assert.equal(primer.children[1].children.length,1);
 assert.equal(primer.children[2].textContent,'Racing');
 assert.equal(sabado.children[1].children[1].children[1].children[1].textContent,'Finalizado');
 panel.clear();
 assert.equal(lista.children.length,0);
 assert.equal(elementos['lineup-fixtures-summary'].hidden,true);
 assert.equal(elementos['lineup-fixtures-legend'].hidden,true);
});
