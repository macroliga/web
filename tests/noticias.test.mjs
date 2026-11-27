import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importeNoticia,prepararNoticias,crearPanelNoticias} from '../app/noticias.mjs';
const fila=(id='1',tipo='bad_team_sale',fecha='2026-11-26T23:00:00.123456Z')=>({
  traspaso_id:id, fecha, nombre_jugador:'Jugador ficticio '+id, origen:'Computer',
  destino:'Equipo Malo', importe_centimos:'16000000',tipo
});
test('Madrid: agrupa por día local y conserva el cursor original',()=>{
  const [a,b]=prepararNoticias([fila(),fila('2','clause','2026-11-26T22:59:59.999999Z')]);
  assert.match(a.dia,/27 de noviembre/);assert.match(b.dia,/26 de noviembre/);
  assert.equal(a.fecha,'2026-11-26T23:00:00.123456Z');
  assert.match(a.ruta,/COMPUTER → Equipo Malo/);assert.equal(a.hora,'00:00');
});
test('Tipos de traspaso, euros exactos y validación',()=>{
  assert.deepEqual(prepararNoticias(['market','manager_sale','computer_sale','bad_team_sale','clause','bad_team_clause'].map((t,i)=>fila(String(i),t))).map(f=>f.etiqueta),['Mercado','Entre managers','Venta a COMPUTER','Equipo Malo','Cláusula','Cláusula · Equipo Malo']);
  assert.equal(importeNoticia('123456789012345678901'),'1.234.567.890.123.456.789,01 €');
  assert.throws(()=>prepararNoticias([{...fila(),fecha:'x'}]));assert.throws(()=>importeNoticia('-1'));
});
class Nodo {
  constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.listeners={};}
  append(...n){this.children.push(...n);} replaceChildren(){this.children=[];}
  addEventListener(s,f){this.listeners[s]=f;}
}
globalThis.document={createElement:t=>new Nodo(t)};
const encontrados=(root,tag)=>root.children.filter(n=>n.tag===tag);
const tick=()=>new Promise(r=>setImmediate(r));
test('Portada 5, historial paginado, cursor, error recuperable y borrado de sesión',async()=>{
  const home=new Nodo('div'),hist=new Nodo('div'), calls=[];
  const page=Array.from({length:50},(_,i)=>fila(String(i+1)));
  let duplicar=true;
  const ctx={session:1,division:'division-ficticia',identity:'equipo-ficticio',token:'token-local',
    client:{async consultar(nombre,p,token){calls.push({nombre,p,token});return p.p_antes_id?(duplicar?[fila('50')]:[fila('51')]):page.slice(0,p.p_limite);}}};
  const panel=crearPanelNoticias(home,hist,()=>ctx);
  await panel.show('home');assert.equal(encontrados(home,'article').length,5);
  assert.equal(calls[0].p.p_limite,5);assert.equal(calls[0].token,'token-local');
  await panel.show('news');assert.equal(home.children.length,0);assert.equal(encontrados(hist,'article').length,50);
  encontrados(hist,'button')[0].listeners.click();await tick();
  assert.equal(calls.at(-1).p.p_antes_id,'50');assert.equal(calls.at(-1).p.p_antes_fecha,page.at(-1).fecha);
  assert.equal(encontrados(hist,'article').length,50);assert.equal(encontrados(hist,'button')[0].textContent,'Reintentar');
  duplicar=false;encontrados(hist,'button')[0].listeners.click();await tick();
  assert.equal(encontrados(hist,'article').length,51);assert.equal(encontrados(hist,'button').length,0);
  panel.clear();assert.equal(hist.children.length,0);
});
test('Una respuesta tardía no puede repoblar tras cerrar sesión',async()=>{
  const home=new Nodo('div'),hist=new Nodo('div');
  let responder;
  const ctx={session:1,division:'d',identity:'i',token:'t',client:{consultar:()=>new Promise(r=>responder=r)}};
  const panel=crearPanelNoticias(home,hist,()=>ctx);
  const pendiente=panel.show('home');panel.clear();ctx.token=null;responder([fila()]);await pendiente;
  assert.equal(home.children.length,0);assert.equal(hist.children.length,0);
});
