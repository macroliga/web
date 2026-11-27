// Clasificación y plantillas de la propia división: lecturas autenticadas.
const fmt=new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',minimumFractionDigits:0,maximumFractionDigits:2});
function valor(cents){
 const n=BigInt(cents),whole=n/100n,frac=n%100n;
 if(frac===0n)return fmt.format(whole);
 return new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',minimumFractionDigits:2}).formatToParts(whole).map(p=>p.type==='fraction'?frac.toString().padStart(2,'0'):p.value).join('');
}
const GRUPOS=[['GK','Porteros'],['DEF','Defensas'],['MID','Centrocampistas'],['FWD','Delanteros'],['OTRO','Otros']];
function posicion(p){
 const s=String(p??'').trim().toUpperCase();
 if(['GK','POR','PORTERO','PORTEROS'].includes(s))return 'GK';
 if(['DEF','DEFENSA','DEFENSAS'].includes(s))return 'DEF';
 if(['MID','MED','MC','MEDIO','MEDIOS','CENTROCAMPISTA','CENTROCAMPISTAS'].includes(s))return 'MID';
 if(['FWD','DEL','DELANTERO','DELANTEROS'].includes(s))return 'FWD';
 return 'OTRO';
}
const esTexto=v=>typeof v==='string'&&v.trim().length>0;
const centsValidos=v=>/^\d+$/.test(String(v))&&(typeof v!=='number'||Number.isSafeInteger(v));
export function agruparPlantilla(rows,equipo,division){
 if(!Array.isArray(rows))throw Error('Respuesta inválida');
 const ids=new Set();
 for(const r of rows){
  if(!r||r.equipo_id!==equipo||r.division_id!==division||!esTexto(r.jugador_id)||!esTexto(r.nombre_jugador)||!centsValidos(r.valor_mercado_centimos)||ids.has(r.jugador_id))throw Error('Plantilla inválida');
  ids.add(r.jugador_id);
 }
 return GRUPOS.map(([codigo,titulo])=>({codigo,titulo,jugadores:rows.filter(r=>posicion(r.posicion)===codigo).sort((a,b)=>a.nombre_jugador.localeCompare(b.nombre_jugador,'es',{sensitivity:'base'})||a.jugador_id.localeCompare(b.jugador_id))})).filter(g=>g.jugadores.length);
}
export function crearPanelClasificacion(root,contexto){
 if(!root)return null;
 const doc=root.ownerDocument,q=id=>root.querySelector('#'+id);
 const status=q('standings-status'),body=q('standings-rows'),overview=q('standings-overview'),detail=q('standings-team-panel'),back=q('standings-team-back'),title=q('standings-team-title'),sub=q('standings-team-manager'),summary=q('standings-team-summary'),teamStatus=q('standings-team-status'),roster=q('standings-team-roster'),retry=q('standings-team-retry');
 if(![status,body,overview,detail,back,title,sub,summary,teamStatus,roster,retry].every(Boolean))return null;
 let generation=0,seleccion=null,origen=null;
 const nodo=(tag,clase,text)=>{const n=doc.createElement(tag);if(clase)n.className=clase;if(text!==undefined)n.textContent=text;return n;};
 const valido=(g,c)=>{const nuevo=contexto();return generation===g&&!root.hidden&&Boolean(nuevo?.token)&&c.division===nuevo.division&&c.identity===nuevo.identity&&c.session===nuevo.session;};
 function limpiarDetalle(){detail.hidden=true;title.textContent='';sub.textContent='';summary.replaceChildren();roster.replaceChildren();teamStatus.textContent='';retry.hidden=true;seleccion=null;}
 function clear(){generation++;root.hidden=true;overview.hidden=false;root.setAttribute('aria-labelledby','standings-heading');status.textContent='';body.replaceChildren();limpiarDetalle();origen=null;}
 function volver(){
  if(root.hidden)return;
  generation++;limpiarDetalle();overview.hidden=false;root.setAttribute('aria-labelledby','standings-heading');
  origen?.focus();origen=null;
 }
 back.addEventListener('click',volver);
 retry.addEventListener('click',()=>{if(seleccion&&!root.hidden)void verEquipo(seleccion);});
 function pintarResumen(r,cantidad){
  summary.replaceChildren();
  for(const [etiqueta,dato] of [['Posición',String(r.posicion)+'º'],['Puntos',String(r.puntos)],['Valor plantilla',valor(r.valor_equipo_centimos)],['Jugadores',String(cantidad)]]){
   const caja=nodo('div','standing-team-stat');
   caja.append(nodo('span','',etiqueta),nodo('strong','',dato));summary.append(caja);
  }
 }
 async function verEquipo(r,boton=null){
  const c={...contexto()};if(root.hidden||!c.client||!c.token||!c.division||!c.identity)return;
  const g=++generation;seleccion=r;if(boton)origen=boton;
  overview.hidden=true;detail.hidden=false;root.setAttribute('aria-labelledby','standings-team-title');
  title.textContent=r.nombre_equipo||r.nombre_manager;
  sub.textContent=r.nombre_equipo&&r.nombre_equipo!==r.nombre_manager?'Manager: '+r.nombre_manager:'';
  pintarResumen(r,'—');roster.replaceChildren();retry.hidden=true;teamStatus.textContent='Consultando plantilla…';
  if(boton)title.focus();
  try{
   const rows=await c.client.consultar('macroliga_plantilla_equipo',{p_equipo_id:r.equipo_id},c.token);
   if(!valido(g,c))return;
   const grupos=agruparPlantilla(rows,r.equipo_id,c.division);
   pintarResumen(r,rows.length);
   for(const grupo of grupos){
    const bloque=nodo('section','roster-position'),cabecera=nodo('div','roster-position-head');
    cabecera.append(nodo('h4','',grupo.titulo),nodo('span','',String(grupo.jugadores.length)));bloque.append(cabecera);
    for(const jugador of grupo.jugadores){
     const fila=nodo('article','roster-player standing-roster-player'),info=nodo('div','roster-player-info'),precio=nodo('div','roster-player-actions');
     info.append(nodo('strong','roster-player-name',jugador.nombre_jugador),nodo('span','roster-player-club',jugador.club||'Club sin confirmar'));
     precio.append(nodo('small','roster-value-label','VALOR'),nodo('strong','roster-player-value',valor(jugador.valor_mercado_centimos)));
     fila.append(info,precio);bloque.append(fila);
    }
    roster.append(bloque);
   }
   teamStatus.textContent=rows.length?'Plantilla actual del equipo.':'Este equipo aún no tiene jugadores.';
  }catch(e){if(valido(g,c)){roster.replaceChildren();pintarResumen(r,'—');teamStatus.textContent='No se pudo consultar la plantilla. Puedes volver a intentarlo.';retry.hidden=false;}}
 }
 async function show(){
  clear();root.hidden=false;
  const c={...contexto()},g=generation;
  if(!c.client||!c.token||!c.division||!c.identity){status.textContent='Clasificación no disponible.';return;}
  status.textContent='Consultando clasificación…';
  try{
   const rows=await c.client.consultar('macroliga_clasificacion',{p_division_id:c.division},c.token);
   if(!valido(g,c))return;
   if(!Array.isArray(rows)||rows.some(r=>!r||!esTexto(r.equipo_id)||!esTexto(r.nombre_manager)||!centsValidos(r.valor_equipo_centimos)||r.puntos==null))throw Error('Respuesta inválida');
   for(const r of rows){
    const tr=doc.createElement('tr');tr.classList.add('standing-clickable');
    if(r.es_mi_equipo)tr.classList.add('my-standing');
    const rank=doc.createElement('td'),manager=doc.createElement('td'),money=doc.createElement('td'),points=doc.createElement('td');
    rank.textContent=String(r.posicion);
    const boton=nodo('button','standing-team-link');boton.type='button';
    boton.append(nodo('span','',r.nombre_manager));
    if(r.nombre_equipo&&r.nombre_equipo!==r.nombre_manager)boton.append(nodo('small','',r.nombre_equipo));
    boton.setAttribute('aria-label','Ver plantilla de '+(r.nombre_equipo||r.nombre_manager));
    boton.addEventListener('click',()=>{if(!overview.hidden)void verEquipo(r,boton);});
    tr.addEventListener('click',e=>{if(!overview.hidden&&!e.target.closest('button'))void verEquipo(r,boton);});
    manager.append(boton);
    money.textContent=valor(r.valor_equipo_centimos);points.textContent=String(r.puntos);
    tr.append(rank,manager,money,points);body.append(tr);
   }
   status.textContent=rows.length?rows.length+' managers · Puntos confirmados. Los empates comparten posición. Pulsa un equipo para ver su plantilla.':'Todavía no hay managers en esta división.';
  }catch(e){if(valido(g,c)){body.replaceChildren();status.textContent='No se pudo consultar la clasificación. No has cerrado sesión.';}}
 }
 return {show,clear};
}
