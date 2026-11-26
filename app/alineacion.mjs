const posiciones={GK:'POR',DEF:'DEF',MID:'MED',FWD:'DEL'};
const nombres={GK:'Portero',DEF:'Defensa',MID:'Centrocampista',FWD:'Delantero'};
const fecha=new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',dateStyle:'short',timeStyle:'short'});
const vacio=()=>Array(11).fill(null);
export const FORMACIONES=Object.freeze(['3-4-3','3-5-2','4-3-3','4-4-2','4-5-1','5-3-2','5-4-1']);
const porDefecto='4-4-2';
export function plazas(formacion){
 const [d,m,f]=formacion.split('-').map(Number);
 return ['GK',...Array(d).fill('DEF'),...Array(m).fill('MID'),...Array(f).fill('FWD')];
}
export function validarOnce(slots,plantilla,{completo=false}={}){
 if(!Array.isArray(slots)||slots.length!==11)return false;
 const ids=slots.filter(x=>x!==null);
 if(new Set(ids).size!==ids.length||completo&&ids.length!==11)return false;
 const jugadores=ids.map(id=>plantilla.find(p=>p.id===id&&p.activo));
 if(jugadores.some(p=>!p||!Object.hasOwn(posiciones,p.posicion)))return false;
 return FORMACIONES.some(f=>{
  const esquema=plazas(f);
  return Object.keys(posiciones).every(p=>jugadores.filter(j=>j.posicion===p).length<=esquema.filter(x=>x===p).length);
 });
}
export function colocarOnce(ids,plantilla,formacion){
 const esquema=plazas(formacion),slots=vacio(),sobrantes=[];
 // Conserva todas las selecciones; las que no encajan quedan visibles para resolver.
 for(const id of ids.filter(x=>x!==null)){
  const p=plantilla.find(p=>p.id===id&&p.activo);
  const i=p?esquema.findIndex((pos,j)=>pos===p.posicion&&slots[j]===null):-1;
  if(i<0||slots.includes(id))sobrantes.push(id);
  else slots[i]=id;
 }
 return {slots,sobrantes};
}
export function inferirFormacion(ids,plantilla){
 const preferidas=[porDefecto,...FORMACIONES.filter(f=>f!==porDefecto)];
 const score=f=>{
  const esquema=plazas(f),{sobrantes}=colocarOnce(ids,plantilla,f);
  const falta=Object.keys(posiciones).reduce((sum,p)=>sum+Math.max(0,esquema.filter(x=>x===p).length-plantilla.filter(x=>x.activo&&x.posicion===p).length),0);
  const coincide=ids.reduce((sum,id,i)=>sum+(id&&plantilla.some(p=>p.id===id&&p.posicion===esquema[i])?1:0),0);
  return sobrantes.length*1000+falta*20-coincide;
 };
 return preferidas.reduce((mejor,f)=>score(f)<score(mejor)?f:mejor,porDefecto);
}
export function crearPanelAlineacion(root,contexto){
 if(!root)return null;
 const doc=root.ownerDocument,el=id=>root.querySelector('#'+id);
 const status=el('lineup-status'),message=el('lineup-message'),count=el('lineup-count'),positions=el('lineup-positions');
 const list=el('lineup-slots'),fixtures=el('lineup-fixtures'),save=el('lineup-save'),draft=el('lineup-draft'),reload=el('lineup-reload');
 const form=el('lineup-formation'),help=el('lineup-validation'),extras=el('lineup-extras'),controls=el('lineup-controls');
 // Una copia antigua del HTML puede seguir abierta: app.js fuerza una actualización.
 if(!form||!help||!extras||!controls)return null;
 let generation=0,ctx=null,data=null,slots=vacio(),sobrantes=[],formacion=porDefecto,isDraft=true,busy=false,version=0;
 const valid=(g,c)=>g===generation&&contexto()?.identity===c?.identity&&contexto()?.division===c?.division&&!!contexto()?.token;
 const node=(tag,txt,cls)=>{const n=doc.createElement(tag);if(txt!=null)n.textContent=txt;if(cls)n.className=cls;return n;};
 const editable=()=>isDraft||data?.editable;
 const todos=()=>[...slots,...sobrantes].filter(Boolean);
 function cargar(ids){
  formacion=inferirFormacion(ids,data.plantilla);
  ({slots,sobrantes}=colocarOnce(ids,data.plantilla,formacion));
 }
 function listo(){return !sobrantes.length&&validarOnce(slots,data.plantilla,{completo:!isDraft});}
 function render(){
  list.replaceChildren();extras.replaceChildren();
  controls.hidden=false;
  const roster=data.plantilla||[],esquema=plazas(formacion);
  const total=slots.filter(Boolean).length;
  count.textContent=total+' / 11 titulares';
  positions.textContent=Object.entries(posiciones).map(([p,n])=>slots.filter((id,i)=>id&&esquema[i]===p).length+'/'+esquema.filter(x=>x===p).length+' '+n).join(' · ');
  status.textContent=isDraft?'Borrador personal: todavía no puntúa ni se aplica a una jornada.':
   'Jornada '+data.numero+(data.limite?' · Cierre '+fecha.format(new Date(data.limite)):' · Horario pendiente')+(data.editable?' · Abierta':' · Cerrada o no confirmada');
  draft.hidden=isDraft; save.textContent=isDraft?'Guardar borrador':'Guardar alineación';
  form.value=formacion;form.disabled=busy||!editable();
  save.disabled=busy||!editable()||!listo();
  help.textContent=sobrantes.length?'Revisa los jugadores fuera del esquema antes de guardar.':total===11?'Once completo · '+formacion:!editable()?'Alineación cerrada.':isDraft?'Toca cada plaza para elegir un jugador. Puedes guardar un borrador incompleto.':'Toca cada plaza para elegir un jugador. Faltan '+(11-total)+' para guardar el once.';
  for(const pos of ['FWD','MID','DEF','GK']){
   const row=node('div',null,'pitch-row');row.dataset.position=pos;
   for(let i=0;i<11;i++){
    if(esquema[i]!==pos)continue;
    const p=roster.find(p=>p.id===slots[i]);
    const label=node('label',null,'pitch-slot');label.dataset.filled=String(Boolean(p));
    const marker=node('span',p?posiciones[pos]:'+', 'pitch-marker');marker.setAttribute('aria-hidden','true');
    const name=node('span',p?p.nombre:nombres[pos],'pitch-name');name.setAttribute('aria-hidden','true');
    const select=node('select');select.dataset.position=pos;
    select.setAttribute('aria-label',nombres[pos]+' '+(esquema.slice(0,i+1).filter(x=>x===pos).length)+': '+(p?p.nombre:'sin jugador'));
    const empty=node('option','Sin jugador');empty.value='';select.appendChild(empty);
    for(const jugador of roster.filter(x=>x.activo&&x.posicion===pos)){
     const opt=node('option',[jugador.nombre,jugador.club].filter(Boolean).join(' · '));
     opt.value=jugador.id;opt.disabled=todos().includes(jugador.id)&&jugador.id!==slots[i];select.appendChild(opt);
    }
    select.value=slots[i]||'';select.disabled=busy||!editable();
    select.addEventListener('change',()=>{
     if(busy||!editable())return;
     slots[i]=select.value||null;message.textContent='Cambios sin guardar';render();
     list.querySelector('select[data-slot="'+i+'"]')?.focus({preventScroll:true});
    });
    select.dataset.slot=String(i);
    label.append(marker,name,select);row.appendChild(label);
   }
   list.appendChild(row);
  }
  extras.hidden=!sobrantes.length;
  if(sobrantes.length){
   extras.appendChild(node('strong','Jugadores fuera del esquema'));
   sobrantes.forEach((id,i)=>{
    const item=node('div',null,'lineup-extra');
    const p=roster.find(x=>x.id===id);
    item.appendChild(node('span',p?p.nombre+' · '+(posiciones[p.posicion]||'Sin posición'):'Jugador que ya no está en tu plantilla'));
    const quitar=node('button','Quitar');quitar.type='button';quitar.disabled=busy||!editable();
    quitar.addEventListener('click',()=>{if(busy||!editable())return;sobrantes.splice(i,1);message.textContent='Cambios sin guardar';render();});
    item.appendChild(quitar);extras.appendChild(item);
   });
  }
 }
 function useDraft(){isDraft=true;version=data.borrador?.version||0;cargar(data.borrador?.slots||vacio());message.textContent='';render();}
 function clear(){generation++;ctx=null;data=null;slots=vacio();sobrantes=[];formacion=porDefecto;busy=false;version=0;list.replaceChildren();extras.replaceChildren();extras.hidden=true;controls.hidden=true;fixtures.replaceChildren();status.textContent='';message.textContent='';count.textContent='0 / 11 titulares';positions.textContent='';help.textContent='';draft.hidden=true;save.disabled=true;root.hidden=true;}
 async function show(){
  clear();root.hidden=false;const c={...contexto()},g=generation;ctx=c;
  if(!c.token||!c.division){status.textContent='No hay equipo disponible.';return;}
  status.textContent='Consultando plantilla y calendario…';
  try{
   const result=await c.client.consultar('macroliga_estado_alineacion',{p_division_id:c.division},c.token);
   if(!valid(g,c))return;
   if(!result||!Array.isArray(result.plantilla)||!Array.isArray(result.partidos)||!Array.isArray(result.slots)||result.slots.length!==11)throw Error('Respuesta incorrecta');
   data=result;
   if(data.jornada_id){isDraft=false;version=data.version;cargar(version?data.slots:data.borrador?.slots||data.slots);render();}
   else useDraft();
   for(const f of data.partidos){
    const row=node('li',(f.local||'Local pendiente')+' – '+(f.visitante||'Visitante pendiente')+' · '+(f.inicio?fecha.format(new Date(f.inicio)):'Horario pendiente')+' · '+f.estado);fixtures.appendChild(row);
   }
   if(!data.partidos.length)fixtures.appendChild(node('li','Aún no hay partidos confirmados en MACROLIGA.'));
  }catch(e){if(valid(g,c))status.textContent='No se pudo consultar la alineación. Pulsa Actualizar jornada.';}
 }
 form.addEventListener('change',()=>{
  if(!data||busy||!editable()||!FORMACIONES.includes(form.value))return;
  const nuevo=colocarOnce(todos(),data.plantilla,form.value);
  formacion=form.value;({slots,sobrantes}=nuevo);
  message.textContent=sobrantes.length?'Sistema cambiado. Revisa los jugadores fuera del esquema; no se ha eliminado ninguno.':'Cambios sin guardar';
  render();
 });
 async function guardar(){
  if(!ctx||!data||busy||!editable()||!listo())return;
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
