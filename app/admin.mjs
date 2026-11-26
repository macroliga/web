// Administración de arranque: el servidor decide y valida todas las asignaciones.
// Ningún PIN, secreto o lista de usuarios se guarda aquí.
const money = cents => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(cents)/100);
const positions = {GK:'Porteros',DEF:'Defensas',MID:'Centrocampistas',FWD:'Delanteros'};
export function configReparto(input,maxRoster=16) {
  const wealth=Number(input.wealth),cash=Number(input.cash);
  if(input.wealth===''||input.cash==='')throw Error('Completa patrimonio y caja mínima.');
  if(!Number.isSafeInteger(wealth)||wealth<1||wealth>10000||!Number.isSafeInteger(cash)||cash<0||cash>wealth) throw Error('Revisa el patrimonio y la caja mínima (millones de euros).');
  const slots=Object.fromEntries(Object.keys(positions).map(p=>[p,Number(input.slots[p])]));
  if(Object.values(slots).some(n=>!Number.isSafeInteger(n)||n<1)||Object.values(slots).reduce((a,b)=>a+b,0)<11||Object.values(slots).reduce((a,b)=>a+b,0)>=maxRoster) throw Error('Reparte al menos 11 jugadores, con todas las posiciones y una plaza libre.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw Error('Selecciona la fecha del primer mercado.');
  return {p_wealth:String(wealth*100000000),p_min_cash:String(cash*100000000),p_slots:slots,p_market_date:input.date,p_seed:input.seed};
}
export function crearPanelAdmin(root,contexto,onChange=()=>{}) {
  if(!root) return null;
  const doc=root.ownerDocument;
  const el=id=>root.querySelector('#'+id);
  const message=el('admin-message'),form=el('admin-form'),preview=el('admin-preview'),importForm=el('admin-import-form');
  let generation=0,plan=null,state=null,busy=false,combinedRequest=null;
  const visible=(g,c)=>generation===g && contexto()?.division===c.division && contexto()?.identity===c.identity;
  const call=(name,params)=>{const c=contexto();if(!c?.token||!c?.division)throw Error('Acceso no disponible');return c.client.administrar(name,{p_division:c.division,...params},c.token);};
  const say=t=>{message.textContent=t;};
  function clearPlan(){plan=null;preview.hidden=true;el('admin-confirm').checked=false;el('admin-team-list').replaceChildren();el('admin-market-list').replaceChildren();}
  function clear(){generation++;locks(false);state=null;combinedRequest=null;el('admin-combined-confirm').checked=false;clearPlan();el('admin-state').textContent='';el('admin-summary').textContent='';form.hidden=true;importForm.hidden=true;root.hidden=true;say('');el('admin-file').value='';el('admin-source-confirm').checked=false;}
  function locks(value){busy=value;for(const control of root.querySelectorAll('button,input')) control.disabled=value;}
  function showState(s){
    if(!el('admin-date').value){
      const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
      const get=type=>Number(parts.find(part=>part.type===type).value);
      el('admin-date').value=new Date(Date.UTC(get('year'),get('month')-1,get('day')+1)).toISOString().slice(0,10);
    }
    state=s;el('admin-state').textContent=s.teamCount+' equipos · '+s.catalogCount+' futbolistas · '+money(s.wealthCents)+' por equipo';
    importForm.hidden=s.catalogReady||s.initialized||s.catalogCount!==0;
    form.hidden=s.initialized||s.marketPrepared||s.teamCount!==16||s.seasonStatus!=='draft'||(!s.catalogReady&&s.catalogCount!==0);
    el('admin-combined-section').hidden=s.catalogReady||form.hidden;
    el('admin-form-submit').textContent=s.catalogReady?'Simular reparto':'Cargar, repartir y preparar mercado';
    el('admin-wealth').value=String(Number(s.wealthCents)/100000000);
    if(s.initialized) say('Reparto realizado. Primer mercado preparado; no se abre desde este panel.');
    else if(!s.catalogReady&&!form.hidden) say('Selecciona el lote autorizado y configura los 16 equipos. Puedes cargar solo el catálogo o aplicar el arranque completo.');
    else if(!form.hidden) say('Configura y simula el reparto antes de confirmarlo.');
    else say('La división no reúne las condiciones de arranque.');
  }
  async function show(){
    clear();root.hidden=false;const c=contexto();const g=generation;
    if(!c?.division){say('Acceso de administración no disponible.');return;}
    say('Comprobando acceso…');
    try {const s=await call('macroliga_admin_arranque_estado',{});if(visible(g,c))showState(s);}
    catch(e){if(visible(g,c))say(e.status===403||e.code==='42501'?'Solo el administrador de esta división puede acceder.':'Panel no disponible; no se ha modificado nada.');}
  }
  function addText(list,t){const li=doc.createElement('li');li.textContent=t;list.appendChild(li);}
  function showPlan(p){
    plan=p;preview.hidden=false;el('admin-confirm').checked=false;
    el('admin-summary').textContent=p.allocations.length+' equipos · diferencia máxima de plantilla '+money(p.rosterSpreadCents)+' · patrimonio '+money(p.wealthCents)+' cada equipo';
    const teamList=el('admin-team-list'),marketList=el('admin-market-list');teamList.replaceChildren();marketList.replaceChildren();
    for(const t of p.allocations) {
      const li=doc.createElement('li'),details=doc.createElement('details'),summary=doc.createElement('summary'),list=doc.createElement('ul');
      summary.textContent=t.teamName+' · '+t.players.length+' jugadores · plantilla '+money(t.rosterValueCents)+' · saldo '+money(t.cashCents);
      const quotas=doc.createElement('p');
      quotas.textContent=Object.entries(positions).map(([key,label])=>label+': '+t.players.filter(player=>player.position===key).length).join(' · ');
      details.appendChild(summary);details.appendChild(quotas);
      for(const player of t.players)addText(list,(player.name||'Jugador')+' · '+(positions[player.position]||player.position)+' · '+money(player.valueCents));
      details.appendChild(list);li.appendChild(details);teamList.appendChild(li);
    }
    for(const player of p.marketPlayers)addText(marketList,player.name+' · '+positions[player.position]+' · '+money(player.valueCents));
    say('Simulación lista. Revisa los equipos y los 15 futbolistas. Todavía no se ha repartido nada.');
  }
  function errorText(e){return e.adminMessage||'No se ha podido completar la operación. Comprueba el estado antes de reintentar.';}
  async function readLot(file){
    if(!file||file.size>12_000_000)throw Object.assign(Error('Falta el lote'),{adminMessage:'Selecciona un JSON de catálogo autorizado (máximo 12 MB).'});
    const lote=JSON.parse(await file.text()),snapshot=lote?.catalogo,puntos=lote?.puntos;
    if(snapshot?.kind!=='authorized'||!snapshot.permissionRef||!Array.isArray(snapshot.players)||!Array.isArray(puntos)||puntos.length!==snapshot.players.filter(p=>p.active).length)throw Object.assign(Error('Lote inválido'),{adminMessage:'Lote de catálogo y puntos no autorizado o incompleto.'});
    return {p_catalogo:snapshot,p_puntos:puntos};
  }
  importForm.addEventListener('input',()=>{combinedRequest=null;el('admin-combined-confirm').checked=false;});
  importForm.addEventListener('submit',async e=>{
    e.preventDefault();if(busy||!state||!el('admin-source-confirm').checked)return;
    const c=contexto(),g=generation,file=el('admin-file').files?.[0];
    if(!file||file.size>12_000_000){say('Selecciona un JSON de catálogo autorizado (máximo 12 MB).');return;}
    locks(true);say('Validando catálogo…');
    try {
      const args=await readLot(file);
      if(!visible(g,c))return;
      await call('macroliga_admin_importar_catalogo',args);
      if(visible(g,c)){onChange();await show();}
    } catch(e){if(visible(g,c))say(errorText(e));}finally{if(generation===g)locks(false);}
  });
  form.addEventListener('input',e=>{clearPlan();if(e.target!==el('admin-combined-confirm')){combinedRequest=null;el('admin-combined-confirm').checked=false;}});
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(busy||!state)return;
    clearPlan();const c=contexto(),g=generation;
    let args;
    try{args=configReparto({wealth:el('admin-wealth').value,cash:el('admin-cash').value,date:el('admin-date').value,
      slots:Object.fromEntries(Object.keys(positions).map(p=>[p,el('admin-'+p).value])),
      seed:crypto.randomUUID()},state.maxRoster);}catch(e){say(e.message);return;}
    if(!state.catalogReady){
      if(!el('admin-source-confirm').checked||!el('admin-combined-confirm').checked){say('Confirma el origen autorizado y el arranque completo de los 16 equipos.');return;}
      combinedRequest??=crypto.randomUUID();
      const request=combinedRequest,file=el('admin-file').files?.[0];
      locks(true);say('Validando catálogo, reservando mercado y repartiendo los 16 equipos…');
      try{
        const lote=await readLot(file);if(!visible(g,c))return;
        const {p_seed,...config}=args;
        const result=await call('macroliga_admin_iniciar_todo',{...lote,...config,p_request:request});
        if(visible(g,c)){onChange();await show();if(visible(g+1,c)&&!root.hidden&&state?.initialized)say('Arranque completo: '+result.teams+' equipos · '+result.marketPlayers+' futbolistas en el mercado en borrador · diferencia '+money(result.rosterSpreadCents)+'.');}
      }catch(e){if(visible(g,c))say(errorText(e));}finally{if(generation===g)locks(false);}
      return;
    }
    locks(true);say('Calculando el reparto equilibrado…');
    try {const p=await call('macroliga_admin_simular_reparto',args);if(visible(g,c))showPlan(p);}
    catch(e){if(visible(g,c))say(errorText(e));}finally{if(generation===g)locks(false);}
  });
  el('admin-apply').addEventListener('click',async()=>{
    if(busy||!plan||!el('admin-confirm').checked){say('Confirma primero que has revisado el reparto.');return;}
    const c=contexto(),g=generation,id=plan.previewId;
    locks(true);say('Confirmando reparto…');
    try {
      await call('macroliga_admin_aplicar_reparto',{p_preview:id});
      if(visible(g,c)){onChange();await show();}
    }catch(e){if(visible(g,c))say(errorText(e));}finally{if(generation===g)locks(false);}
  });
  return {show,clear};
}
