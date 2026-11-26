const posiciones={GK:'POR',DEF:'DEF',MID:'MED',FWD:'DEL'};
const fecha=new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',dateStyle:'short',timeStyle:'short'});
const vacio=()=>Array(11).fill(null);
export function validarOnce(slots,plantilla){
  if(!Array.isArray(slots)||slots.length!==11)return false;
  const ids=slots.filter(x=>x!==null);
  const validos=new Set(plantilla.filter(p=>p.activo).map(p=>p.id));
  return new Set(ids).size===ids.length&&ids.every(id=>validos.has(id));
}
export function crearPanelAlineacion(root,contexto){
 if(!root)return null;
 const doc=root.ownerDocument,el=id=>root.querySelector('#'+id);
 const status=el('lineup-status'),message=el('lineup-message'),count=el('lineup-count'),positions=el('lineup-positions');
 const list=el('lineup-slots'),fixtures=el('lineup-fixtures'),save=el('lineup-save'),draft=el('lineup-draft'),reload=el('lineup-reload');
 let generation=0,ctx=null,data=null,slots=vacio(),isDraft=true,busy=false,version=0;
 const valid=(g,c)=>g===generation&&contexto()?.identity===c?.identity&&contexto()?.division===c?.division&&!!contexto()?.token;
 const node=(tag,txt)=>{const n=doc.createElement(tag);if(txt!=null)n.textContent=txt;return n;};
 const editable=()=>isDraft||data?.editable;
 function render(){
  list.replaceChildren();
  const roster=data.plantilla||[];
  const selected=slots.map(id=>roster.find(p=>p.id===id)).filter(Boolean);
  count.textContent=slots.filter(Boolean).length+' / 11 titulares';
  positions.textContent=Object.entries(posiciones).map(([p,n])=>selected.filter(x=>x.posicion===p).length+' '+n).join(' · ');
  status.textContent=isDraft?'Borrador personal: todavía no puntúa ni se aplica a una jornada.':
   'Jornada '+data.numero+(data.limite?' · Cierre '+fecha.format(new Date(data.limite)):' · Horario pendiente')+(data.editable?' · Abierta':' · Cerrada o no confirmada');
  draft.hidden=isDraft; save.textContent=isDraft?'Guardar borrador':'Guardar alineación';
  save.disabled=busy||!editable()||!validarOnce(slots,roster);
  for(let i=0;i<11;i++){
   const label=node('label','Titular '+(i+1)),select=node('select');
   const empty=node('option','Sin jugador');empty.value='';select.appendChild(empty);
   for(const p of roster.filter(p=>p.activo||p.id===slots[i])){
    const opt=node('option',[posiciones[p.posicion],p.nombre,p.club].filter(Boolean).join(' · '));
    opt.value=p.id;opt.disabled=!p.activo||slots.some((x,j)=>j!==i&&x===p.id);select.appendChild(opt);
   }
   if(slots[i]&&!roster.some(p=>p.id===slots[i])){const op=node('option','Jugador que ya no está en tu plantilla');op.value=slots[i];select.appendChild(op);}
   select.value=slots[i]||'';select.disabled=busy||!editable();
   select.addEventListener('change',()=>{if(busy||!editable())return;slots[i]=select.value||null;message.textContent='Cambios sin guardar';render();});
   label.appendChild(select);list.appendChild(label);
  }
 }
 function useDraft(){isDraft=true;version=data.borrador?.version||0;slots=[...(data.borrador?.slots||vacio())];render();}
 function clear(){generation++;ctx=null;data=null;slots=vacio();busy=false;version=0;list.replaceChildren();fixtures.replaceChildren();status.textContent='';message.textContent='';count.textContent='0 / 11 titulares';positions.textContent='';draft.hidden=true;save.disabled=true;root.hidden=true;}
 async function show(){
  clear();root.hidden=false;const c={...contexto()},g=generation;ctx=c;
  if(!c.token||!c.division){status.textContent='No hay equipo disponible.';return;}
  status.textContent='Consultando plantilla y calendario…';
  try{
   const result=await c.client.consultar('macroliga_estado_alineacion',{p_division_id:c.division},c.token);
   if(!valid(g,c))return;
   if(!result||!Array.isArray(result.plantilla)||!Array.isArray(result.partidos)||!Array.isArray(result.slots))throw Error('Respuesta incorrecta');
   data=result;
   if(data.jornada_id){isDraft=false;version=data.version;slots=[...(version?data.slots:data.borrador?.slots||data.slots)];render();}
   else useDraft();
   for(const f of data.partidos){
    const row=node('li',(f.local||'Local pendiente')+' – '+(f.visitante||'Visitante pendiente')+' · '+(f.inicio?fecha.format(new Date(f.inicio)):'Horario pendiente')+' · '+f.estado);fixtures.appendChild(row);
   }
   if(!data.partidos.length)fixtures.appendChild(node('li','Aún no hay partidos confirmados en MACROLIGA.'));
  }catch(e){if(valid(g,c))status.textContent='No se pudo consultar la alineación. Pulsa Actualizar jornada.';}
 }
 async function guardar(){
  if(!ctx||!data||busy||!editable()||!validarOnce(slots,data.plantilla))return;
  const c=ctx,g=generation,fresh=contexto();if(!valid(g,c))return;
  busy=true;render();message.textContent='Guardando…';
  try{
   const v=await c.client.operar('macroliga_guardar_alineacion',{p_division_id:c.division,p_jornada_id:isDraft?null:data.jornada_id,p_slots:slots,p_version:version},fresh.token);
   if(!valid(g,c))return;
   if(!Number.isInteger(v)||v<=version)throw Error('Versión no confirmada');
   version=v; if(isDraft)data.borrador={slots:[...slots],version:v};else{data.version=v;data.slots=[...slots];}
   message.textContent=isDraft?'Borrador guardado en tu equipo.':'Alineación guardada para la jornada '+data.numero+'.';
  }catch(e){if(valid(g,c))message.textContent=e.operationMessage||'No se ha confirmado el guardado. Actualiza la jornada antes de reintentar.';}
  finally{if(valid(g,c)){busy=false;render();}}
 }
 save.addEventListener('click',()=>void guardar());reload.addEventListener('click',()=>{if(!busy)void show();});draft.addEventListener('click',()=>{if(data&&!busy)useDraft();});
 return {show,clear};
}
