import test from 'node:test';
import assert from 'node:assert/strict';
import {configReparto,crearPanelAdmin} from '../app/admin.mjs';
import {crearCliente} from '../app/api.mjs';

const config={wealth:'70',cash:'10',slots:{GK:'2',DEF:'5',MID:'5',FWD:'3'},date:'2026-12-01',seed:'prueba'};
test('admin: patrimonio en céntimos, posiciones y tamaño configurables',()=>{
  assert.deepEqual(configReparto(config),{p_wealth:'7000000000',p_min_cash:'1000000000',p_slots:{GK:2,DEF:5,MID:5,FWD:3},p_market_date:'2026-12-01',p_seed:'prueba'});
  assert.equal(configReparto({...config,wealth:'72',slots:{GK:1,DEF:4,MID:4,FWD:3}}).p_wealth,'7200000000');
  for(const bad of [{wealth:''},{cash:'71'},{wealth:'70.5'},{slots:{GK:0,DEF:6,MID:6,FWD:3}},{slots:{GK:2,DEF:5,MID:5,FWD:4}},{date:''}]){
    assert.throws(()=>configReparto({...config,...bad}));
  }
});
test('admin: RPC acotadas, JWT personal obligatorio y rechazo sin cerrar sesión',async()=>{
  const requests=[];
  const client=crearCliente({supabaseUrl:'https://xuwjbfnhvvbdargcohfe.supabase.co',anonKey:'sb_publishable_fixture',fetchImpl:async(url,options)=>{
    requests.push({url,options});return {ok:false,status:403,json:async()=>({code:'42501'})};
  }});
  await assert.rejects(client.administrar('macroliga_admin_arranque_estado',{p_division:'d'},null));
  await assert.rejects(client.administrar('otra_rpc',{p_division:'d'},'jwt'));
  await assert.rejects(client.consultar('macroliga_admin_aplicar_reparto',{},'jwt'));
  await assert.rejects(client.administrar('macroliga_admin_arranque_estado',{p_division:'d'},'jwt'),e=>e.code==='42501');
  assert.equal(requests.length,1);
  assert.equal(requests[0].options.headers.Authorization,'Bearer jwt');
});
class Element{
 constructor(){this.hidden=false;this.value='';this.textContent='';this.children=[];this.handlers={};}
 addEventListener(k,v){this.handlers[k]=v;}
 emit(k){return this.handlers[k]?.({preventDefault(){}});}
 appendChild(n){this.children.push(n);}
 replaceChildren(){this.children=[];}
}
function fixture(){
 const ids=['message','form','preview','import-form','confirm','team-list','market-list','file','source-confirm','state','summary','wealth','cash','date','GK','DEF','MID','FWD','apply','combined-confirm','combined-section','form-submit'];
 const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
 Object.assign(elements.wealth,{value:'70'});Object.assign(elements.cash,{value:'0'});Object.assign(elements.date,{value:'2026-12-01'});
 for(const [p,n] of Object.entries(config.slots))elements[p].value=n;
 const root=new Element();
 root.ownerDocument={createElement:()=>new Element()};
 root.querySelector=id=>elements[id.replace('#admin-','')];root.querySelectorAll=()=>Object.values(elements);
 return {root,e:elements};
}
const state={teamCount:16,catalogCount:500,wealthCents:'7000000000',catalogReady:true,initialized:false,marketPrepared:false,seasonStatus:'draft',maxRoster:16};
const sample={previewId:'preview',wealthCents:'7000000000',rosterSpreadCents:'5',
 allocations:Array.from({length:16},(_,i)=>({teamName:'Equipo '+i,players:Array(15).fill({}),rosterValueCents:'6000000000',cashCents:'1000000000'})),
 marketPlayers:Array.from({length:15},(_,i)=>({name:'Futbolista '+i,position:'GK',valueCents:'100000000'}))};
test('admin: vista de simulación, confirmación explícita, 16 equipos y 15 lotes; no salto al PIN',async()=>{
 const {root,e}=fixture();let applied=false;const calls=[];
 const panel=crearPanelAdmin(root,()=>({division:'d',identity:'team',token:'jwt',client:{administrar:async(name,params)=>{
   calls.push({name,params});
   if(name.endsWith('_estado'))return {...state,initialized:applied};
   if(name.endsWith('_simular_reparto'))return sample;
   if(name.endsWith('_aplicar_reparto')){applied=true;return {marketStatus:'draft'};}
 }}}));
 await panel.show();assert.equal(e.form.hidden,false);assert.equal(e['import-form'].hidden,true);
 await e.form.emit('submit');assert.equal(e.preview.hidden,false);
 assert.equal(e['team-list'].children.length,16);assert.equal(e['market-list'].children.length,15);
 await e.apply.emit('click');assert.equal(applied,false);
 e.confirm.checked=true;await e.apply.emit('click');assert.equal(applied,true);
 assert.equal(calls.find(c=>c.name.endsWith('_aplicar_reparto')).params.p_preview,'preview');
 assert.equal(e.form.hidden,true);assert.equal(e.preview.hidden,true);assert.match(e.message.textContent,/Reparto realizado/);
 panel.clear();assert.equal(root.hidden,true);assert.equal(e.state.textContent,'');
});
test('admin: denegación no muestra datos y resultado asíncrono tras salir se descarta',async()=>{
 const {root,e}=fixture();let denied=true,resolve;
 const panel=crearPanelAdmin(root,()=>({division:'d',identity:'team',token:'jwt',client:{administrar:()=>denied?Promise.reject(Object.assign(Error(),{status:403})):new Promise(r=>resolve=r)}}));
 await panel.show();assert.match(e.message.textContent,/Solo el administrador/);assert.equal(e.form.hidden,true);
 denied=false;const pending=panel.show();panel.clear();resolve(state);await pending;
 assert.equal(root.hidden,true);assert.equal(e.state.textContent,'');assert.equal(e.form.hidden,true);
});

test('admin: arranque combinado requiere lote, confirmaciones y una clave estable de reintento',async()=>{
 const {root,e}=fixture();let initialized=false,failed=false;const calls=[];
 const blank={...state,catalogReady:false,catalogCount:0};
 const data={catalogo:{kind:'authorized',permissionRef:'ficticia local',players:[{active:true,externalId:'fixture'}]},puntos:[{externalId:'fixture',points:0}]};
 e.file.files=[{size:300,text:async()=>JSON.stringify(data)}];
 const panel=crearPanelAdmin(root,()=>({division:'d',identity:'team',token:'jwt',client:{administrar:async(name,params)=>{
   calls.push({name,params});
   if(name.endsWith('_estado'))return initialized?{...state,initialized:true,marketPrepared:true}:blank;
   if(name.endsWith('_iniciar_todo')){
      if(!failed){failed=true;throw Error('red');}
      initialized=true;return {teams:16,marketPlayers:15,rosterSpreadCents:'100'};
   }
   throw Error('No debe usar operaciones separadas');
 }}}));
 await panel.show();
 assert.equal(e.form.hidden,false);assert.equal(e['import-form'].hidden,false);
 assert.equal(e['combined-section'].hidden,false);assert.match(e['form-submit'].textContent,/Cargar, repartir/);
 await e.form.emit('submit');assert.equal(calls.length,1);
 e['source-confirm'].checked=true;e['combined-confirm'].checked=true;
 await e.form.emit('submit');assert.equal(initialized,false);
 assert.match(e.message.textContent,/Comprueba el estado/);
 await e.form.emit('submit');assert.equal(initialized,true);
 const combined=calls.filter(c=>c.name.endsWith('_iniciar_todo'));
 assert.equal(combined.length,2);
 assert.deepEqual(combined[0].params,combined[1].params);
 assert.equal(combined[0].params.p_wealth,'7000000000');
 assert.ok(!Object.hasOwn(combined[0].params,'p_seed'));
 assert.equal(combined[0].params.p_catalogo.permissionRef,data.catalogo.permissionRef);
 assert.equal(e.form.hidden,true);assert.match(e.message.textContent,/Arranque completo/);
});
