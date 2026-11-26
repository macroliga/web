import test from 'node:test';
import assert from 'node:assert/strict';
import { SESION_KEY } from '../app/session.mjs';

// Ejecuta app.js real y sus módulos con un DOM mínimo, almacenamiento
// compartido entre aperturas y un servidor Supabase simulado. Sin red.
class Elemento {
  constructor() {
    this.hidden = false; this.disabled = false; this.value = '';
    this.textContent = ''; this.checked = true; this.children = [];
    this.events = new Map(); this.dataset = {};
    this.classList = {toggle(){},add(){},remove(){}};
  }
  addEventListener(name, fn) { this.events.set(name, fn); }
  dispatch(name, event = {}) { return this.events.get(name)?.({preventDefault(){}, ...event}); }
  appendChild(node) { this.children.push(node); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren() { this.children = []; }
  setAttribute() {}
  removeAttribute() {}
}
const EMAIL = 'demo02@macroliga.invalid';
const PIN = '123456'; // únicamente la cuenta simulada
const ids = ['login-view','private-view','login-form','manager-select','password','login-username',
  'remember-pin','login-button','login-message','team-view','home-view','section-view','top-balance',
  'session-recovery','retry-session','prototype-note','section-icon','section-title','section-message',
  'team-title','team-short-name','team-division','header-balance','team-balance','team-value',
  'team-players','team-capacity','team-wealth','home-wealth','team-refresh-status','admin-nav','roster-list','roster-total','login-subtitle','logout-button','forget-session'];
function entorno() {
  const data = new Map();
  const storage = {
    getItem: key=>data.get(key)??null,
    setItem: (key,value)=>data.set(key,value),
    removeItem: key=>data.delete(key)
  };
  let login = 0, refresh = 0, token = null, error = null, rpcError = false;
  let network = false, expires = 3600, logout = 0;
  const issue = () => {
    token = 'fake' + String(login).padStart(4,'0') + String(refresh).padStart(4,'0');
    return {access_token:'jwt-'+token, refresh_token:token, expires_in:expires};
  };
  const response = (data,status=200)=>({ok:status===200,status,json:async()=>data});
  const fetchImpl = async (url,options)=>{
    const request=JSON.parse(options.body);
    if (network) throw TypeError('Red no disponible');
    if (url.endsWith('grant_type=password')) {
      assert.deepEqual(request,{email:EMAIL,password:PIN}); login++; return response(issue());
    }
    if (url.endsWith('grant_type=refresh_token')) {
      assert.equal(Object.keys(request).join(),'refresh_token');
      if (error) return response({error_code:error},400);
      if (!token || request.refresh_token!==token) return response({error_code:'refresh_token_not_found'},400);
      refresh++; return response(issue());
    }
    if (url.includes('/logout')) {
      assert.match(url,/scope=local$/); logout++; token=null; return response({});
    }
    assert.match(options.headers.Authorization,/^Bearer jwt-fake/);
    if (rpcError) return response({code:'P0001'},400);
    if (url.endsWith('macroliga_mi_equipo')) return response([{equipo_id:'ficticio',division_id:'division-ficticia',nombre_equipo:'Equipo ficticio',nombre_division:'División ficticia',saldo_centimos:500000,valor_plantilla_centimos:1000000,jugadores:1,margen_pujas_centimos:500000}]);
    if (url.endsWith('macroliga_admin_arranque_estado')) return response({code:'42501'},403);
    assert.match(url,/macroliga_plantilla_equipo$/);
    assert.deepEqual(request,{p_equipo_id:'ficticio'});
    return response([{nombre_jugador:'Jugador ficticio',posicion:'DEL',club:'Prueba',valor_mercado_centimos:1000000}]);
  };
  return {storage,fetchImpl,get login(){return login},get refresh(){return refresh},
    get logout(){return logout},get token(){return token},
    set error(x){error=x},set rpcError(x){rpcError=x},set network(x){network=x},
    set expires(x){expires=x},revocar(){token=null}};
}
let apertura=0;
async function abrir(env) {
  const elementos=Object.fromEntries(ids.map(id=>[id,new Elemento()]));
  const botones=Object.fromEntries(['home','team','market','rules','cup','standings','admin','lineup','bad','clauses'].map(view=>{
    const b=new Elemento();b.dataset.view=view;return [view,b];
  }));
  const doc=new Elemento();
  doc.getElementById=id=>elementos[id];
  doc.createElement=()=>new Elemento();
  doc.querySelectorAll=()=>Object.values(botones);
  doc.querySelector=()=>new Elemento();
  const win=new Elemento();
  win.localStorage=env.storage;
  win.scrollTo=()=>{};
  win.MACROLIGA_CONFIG={supabaseUrl:'https://xuwjbfnhvvbdargcohfe.supabase.co',anonKey:'sb_publishable_ficticia',fetchImpl:env.fetchImpl};
  globalThis.document=doc;
  globalThis.window=win;
  globalThis.location={protocol:'http:'};
  const interval=globalThis.setInterval;
  globalThis.setInterval=()=>0;
  try { await import('../app/app.js?test='+ ++apertura); } finally { globalThis.setInterval=interval; }
  await new Promise(resolve=>setImmediate(resolve));
  return {e:elementos,b:botones,doc,win};
}
function privada(p) {
  assert.equal(p.e['private-view'].hidden,false);
  assert.equal(p.e['login-view'].hidden,true);
  assert.equal(p.e['team-title'].textContent,'Equipo ficticio');
}
async function login(p,recordar=true) {
  p.e['manager-select'].value=EMAIL;
  p.e['manager-select'].dispatch('change');
  p.e.password.value=PIN;
  p.e['remember-pin'].checked=recordar;
  await p.e['login-form'].dispatch('submit');
  privada(p);
}
function guardada(env) {
  assert.deepEqual(JSON.parse(env.storage.getItem(SESION_KEY)),{email:EMAIL,refreshToken:env.token});
  assert.equal(env.token.length,12);
}
test('flujo real de app.js: entrar, navegar, reabrir, recuperar y salir sin guardar PIN',async()=>{
  const env=entorno();
  let p=await abrir(env);
  assert.equal(p.e['private-view'].hidden,true);
  await login(p);
  guardada(env);
  for (const view of ['team','market','rules','home','cup','standings','admin','lineup','home']) {
    p.b[view].dispatch('click');
    privada(p);
  }
  assert.equal(env.login,1);
  assert.equal(env.refresh,0);
  p=await abrir(env);
  privada(p);
  guardada(env);
  assert.equal(env.login,1);
  assert.equal(env.refresh,1);
  // RPC 400: no es revocación, se guarda el token rotado y se oculta el PIN.
  env.rpcError=true;
  p=await abrir(env);
  assert.equal(p.e['private-view'].hidden,true);
  assert.equal(p.e['login-form'].hidden,true);
  assert.equal(p.e['session-recovery'].hidden,false);
  guardada(env);
  env.rpcError=false;
  p.e['retry-session'].dispatch('click');
  await new Promise(resolve=>setImmediate(resolve));
  privada(p);
  // Red / Auth transitoria: mantiene acceso e intenta recuperar al volver online.
  env.network=true;
  p=await abrir(env);
  assert.equal(p.e['login-form'].hidden,true);
  guardada(env);
  env.network=false;
  p.win.dispatch('online');
  await new Promise(resolve=>setImmediate(resolve));
  privada(p);
  env.error='unexpected_failure';
  p=await abrir(env);
  assert.equal(p.e['login-form'].hidden,true);
  guardada(env);
  env.error=null;
  p.e['retry-session'].dispatch('click');
  await new Promise(resolve=>setImmediate(resolve));
  privada(p);
  // Cierre explícito, elimina sesión, conserva alias; no revive tras reload.
  p.e['logout-button'].dispatch('click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(env.logout,1);
  assert.equal(env.storage.getItem(SESION_KEY),null);
  p=await abrir(env);
  assert.equal(p.e['private-view'].hidden,true);
  assert.equal(p.e['login-form'].hidden,false);
  assert.equal(p.e['manager-select'].value,EMAIL);
  assert.equal(env.login,1);
  // Si el usuario desmarca recordar, navegar sigue funcionando.
  await login(p,false);
  assert.equal(env.storage.getItem(SESION_KEY),null);
  p.b.market.dispatch('click');
  privada(p);
  p=await abrir(env);
  assert.equal(p.e['private-view'].hidden,true);
  assert.equal(p.e['login-form'].hidden,false);
  // Revocación definitiva de servidor sí solicita PIN.
  await login(p);
  env.revocar();
  p=await abrir(env);
  assert.equal(p.e['private-view'].hidden,true);
  assert.equal(p.e['login-form'].hidden,false);
  assert.match(p.e['login-message'].textContent,/caducado/);
  assert.equal(env.storage.getItem(SESION_KEY),null);
});
test('renovación con app suspendida y sesión que caduca pronto, no pide PIN', async()=>{
  const env=entorno();
  env.expires=20;
  const p=await abrir(env);
  await login(p);
  p.b.market.dispatch('click');
  p.doc.dispatch('visibilitychange');
  await new Promise(resolve=>setImmediate(resolve));
  privada(p);
  assert.equal(env.login,1);
  assert.equal(env.refresh,1);
  guardada(env);
});

test('se usa el refresh rotado por otra apertura y se propaga el cierre',async()=>{
  const env=entorno();
  env.expires=20;
  const locks=[];
  Object.defineProperty(navigator,'locks',{configurable:true,value:{
    request:async(name,job)=>{locks.push(name); return job();}
  }});
  try {
    const a=await abrir(env);
    await login(a);
    const b=await abrir(env);
    privada(b);
    guardada(env);
    // Volver a la primera ventana: usa el token rotado por la segunda.
    globalThis.document=a.doc;globalThis.window=a.win;
    a.doc.dispatch('visibilitychange');
    await new Promise(resolve=>setImmediate(resolve));
    privada(a);
    guardada(env);
    assert.equal(env.login,1);
    assert.equal(env.refresh,2);
    assert.deepEqual(locks,['macroliga-piloto-renovacion','macroliga-piloto-renovacion']);
    a.e['logout-button'].dispatch('click');
    await new Promise(resolve=>setImmediate(resolve));
    globalThis.document=b.doc;globalThis.window=b.win;
    b.win.dispatch('storage',{key:SESION_KEY,newValue:null});
    assert.equal(b.e['private-view'].hidden,true);
    assert.equal(b.e['login-form'].hidden,false);
    assert.equal(env.logout,1);
  } finally { delete navigator.locks; }
});
