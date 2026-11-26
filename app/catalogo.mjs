// Catálogo de solo lectura. No abre mercados ni conserva datos al salir.
import { euros } from './logic.mjs?v=10';
const normalizar = value => String(value??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('es');
const posiciones={GK:'Portero',DEF:'Defensa',MID:'Centrocampista',FWD:'Delantero'};
export function filtrarCatalogo(rows,search='',owner='all'){
  const term=normalizar(search).trim();
  return rows.filter(r=>(owner==='all'||r.propietario_tipo===owner)&&
    (!term||normalizar([r.nombre_jugador,r.club,r.propietario_equipo,posiciones[r.posicion]].join(' ')).includes(term)));
}
export function crearPanelCatalogo(root,contexto){
  if(!root)return null;
  const doc=root.ownerDocument, el=id=>root.querySelector('#'+id);
  const search=el('catalog-search'),owner=el('catalog-owner'),list=el('catalog-list'),status=el('catalog-status');
  let generation=0,rows=[],loaded=false;
  function render(){
    list.replaceChildren();
    if(!loaded)return;
    const filtered=filtrarCatalogo(rows,search.value,owner.value);
    status.textContent=filtered.length+' de '+rows.length+' jugadores'+(rows.length>=1000?' · El servidor puede haber limitado la consulta':'')+(rows.length===0?' · Catálogo aún sin cargar':'');
    for(const r of filtered){
      const li=doc.createElement('li'),name=doc.createElement('strong'),info=doc.createElement('span');
      name.textContent=r.nombre_jugador;
      info.textContent=[posiciones[r.posicion]||r.posicion,r.club,euros(r.valor_mercado_centimos),r.propietario_equipo,r.activo?(r.en_mercado?'En mercado':''):'Baja de LaLiga'].filter(Boolean).join(' · ');
      li.appendChild(name);li.appendChild(info);list.appendChild(li);
    }
  }
  function clear(){
    generation++;rows=[];loaded=false;list.replaceChildren();status.textContent='';
    search.value='';owner.value='all';root.hidden=true;
  }
  async function show(){
    clear();root.hidden=false;const c={...contexto()},g=generation;
    const current=()=>g===generation&&contexto()?.division===c.division&&contexto()?.identity===c.identity&&Boolean(contexto()?.token);
    if(!c?.division||!c?.token){status.textContent='Catálogo no disponible.';return;}
    status.textContent='Consultando jugadores…';
    try{
      const result=await c.client.consultar('macroliga_catalogo_division',{p_division_id:c.division},c.token);
      if(!current())return;
      if(!Array.isArray(result))throw Error('Respuesta inválida');
      rows=result;loaded=true;render();
    }catch(err){if(current())status.textContent='No se pudo consultar el catálogo. No has cerrado sesión.';}
  }
  search.addEventListener('input',render);owner.addEventListener('change',render);
  return {show,clear};
}
