import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importeNoticia,prepararNoticias,crearPanelNoticias,claveDiaMadrid,desplazarDia,cursorDia,fechaValida} from '../app/noticias.mjs';
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
  await panel.show('news');await panel.buscar('todas');assert.equal(home.children.length,0);assert.equal(encontrados(hist,'article').length,50);
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

test('Días civiles en Madrid, incluyendo los cambios de hora y el cambio de año',()=>{
  assert.equal(claveDiaMadrid('2026-11-26T23:00:00Z'),'2026-11-27');
  assert.equal(desplazarDia('2027-01-01',-1),'2026-12-31');
  assert.equal(fechaValida('2026-02-30'),false);
  assert.deepEqual(cursorDia('2026-03-29'),{fecha:'2026-03-29T22:00:00.000Z',traspaso_id:'00000000-0000-0000-0000-000000000000'});
  assert.equal(cursorDia('2026-03-28').fecha,'2026-03-28T23:00:00.000Z');
  assert.equal(cursorDia('2026-10-25').fecha,'2026-10-25T23:00:00.000Z');
  assert.equal(cursorDia('2026-10-24').fecha,'2026-10-24T22:00:00.000Z');
});
test('Hoy, ayer, fecha concreta y todas buscan por cursor, sin mezclar fechas',async()=>{
  const home=new Nodo('div'),hist=new Nodo('div'),calls=[];
  const ctx={session:1,division:'d',identity:'i',token:'t',client:{async consultar(_n,p){calls.push(p);
    const catalogo=[fila('1','market','2026-11-27T08:00:00Z'),fila('2','clause','2026-11-26T08:00:00Z'),fila('3','bad_team_sale','2026-10-01T08:00:00Z')];
    return p.p_antes_fecha?catalogo.filter(f=>Date.parse(f.fecha)<Date.parse(p.p_antes_fecha)):catalogo;
  }}};
  const panel=crearPanelNoticias(home,hist,()=>ctx,null,()=>new Date('2026-11-27T11:00:00Z'));
  await panel.show('news');assert.equal(calls.at(-1).p_antes_fecha,'2026-11-27T23:00:00.000Z');
  assert.equal(encontrados(hist,'article').length,1);
  await panel.buscar('ayer');assert.equal(calls.at(-1).p_antes_fecha,'2026-11-26T23:00:00.000Z');
  assert.match(encontrados(hist,'article')[0].children[0].textContent,/2$/);
  await panel.buscar('fecha','2026-10-01');assert.equal(calls.at(-1).p_antes_fecha,'2026-10-01T22:00:00.000Z');
  assert.match(encontrados(hist,'article')[0].children[0].textContent,/3$/);
  await panel.buscar('fecha','2026-10-02');assert.equal(encontrados(hist,'article').length,0);
  assert.match(encontrados(hist,'p')[0].textContent,/esta fecha/);
  await panel.buscar('todas');assert.equal(calls.at(-1).p_antes_fecha,null);assert.equal(encontrados(hist,'article').length,3);
  const total=calls.length;await panel.buscar('fecha','2026-12-01');assert.equal(calls.length,total);
});
test('Paginación del día conserva el cursor exacto y no mezcla días anteriores',async()=>{
  const home=new Nodo('div'),hist=new Nodo('div'),calls=[];
  const page=Array.from({length:50},(_,i)=>fila(String(i+1),'market','2026-11-27T08:00:00.123456Z'));
  const ctx={session:1,division:'d',identity:'i',token:'t',client:{async consultar(_n,p){calls.push(p);
    return p.p_antes_id==='50'?[fila('51','market','2026-11-27T08:00:00.000001Z'),fila('52','market','2026-11-26T08:00:00Z')]:page;
  }}};
  const panel=crearPanelNoticias(home,hist,()=>ctx,null,()=>new Date('2026-11-27T11:00:00Z'));
  await panel.show('news');assert.equal(encontrados(hist,'article').length,50);
  encontrados(hist,'button')[0].listeners.click();await tick();
  assert.equal(calls.at(-1).p_antes_fecha,page.at(-1).fecha);
  assert.equal(encontrados(hist,'article').length,51);assert.equal(encontrados(hist,'button').length,0);
});
test('Cambiar el filtro invalida respuestas anteriores',async()=>{
  const home=new Nodo('div'),hist=new Nodo('div'),pendientes=[];
  const ctx={session:1,division:'d',identity:'i',token:'t',client:{consultar:()=>new Promise(r=>pendientes.push(r))}};
  const panel=crearPanelNoticias(home,hist,()=>ctx,null,()=>new Date('2026-11-27T11:00:00Z'));
  const anterior=panel.show('news');const actual=panel.buscar('ayer');
  pendientes[1]([fila('ayer','market','2026-11-26T08:00:00Z')]);await actual;
  pendientes[0]([fila('hoy','market','2026-11-27T08:00:00Z')]);await anterior;
  assert.equal(encontrados(hist,'article').length,1);assert.match(encontrados(hist,'article')[0].children[0].textContent,/ayer$/);
});

test('Los botones y el calendario activan sus filtros accesibles',async()=>{
  const home=new Nodo('div'),hist=new Nodo('div'),calls=[];
  const botones=['hoy','ayer','todas'].map(modo=>{
    const n=new Nodo('button');n.dataset={newsFilter:modo};n.setAttribute=(k,v)=>n[k]=v;return n;
  });
  const input=new Nodo('input');
  const filtros={querySelectorAll:()=>botones,querySelector:()=>input};
  const ctx={session:1,division:'d',identity:'i',token:'t',client:{async consultar(_n,p){calls.push(p);return [];}}};
  const panel=crearPanelNoticias(home,hist,()=>ctx,filtros,()=>new Date('2026-11-27T11:00:00Z'));
  await panel.show('news');assert.equal(botones[0]['aria-pressed'],'true');assert.equal(input.max,'2026-11-27');
  botones[1].listeners.click();await tick();
  assert.equal(botones[1]['aria-pressed'],'true');assert.equal(input.value,'2026-11-26');
  input.value='2026-11-12';input.listeners.change();await tick();
  assert.equal(calls.at(-1).p_antes_fecha,'2026-11-12T23:00:00.000Z');
  assert.ok(botones.every(b=>b['aria-pressed']==='false'));
  botones[2].listeners.click();await tick();
  assert.equal(input.value,'');assert.equal(calls.at(-1).p_antes_fecha,null);assert.equal(botones[2]['aria-pressed'],'true');
});
