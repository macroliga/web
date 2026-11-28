import { controlClausula } from './clausulas-equipo-malo.mjs?v=28';
// Mercado: lecturas y operaciones autenticadas; no se conservan datos al salir.
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
// Precio y puntos en columnas; las acciones se mantienen separadas.
export function crearFilaJugador(doc,r,{estado=''}={}){
  const n=(tag,cls,txt)=>{const e=doc.createElement(tag);e.className=cls;if(txt!=null)e.textContent=txt;return e;};
  const li=n('li','compact-player');
  const identity=n('div','compact-player-identity');
  identity.appendChild(n('strong','compact-player-name',r.nombre_jugador));
  identity.appendChild(n('span','compact-player-meta',[posiciones[r.posicion]||r.posicion,r.club,r.puntos_acumulados==null?'Sin puntos':r.puntos_acumulados+' pts',estado].filter(Boolean).join(' · ')));
  li.appendChild(identity);
  const amount=n('div','compact-player-price');
  amount.appendChild(n('span','compact-player-caption','VALOR'));
  amount.appendChild(n('strong','compact-player-value',euros(r.valor_mercado_centimos)));
  li.appendChild(amount);
  return li;
}
// Solo es una previsión: las pujas ganadoras tienen prioridad y el servidor decide.
export function candidatosEquipoMalo(rows){
  return rows.filter(r=>Number(r.dia_mercado)===2 && r.estado==='open' &&
    /^\d+$/.test(String(r.valor_mercado_centimos)) &&
    BigInt(r.valor_mercado_centimos)>0n && BigInt(r.valor_mercado_centimos)<75000000n).length;
}
export function crearPanelCatalogo(root,contexto,onChange=()=>{}){
  if(!root)return null;
  const doc=root.ownerDocument,el=id=>root.querySelector('#'+id);
  const list=el('catalog-list'),status=el('catalog-status'),search=el('catalog-search'),owner=el('catalog-owner'),club=el('catalog-club');
  const position=el('catalog-position'),minPoints=el('catalog-min-points'),maxPoints=el('catalog-max-points'),minValue=el('catalog-min-value'),maxValue=el('catalog-max-value'),sort=el('catalog-sort');
  const prev=el('catalog-prev'),next=el('catalog-next'),histList=el('history-list'),histStatus=el('history-status'),histMore=el('history-more');
  const marketView=el('market-current-view'),marketTab=el('market-current-tab'),marketList=el('market-current-list'),marketStatus=el('market-current-status');
  const playersView=el('market-players-view'),historyView=el('market-history-view'),playersTab=el('market-players-tab'),historyTab=el('market-history-tab');
  const salesView=el('market-sales-view'),salesTab=el('market-sales-tab'),salesStatus=el('market-sales-status'),salesControls=el('market-sales-controls'),salesList=el('market-sales-list'),offersList=el('market-offers-list'),actionStatus=el('market-action-status');
  let operations=null, marketRows=[],busy=false, tabActual='market',jugadorVenta=null;
  const formatDate=new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',dateStyle:'short',timeStyle:'short'});
  const node=(tag,txt)=>{const n=doc.createElement(tag);if(txt!=null)n.textContent=txt;return n;};
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
    const isBad=owner.value==='bad_team';
    const heading=el('catalog-heading'), description=el('catalog-description');
    if(heading)heading.textContent=isBad?'Equipo Malo':'Todos los jugadores';
    if(description)description.textContent=isBad?'Paga la cláusula de un jugador para ficharlo. Las compras automáticas se publican a las 06:00: jugadores sin puja ganadora tras su segundo día y valor inferior a 750.000 €.':'Busca, filtra y compara jugadores de tu división.';
    list.replaceChildren();prev.disabled=true;next.disabled=true;
    if(!loaded)return;
    let filtered;
    try{filtered=filtrarCatalogo(rows,{search:search.value,owner:owner.value,club:club.value,position:position.value,minPoints:minPoints.value,maxPoints:maxPoints.value,minValue:minValue.value,maxValue:maxValue.value,sort:sort.value});}
    catch(e){status.textContent=e.message;return;}
    page=Math.min(page,Math.max(0,Math.ceil(filtered.length/PAGE)-1));
    const start=page*PAGE,end=Math.min(start+PAGE,filtered.length);
    status.textContent=isBad&&!rows.some(r=>r.propietario_tipo==='bad_team')?'El Equipo Malo aún no tiene jugadores. Las compras nocturnas confirmadas aparecerán aquí.':filtered.length+' de '+rows.length+' jugadores'+(filtered.length?' · '+(start+1)+'–'+end:rows.length?' · Sin coincidencias':' · Catálogo aún sin cargar');
    for(const r of filtered.slice(start,end)){
      const li=crearFilaJugador(doc,r);
      const ownership=node('span',[r.propietario_equipo,r.propietario_manager,r.activo?(r.en_mercado?'En mercado':''):'Baja de LaLiga · valor congelado'].filter(Boolean).join(' · '));
      ownership.className='compact-player-owner';
      li.appendChild(ownership);
      const c=ctx,g=generation;
      const clause=controlClausula(doc,r,{euros,
        vigente:()=>Boolean(c&&valid(g,c)&&li.isConnected),
        cotizar:()=>call(c,'macroliga_cotizar_clausula_equipo_malo',{p_jugador_id:r.jugador_id}),
        pagar:(importe,clave)=>pagarClausula(c,g,r.jugador_id,importe,clave)});
      if(clause)li.appendChild(clause);
      list.appendChild(li);
    }
    prev.disabled=page===0;next.disabled=end>=filtered.length;
  }
  async function pagarClausula(c,g,jugador,importe,clave){
    if(busy||!valid(g,c))throw Error('Sesión o mercado no disponible');
    busy=true;
    try{
      const result=await c.client.operar('macroliga_pagar_clausula_equipo_malo',
        {p_division_id:c.division,p_jugador_id:jugador,p_importe_centimos:importe,p_clave:clave},contexto().token);
      if(!result)throw Error('Operación no confirmada');
      if(!valid(g,c))return;
      onChange();historyLoaded=false;history=[];historyDone=false;
      actionMessage('Fichaje por cláusula confirmado.');
    }catch(e){
      if(valid(g,c))actionMessage(e.operationMessage||'No se pudo confirmar la cláusula. Se actualizará el catálogo.');
      throw e;
    }finally{
      if(valid(g,c)){
        try{const next=await cargarCatalogo((name,args)=>call(c,name,args),()=>valid(g,c));if(next&&valid(g,c)){rows=next;render();}}
        catch{if(valid(g,c)){loaded=false;list.replaceChildren();status.textContent='Actualiza el catálogo para comprobar el fichaje.';}}
        finally{if(valid(g,c)){busy=false;void loadMarket(c,g);}}
      }
    }
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
  function actionMessage(text){if(actionStatus)actionStatus.textContent=text;if(salesStatus&&tabActual==='sales')salesStatus.textContent=text;}
  async function operate(name,args){
    const c=ctx,g=generation,fresh=contexto();
    if(!c||busy||!valid(g,c))return;
    busy=true;renderMarket();renderSales();actionMessage('Enviando operación…');
    try{
      const result=await c.client.operar(name,args,fresh.token);
      if(!valid(g,c))return;
      if(!result)throw Error('Operación no confirmada');
      onChange();historyLoaded=false;history=[];historyDone=false;
      await loadMarket(c,g);
      if(valid(g,c)){busy=false;renderMarket();renderSales();actionMessage('Operación confirmada.');}
    }catch(e){if(valid(g,c)){await loadMarket(c,g);if(valid(g,c)){busy=false;renderMarket();renderSales();actionMessage(e.operationMessage||'No se pudo confirmar la operación. Comprueba el estado actualizado.');}}}
    finally{if(valid(g,c))busy=false;}
  }
  function button(text,enabled,fn){
    const b=node('button',text);b.type='button';b.disabled=busy||!enabled;b.addEventListener('click',()=>{if(!b.disabled)fn();});return b;
  }
  function priceControl(parent,text,min,enabled,fn){
    const wrap=node('div');wrap.className='market-operation';const label=node('label','Importe en euros · mínimo '+euros(min));
    const input=node('input');input.type='text';input.inputMode='decimal';input.placeholder='Ej. 2500000';input.disabled=busy||!enabled;
    const n=BigInt(min);input.value=(n/100n).toString()+(n%100n?','+(n%100n).toString().padStart(2,'0'):'');
    label.appendChild(input);wrap.appendChild(label);wrap.appendChild(button(text,enabled,()=>{
      try{const amount=limiteValor(input.value);if(amount===null||amount<BigInt(min))throw Error('El importe debe alcanzar el mínimo');fn(amount.toString());}
      catch(e){actionMessage(e.message);}
    }));parent.appendChild(wrap);
  }
  function renderMarket(){
    marketList.replaceChildren();
    const result=marketRows;
    const schedule=el('bad-team-next');
    if(schedule)schedule.textContent='';
    if(!result.length)return;
    const state=result[0].estado;
    const counts=Object.keys(posiciones).map(p=>result.filter(r=>r.posicion===p).length);
    const enabled=operations?.pujas_abiertas===true&&state==='open';
    marketStatus.textContent=(state==='preview'?'Vista previa · sin pujas':enabled?'Mercado abierto':state==='draft'?'Mercado preparado · no abierto':'Mercado no disponible para pujas')+' · '+result.length+' jugadores · '+counts.map((n,i)=>n+' '+['POR','DEF','MED','DEL'][i]).join(' · ')+(operations?.abre&&!enabled?' · Apertura prevista '+formatDate.format(new Date(operations.abre)):'')+(enabled&&operations?.cierra?' · Cierre '+formatDate.format(new Date(operations.cierra)):'');
    if(schedule&&state==='open'){
      const num=candidatosEquipoMalo(result);
      schedule.textContent=num ? 'Equipo Malo · '+num+' '+(num===1?'candidato':'candidatos')+' para las 06:00 (si no hay puja ganadora).' : 'Equipo Malo · sin candidatos de segundo día por debajo de 750.000 €.';
    }
    for(const r of result){
      const li=crearFilaJugador(doc,r,{estado:state==='open'?'Día '+r.dia_mercado:''});
      const lot=operations?.lotes?.find(x=>x.jugador_id===r.jugador_id);
      if(lot){
        if(lot.puja_id){
          const actions=node('div');actions.className='compact-player-actions';
          actions.appendChild(node('span','Mi puja: '+euros(lot.importe)));
          actions.appendChild(button('Retirar puja',enabled,()=>void operate('macroliga_retirar_puja',{p_puja_id:lot.puja_id})));li.appendChild(actions);
        }else if(enabled){
          const details=node('details');details.className='compact-bid';
          details.appendChild(node('summary','Pujar · desde '+euros(lot.minimo)));
          priceControl(details,'Confirmar puja',lot.minimo,true,amount=>void operate('macroliga_presentar_puja',{p_lote_id:lot.lote_id,p_importe_centimos:amount}));
          li.appendChild(details);
        }
      }
      marketList.appendChild(li);
    }
  }
  function renderSales(){
    if(!salesControls)return;
    salesControls.replaceChildren();salesList.replaceChildren();offersList.replaceChildren();
    if(!operations){salesStatus.textContent='Operaciones todavía no disponibles.';return;}
    const enabled=operations.ventas_abiertas===true;
    if(!busy)salesStatus.textContent=enabled?'Ventas abiertas. Las ofertas no reservan saldo; se valida de nuevo al aceptar.':'Ventas preparadas · todavía no habilitadas por el servidor.';
    const op=(p_accion,p_objeto,p_importe_centimos=null)=>void operate('macroliga_operar_venta',{p_division_id:ctx.division,p_accion,p_objeto,p_importe_centimos});
    const select=node('select');select.disabled=busy||!enabled;
    const listable=operations.plantilla||[];
    for(const p of listable){select.appendChild(option(p.id,p.nombre+' · mín. '+euros(p.minimo)));}
    if(jugadorVenta&&listable.some(p=>p.id===jugadorVenta))select.value=jugadorVenta;
    const label=node('label','Poner un jugador de mi plantilla en venta');label.appendChild(select);salesControls.appendChild(label);
    const price=node('div');salesControls.appendChild(price);
    const showPrice=()=>{price.replaceChildren();const p=listable.find(x=>x.id===select.value)||listable[0];if(p)priceControl(price,'Poner en venta',p.minimo,enabled,amount=>op('listar',p.id,amount));};
    select.addEventListener('change',()=>{jugadorVenta=select.value;showPrice();});showPrice();
    for(const s of operations.anuncios||[]){
      const li=node('li');li.appendChild(node('strong',s.jugador));li.appendChild(node('span',s.vendedor+' · '+posiciones[s.posicion]+' · '+euros(s.precio??s.minimo)));
      if(s.propia)li.appendChild(button('Retirar anuncio',true,()=>op('cancelar',s.id)));
      else if(s.minimo!=null&&!(operations.ofertas||[]).some(o=>o.enviada&&o.anuncio===s.id))priceControl(li,'Enviar oferta',s.minimo,enabled,amount=>op('ofertar',s.id,amount));
      salesList.appendChild(li);
    }
    for(const o of operations.ofertas||[]){
      const li=node('li');li.appendChild(node('strong',o.jugador+' · '+euros(o.importe)));
      li.appendChild(node('span',o.enviada?'Enviada por mí':'Recibida de '+o.comprador));
      li.appendChild(button(o.enviada?'Retirar oferta':'Aceptar venta',o.enviada||enabled,()=>op(o.enviada?'retirar':'aceptar',o.id)));offersList.appendChild(li);
    }
    if(!salesList.children.length)salesList.appendChild(node('li','Todavía no hay jugadores en venta.'));
    if(!offersList.children.length)offersList.appendChild(node('li','Todavía no tienes ofertas pendientes.'));
  }
  async function loadMarket(c,g){
    marketStatus.textContent='Consultando mercado…';
    try{
      const result=await call(c,'macroliga_mercado_visible',{});
      if(!valid(g,c))return;
      if(!Array.isArray(result)||result.length>15||new Set(result.map(r=>r.jugador_id)).size!==result.length)throw Error('Respuesta inválida');
      if(result.length){
        const state=result[0].estado;
        if(!['preview','draft','open'].includes(state)||result.some(r=>r.estado!==state))throw Error('Estado incoherente');
        const counts=Object.keys(posiciones).map(p=>result.filter(r=>r.posicion===p).length);
        if((state==='preview'||state==='draft')&&(result.length!==15||counts.some(n=>n===0)))throw Error('Mercado incompleto');
      }
      marketRows=result;operations=null;
      if(!result.length)marketStatus.textContent='Todavía no hay mercado preparado ni abierto.';
      renderMarket();
      // Los importes ajenos nunca llegan al navegador. Si la pasarela falla,
      // el catálogo sigue disponible, pero las acciones permanecen bloqueadas.
      if(!salesView)return;
      const o=await call(c,'macroliga_operaciones_mercado',{});
      if(!valid(g,c))return;
      if(!o||!Array.isArray(o.lotes)||!Array.isArray(o.plantilla)||!Array.isArray(o.ofertas)||!Array.isArray(o.anuncios))throw Error('Respuesta inválida');
      operations=o;renderMarket();renderSales();
    }catch(err){if(valid(g,c)){operations=null;renderMarket();renderSales();if(!marketRows.length)marketStatus.textContent='No se pudo consultar el mercado.';actionMessage('No se han podido consultar las operaciones; no se permiten nuevas pujas.');}}
  }
  function tab(name){
    tabActual=name;
    const h=name==='history',m=name==='market',p=name==='players',s=name==='sales';
    marketView.hidden=!m;playersView.hidden=!p;historyView.hidden=!h;if(salesView)salesView.hidden=!s;
    marketTab.setAttribute('aria-pressed',String(m));playersTab.setAttribute('aria-pressed',String(p));historyTab.setAttribute('aria-pressed',String(h));salesTab?.setAttribute('aria-pressed',String(s));
    if(h&&!historyLoaded)void loadHistory();
  }
  function clear(){
    generation++;jugadorVenta=null;operations=null;marketRows=[];busy=false;if(actionStatus)actionStatus.textContent='';if(salesStatus)salesStatus.textContent='';salesControls?.replaceChildren();salesList?.replaceChildren();offersList?.replaceChildren();rows=[];loaded=false;page=0;history=[];historyLoaded=false;historyBusy=false;historyDone=false;ctx=null;
    list.replaceChildren();histList.replaceChildren();marketList.replaceChildren();marketStatus.textContent='';status.textContent='';histStatus.textContent='';histMore.hidden=true;prev.disabled=true;next.disabled=true;
    for(const input of [search,position,minPoints,maxPoints,minValue,maxValue])input.value='';
    selectors();sort.value='name';render();tab('market');root.hidden=true;
  }
  async function show(initialTab='market',jugador=null){
    clear();jugadorVenta=jugador;root.hidden=false;const isBad=initialTab==='bad';if(isBad){owner.value='bad_team';render();}tab(isBad?'players':initialTab);const c={...contexto()},g=generation;ctx=c;
    if(!c.division||!c.token){status.textContent='Catálogo no disponible.';return;}
    status.textContent='Consultando jugadores…';
    void loadMarket(c,g);
    try{
      const result=await cargarCatalogo((name,args)=>call(c,name,args),()=>valid(g,c));
      if(!valid(g,c)||result===null)return;
      rows=result;loaded=true;selectors();if(isBad)owner.value='bad_team';render();
    }catch(err){if(valid(g,c))status.textContent='No se pudo consultar el catálogo completo. No has cerrado sesión.';}
  }
  const changed=()=>{page=0;render();};
  for(const field of [search,minPoints,maxPoints,minValue,maxValue])field.addEventListener('input',changed);
  for(const field of [owner,club,position,sort])field.addEventListener('change',changed);
  prev.addEventListener('click',()=>{page=Math.max(0,page-1);render();});
  next.addEventListener('click',()=>{page++;render();});
  marketTab.addEventListener('click',()=>tab('market'));
  playersTab.addEventListener('click',()=>tab('players'));historyTab.addEventListener('click',()=>tab('history'));
  salesTab?.addEventListener('click',()=>tab('sales'));
  histMore.addEventListener('click',()=>void loadHistory());
  el('catalog-reset').addEventListener('click',()=>{for(const x of [search,club,position,minPoints,maxPoints,minValue,maxValue])x.value='';owner.value='all';sort.value='name';changed();});
  return {show,clear};
}
