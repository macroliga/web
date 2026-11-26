// Consultas exclusivamente de lectura, sin conservar datos al salir.
const normalizar=value=>String(value??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('es');
const posiciones={GK:'Portero',DEF:'Defensa',MID:'Centrocampista',FWD:'Delantero'};
const tipos={market:'Mercado',manager_sale:'Entre managers',computer_sale:'Venta a Computer',bad_team_sale:'Equipo Malo',clause:'Cláusula',bad_team_clause:'Cláusula Equipo Malo',admin_correction:'Ajuste administrativo'};
const dinero=new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:2});
const PAGE=40,SERVER_PAGE=250,HISTORY_PAGE=50;
const cents=v=>BigInt(v);
function euros(value){
  const n=cents(value),whole=n/100n,fraction=n%100n;
  if(fraction===0n)return dinero.format(whole);
  return new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).formatToParts(whole).map(p=>p.type==='fraction'?fraction.toString().padStart(2,'0'):p.value).join('');
}
function limiteValor(v){
  const s=String(v??'').trim().replace(',','.');
  if(!s)return null;
  if(!/^\d{1,16}(\.\d{1,2})?$/.test(s))throw Error('Introduce valores en euros, sin separador de miles.');
  const [a,b='']=s.split('.');return BigInt(a)*100n+BigInt(b.padEnd(2,'0'));
}
function limitePuntos(v){
  if(String(v??'').trim()==='')return null;
  const n=Number(v);if(!Number.isSafeInteger(n))throw Error('Introduce puntos enteros.');
  return n;
}
export function filtrarCatalogo(rows,filters={}){
  const {search='',owner='all',club='',position='',minPoints='',maxPoints='',minValue='',maxValue='',sort='name'}=filters;
  const term=normalizar(search).trim(),pmin=limitePuntos(minPoints),pmax=limitePuntos(maxPoints),vmin=limiteValor(minValue),vmax=limiteValor(maxValue);
  if((pmin!==null&&pmax!==null&&pmin>pmax)||(vmin!==null&&vmax!==null&&vmin>vmax))throw Error('El mínimo no puede superar el máximo.');
  const byName=(a,b)=>a.nombre_jugador.localeCompare(b.nombre_jugador,'es',{sensitivity:'base'})||String(a.jugador_id??'').localeCompare(String(b.jugador_id??''));
  return rows.filter(r=>{
    const ownerMatch=owner==='all'||r.propietario_tipo===owner||('team:'+r.propietario_equipo_id===owner&&r.propietario_tipo==='team');
    const points=r.puntos_acumulados,value=cents(r.valor_mercado_centimos);
    return ownerMatch&&(!club||r.club===club)&&(!position||r.posicion===position)&&
      (!term||normalizar([r.nombre_jugador,r.club,r.propietario_equipo,r.propietario_manager,posiciones[r.posicion]].join(' ')).includes(term))&&
      (pmin===null||(points!=null&&points>=pmin))&&(pmax===null||(points!=null&&points<=pmax))&&
      (vmin===null||value>=vmin)&&(vmax===null||value<=vmax);
  }).sort((a,b)=>{
    if(sort==='points-desc'||sort==='points-asc'){
      if(a.puntos_acumulados==null||b.puntos_acumulados==null)return a.puntos_acumulados==null?(b.puntos_acumulados==null?byName(a,b):1):-1;
      const diff=(a.puntos_acumulados-b.puntos_acumulados)*(sort==='points-desc'?-1:1);
      return diff||byName(a,b);
    }
    if(sort==='value-desc'||sort==='value-asc'){
      const av=cents(a.valor_mercado_centimos),bv=cents(b.valor_mercado_centimos),diff=av===bv?0:av<bv?-1:1;
      return (sort==='value-desc'?-diff:diff)||byName(a,b);
    }
    return byName(a,b);
  });
}
export async function cargarCatalogo(call,valid=()=>true){
  const all=[],ids=new Set();let after=null;
  // Cada página de API es menor que el límite de PostgREST. No mostrar una
  // selección incompleta como si fueran todos los jugadores.
  for(let i=0;i<=80;i++){
    if(!valid())return null;
    const page=await call('macroliga_catalogo_division',{p_despues:after,p_limite:SERVER_PAGE});
    if(!valid())return null;
    if(!Array.isArray(page)||page.length>SERVER_PAGE)throw Error('Respuesta de catálogo inválida');
    for(const r of page){
      if(!r.jugador_id||ids.has(r.jugador_id)||(after&&r.jugador_id<=after))throw Error('Paginación de catálogo inválida');
      ids.add(r.jugador_id);all.push(r);after=r.jugador_id;
    }
    if(page.length<SERVER_PAGE)return all;
  }
  throw Error('Catálogo demasiado grande; no se presenta un resultado parcial');
}
export function crearPanelCatalogo(root,contexto){
  if(!root)return null;
  const doc=root.ownerDocument,el=id=>root.querySelector('#'+id);
  const list=el('catalog-list'),status=el('catalog-status'),search=el('catalog-search'),owner=el('catalog-owner'),club=el('catalog-club');
  const position=el('catalog-position'),minPoints=el('catalog-min-points'),maxPoints=el('catalog-max-points'),minValue=el('catalog-min-value'),maxValue=el('catalog-max-value'),sort=el('catalog-sort');
  const prev=el('catalog-prev'),next=el('catalog-next'),histList=el('history-list'),histStatus=el('history-status'),histMore=el('history-more');
  const playersView=el('market-players-view'),historyView=el('market-history-view'),playersTab=el('market-players-tab'),historyTab=el('market-history-tab');
  let generation=0,rows=[],loaded=false,page=0,history=[],historyLoaded=false,historyBusy=false,historyDone=false,ctx=null;
  const valid=(g,c)=>g===generation&&contexto()?.division===c?.division&&contexto()?.identity===c?.identity&&Boolean(contexto()?.token);
  const call=(c,name,params)=>{
    const fresh=contexto();
    if(fresh?.division!==c.division||fresh?.identity!==c.identity||!fresh?.token)throw Error('Sesión no disponible');
    return c.client.consultar(name,{p_division_id:c.division,...params},fresh.token);
  };
  const option=(value,label)=>{const o=doc.createElement('option');o.value=value;o.textContent=label;return o;};
  function selectors(){
    club.replaceChildren(option('','Todos los clubes'));
    for(const name of [...new Set(rows.map(r=>r.club).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')))club.appendChild(option(name,name));
    const teams=new Map();
    for(const r of rows)if(r.propietario_tipo==='team'&&r.propietario_equipo_id)teams.set(r.propietario_equipo_id,(r.propietario_manager?r.propietario_manager+' · ':'')+r.propietario_equipo);
    owner.replaceChildren(option('all','Todos'),option('computer','Computer'),option('bad_team','Equipo Malo'),option('team','Todos los managers'));
    for(const [id,name] of [...teams].sort((a,b)=>a[1].localeCompare(b[1],'es')))owner.appendChild(option('team:'+id,name));
    club.value='';owner.value='all';
  }
  function render(){
    list.replaceChildren();prev.disabled=true;next.disabled=true;
    if(!loaded)return;
    let filtered;
    try{filtered=filtrarCatalogo(rows,{search:search.value,owner:owner.value,club:club.value,position:position.value,minPoints:minPoints.value,maxPoints:maxPoints.value,minValue:minValue.value,maxValue:maxValue.value,sort:sort.value});}
    catch(e){status.textContent=e.message;return;}
    page=Math.min(page,Math.max(0,Math.ceil(filtered.length/PAGE)-1));
    const start=page*PAGE,end=Math.min(start+PAGE,filtered.length);
    status.textContent=filtered.length+' de '+rows.length+' jugadores'+(filtered.length?' · '+(start+1)+'–'+end:rows.length?' · Sin coincidencias':' · Catálogo aún sin cargar');
    for(const r of filtered.slice(start,end)){
      const li=doc.createElement('li'),name=doc.createElement('strong'),info=doc.createElement('span'),ownership=doc.createElement('span');
      name.textContent=r.nombre_jugador;
      info.textContent=[posiciones[r.posicion]||r.posicion,r.club,euros(r.valor_mercado_centimos),r.puntos_acumulados==null?'Sin puntos registrados':r.puntos_acumulados+' pts'].filter(Boolean).join(' · ');
      ownership.textContent=[r.propietario_equipo,r.propietario_manager,r.activo?(r.en_mercado?'En mercado':''):'Baja de LaLiga · valor congelado'].filter(Boolean).join(' · ');
      li.appendChild(name);li.appendChild(info);li.appendChild(ownership);list.appendChild(li);
    }
    prev.disabled=page===0;next.disabled=end>=filtered.length;
  }
  function renderHistory(){
    histList.replaceChildren();
    const fmt=new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',dateStyle:'short',timeStyle:'short'});
    for(const r of history){
      const li=doc.createElement('li'),name=doc.createElement('strong'),info=doc.createElement('span'),date=doc.createElement('span');
      name.textContent=r.nombre_jugador+' · '+euros(r.importe_centimos);
      info.textContent=r.origen+' → '+r.destino;
      date.textContent=fmt.format(new Date(r.fecha))+' · '+(tipos[r.tipo]||r.tipo);
      li.appendChild(name);li.appendChild(info);li.appendChild(date);histList.appendChild(li);
    }
    histStatus.textContent=history.length?history.length+' traspasos cargados'+(historyDone?' · Historial completo':''):'Todavía no hay traspasos confirmados.';
    histMore.hidden=historyDone;histMore.disabled=historyBusy;
  }
  async function loadHistory(){
    if(historyBusy||historyDone||!ctx)return;
    const c=ctx,g=generation;historyBusy=true;histMore.disabled=true;histStatus.textContent='Consultando traspasos…';
    try{
      const last=history.at(-1);
      const records=await call(c,'macroliga_historial_traspasos',{p_antes_fecha:last?.fecha??null,p_antes_id:last?.traspaso_id??null,p_limite:HISTORY_PAGE});
      if(!valid(g,c))return;
      if(!Array.isArray(records)||records.length>HISTORY_PAGE)throw Error('Respuesta inválida');
      const ids=new Set(history.map(r=>r.traspaso_id));
      for(const r of records){if(!r.traspaso_id||ids.has(r.traspaso_id))throw Error('Página repetida');ids.add(r.traspaso_id);}
      history.push(...records);historyLoaded=true;historyDone=records.length<HISTORY_PAGE;renderHistory();
    }catch(err){if(valid(g,c)){histStatus.textContent='No se pudo consultar el historial. Puedes reintentar.';histMore.hidden=false;}}
    finally{if(valid(g,c)){historyBusy=false;histMore.disabled=false;}}
  }
  function tab(name){
    const h=name==='history';
    playersView.hidden=h;historyView.hidden=!h;
    playersTab.setAttribute('aria-pressed',String(!h));historyTab.setAttribute('aria-pressed',String(h));
    if(h&&!historyLoaded)void loadHistory();
  }
  function clear(){
    generation++;rows=[];loaded=false;page=0;history=[];historyLoaded=false;historyBusy=false;historyDone=false;ctx=null;
    list.replaceChildren();histList.replaceChildren();status.textContent='';histStatus.textContent='';histMore.hidden=true;prev.disabled=true;next.disabled=true;
    for(const input of [search,position,minPoints,maxPoints,minValue,maxValue])input.value='';
    selectors();sort.value='name';tab('players');root.hidden=true;
  }
  async function show(){
    clear();root.hidden=false;const c={...contexto()},g=generation;ctx=c;
    if(!c.division||!c.token){status.textContent='Catálogo no disponible.';return;}
    status.textContent='Consultando jugadores…';
    try{
      const result=await cargarCatalogo((name,args)=>call(c,name,args),()=>valid(g,c));
      if(!valid(g,c)||result===null)return;
      rows=result;loaded=true;selectors();render();
    }catch(err){if(valid(g,c))status.textContent='No se pudo consultar el catálogo completo. No has cerrado sesión.';}
  }
  const changed=()=>{page=0;render();};
  for(const field of [search,minPoints,maxPoints,minValue,maxValue])field.addEventListener('input',changed);
  for(const field of [owner,club,position,sort])field.addEventListener('change',changed);
  prev.addEventListener('click',()=>{page=Math.max(0,page-1);render();});
  next.addEventListener('click',()=>{page++;render();});
  playersTab.addEventListener('click',()=>tab('players'));historyTab.addEventListener('click',()=>tab('history'));
  histMore.addEventListener('click',()=>void loadHistory());
  el('catalog-reset').addEventListener('click',()=>{for(const x of [search,club,position,minPoints,maxPoints,minValue,maxValue])x.value='';owner.value='all';sort.value='name';changed();});
  return {show,clear};
}
