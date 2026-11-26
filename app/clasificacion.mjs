// Clasificación autenticada, de solo lectura y sin datos persistidos.
const fmt=new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',minimumFractionDigits:0,maximumFractionDigits:2});
function valor(cents){
 const n=BigInt(cents),whole=n/100n,frac=n%100n;
 if(frac===0n)return fmt.format(whole);
 return new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',minimumFractionDigits:2}).formatToParts(whole).map(p=>p.type==='fraction'?frac.toString().padStart(2,'0'):p.value).join('');
}
export function crearPanelClasificacion(root,contexto){
 if(!root)return null;
 const doc=root.ownerDocument,status=root.querySelector('#standings-status'),body=root.querySelector('#standings-rows');
 let generation=0;
 function clear(){generation++;root.hidden=true;status.textContent='';body.replaceChildren();}
 async function show(){
  clear();root.hidden=false;
  const c={...contexto()},g=generation;
  const valid=()=>generation===g&&contexto()?.division===c.division&&contexto()?.identity===c.identity&&Boolean(contexto()?.token);
  if(!c.token||!c.division){status.textContent='Clasificación no disponible.';return;}
  status.textContent='Consultando clasificación…';
  try{
   const rows=await c.client.consultar('macroliga_clasificacion',{p_division_id:c.division},c.token);
   if(!valid())return;
   if(!Array.isArray(rows)||rows.some(r=>!r.equipo_id||typeof r.nombre_manager!=='string'||r.valor_equipo_centimos==null||r.puntos==null))throw Error('Respuesta inválida');
   for(const r of rows){
    const tr=doc.createElement('tr');
    if(r.es_mi_equipo)tr.classList.add('my-standing');
    const rank=doc.createElement('td'),manager=doc.createElement('td'),money=doc.createElement('td'),points=doc.createElement('td');
    rank.textContent=String(r.posicion);manager.textContent=r.nombre_manager;
    if(r.nombre_equipo&&r.nombre_equipo!==r.nombre_manager){const team=doc.createElement('small');team.textContent=r.nombre_equipo;manager.appendChild(team);}
    money.textContent=valor(r.valor_equipo_centimos);points.textContent=String(r.puntos);
    tr.appendChild(rank);tr.appendChild(manager);tr.appendChild(money);tr.appendChild(points);body.appendChild(tr);
   }
   status.textContent=rows.length?rows.length+' managers · Puntos confirmados. Los empates comparten posición.':'Todavía no hay managers en esta división.';
  }catch(e){if(valid()){body.replaceChildren();status.textContent='No se pudo consultar la clasificación. No has cerrado sesión.';}}
 }
 return {show,clear};
}
