import { crearPanelNoticias } from './noticias.mjs?v=26';
import { crearCliente } from './api.mjs?v=28';
import { crearPanelClasificacion } from './clasificacion.mjs?v=27';
import { crearPanelCatalogo } from './catalogo.mjs?v=30';
import { crearPanelAlineacion } from './alineacion.mjs?v=24';
import { crearPanelAdmin } from './admin.mjs?v=17';
import { euros } from './logic.mjs?v=10';
import { cuentasDemostracion } from './entrenadores.mjs?v=10';
import { recordarEntrenador, entrenadorRecordado, guardarSesion,
  sesionRecordada, olvidarSesion, SESION_KEY } from './session.mjs?v=10';

// El contenido privado permanece oculto hasta validar nombre + PIN en Supabase.
const el = (id) => document.getElementById(id);
const loginView = el('login-view');
const privateView = el('private-view');
const loginForm = el('login-form');
const entrenador = el('manager-select');
const pin = el('password');
const aliasGestor = el('login-username');
const recordarPin = el('remember-pin');
const loginButton = el('login-button');
const loginMessage = el('login-message');
const teamView = el('team-view');
const homeView = el('home-view');
const sectionView = el('section-view');
const topBalance = el('top-balance');
const adminNav = el('admin-nav');
const nav = document.querySelector('.bottom-nav');

const SECCIONES = Object.freeze({
  news: ['📰', 'Noticias', 'Historial de fichajes confirmados'],
  clauses: ['🔨', 'Cláusulas', 'Las cláusulas estarán disponibles cuando termine la puesta a punto del piloto.'],
  lineup: ['👕', 'Alineación', 'Prepara tu once y consulta los partidos.'],
  sales: ['⚽', 'Mercado', 'Gestiona tus ventas y ofertas.'],
  market: ['⚽', 'Mercado', 'Las pujas y los fichajes aparecerán aquí cuando activemos el mercado del piloto.'],
  bad: ['👹', 'Equipo Malo', 'Consulta su plantilla y las compras confirmadas.'],
  rules: ['📖', 'Normas', 'Las normas de MACROLIGA se publicarán aquí antes del inicio de la competición.'],
  cup: ['🏆', 'Copa', 'La Copa está reservada para una fase posterior. Aún no se ha definido su formato.'],
  standings: ['📊', 'Clasificación', 'La clasificación aparecerá cuando tengamos jornadas y puntuaciones.'],
  admin: ['⚙', 'Administración', 'El panel de administración todavía está en desarrollo y tendrá acceso restringido.']
});
let cliente = null;
let divisionActual = null;
let identidadActual = null;
let token = null;
let intento = 0;
let venceEn = 0;
let refrescando = false;
let sesionActual = null;
let ultimoToken = null;
let persistente = false;
let equipoRevision = 0, adminRevision = 0, adminAutorizado = false;
let vistaActual = 'home';
const recovery = el('session-recovery');
const retryButton = el('retry-session');
const note = el('prototype-note');
const NOTA_NORMAL = note.textContent;
const storage = (() => { try { return window.localStorage; } catch { return null; } })();

const panelCatalogo = crearPanelCatalogo(el('market-catalog'), () => ({client:cliente, token, division:divisionActual, identity:identidadActual}), () => {void actualizarEquipo();});
const panelAlineacion = crearPanelAlineacion(el('lineup-panel'), () => ({client:cliente, token, division:divisionActual, identity:identidadActual}));
const panelClasificacion = crearPanelClasificacion(el('standings-panel'), () => ({client:cliente, token, division:divisionActual, identity:identidadActual, session:intento}));
const panelAdmin = crearPanelAdmin(el('admin-panel'), () => ({client:cliente, token, division:divisionActual, identity:identidadActual}), () => {void actualizarEquipo();});

const panelNoticias = crearPanelNoticias(el('news-latest'), el('news-history-list'), () => ({client:cliente, token, division:divisionActual, identity:identidadActual, session:intento}), el('news-filters'));

function aviso(texto) {
  loginMessage.textContent = texto;
}
function cambiarVista(nombre, jugadorVenta=null) {
  if (!token) return;
  if (nombre==='admin'&&!adminAutorizado) return;
  vistaActual=nombre;
  if(el('news-history'))el('news-history').hidden=nombre!=='news';
  if(nombre==='news'||nombre==='home')void panelNoticias?.show(nombre);
  else panelNoticias?.clear();
  const esInicio = nombre === 'home';
  homeView.hidden = !esInicio;
  teamView.hidden = nombre !== 'team';
  sectionView.hidden = esInicio || nombre === 'team';
  if (!esInicio && nombre !== 'team') {
    const [icono, titulo, mensaje] = SECCIONES[nombre] || SECCIONES.rules;
    el('section-icon').textContent = icono;
    el('section-title').textContent = titulo;
    el('section-message').textContent = mensaje;
  }
  for (const boton of document.querySelectorAll('.bottom-nav button')) {
    const activo = boton.dataset.view === (SECCIONES[nombre] ? nombre : 'home');
    boton.classList.toggle('active', activo);
    if (activo) boton.setAttribute('aria-current', 'page');
    else boton.removeAttribute('aria-current');
  }
  if (panelAdmin) {
    const placeholder = el('section-placeholder');
    placeholder.hidden = ['admin','market','sales','lineup','bad','news'].includes(nombre) || (nombre === 'standings' && Boolean(panelClasificacion));
    placeholder.classList.toggle('market-summary', nombre === 'market');
    if (nombre === 'admin') void panelAdmin.show(); else panelAdmin.clear();
  }
  if (['market','sales','bad'].includes(nombre)) void panelCatalogo?.show(nombre,jugadorVenta); else panelCatalogo?.clear();
  if (nombre==='lineup') void panelAlineacion?.show(); else panelAlineacion?.clear();
  if (nombre === 'standings') void panelClasificacion?.show(); else panelClasificacion?.clear();
  if (nombre==='team'||nombre==='home') void actualizarEquipo();
  window.scrollTo({top: 0, behavior: 'instant'});
}
function borrarDatosPrivados() {
  panelNoticias?.clear();
  divisionActual = null; identidadActual = null; equipoRevision++;adminRevision++;mostrarAdmin(false); panelAdmin?.clear(); panelCatalogo?.clear(); panelClasificacion?.clear(); panelAlineacion?.clear();
  for (const id of ['team-title','team-short-name','team-division','header-balance',
    'team-balance','team-value','team-wealth','home-wealth','team-players','team-capacity']) {
    if(el(id))el(id).textContent = '—';
  }
  el('roster-list').replaceChildren();
  if(el('roster-total'))el('roster-total').textContent='0 / 16';
  if(el('team-refresh-status'))el('team-refresh-status').textContent='';
}
function mostrarAcceso(recuperando = false) {
  pin.value = '';
  token = null;
  venceEn = 0;
  privateView.hidden = true;
  topBalance.hidden = true;
  el('prototype-note').hidden = true;
  loginView.hidden = false;
  loginForm.hidden = recuperando;
  el('login-subtitle').hidden = recuperando;
  recovery.hidden = !recuperando;
  borrarDatosPrivados();
}
function mostrarAplicacion() {
  pin.value = '';
  loginView.hidden = true;
  privateView.hidden = false;
  topBalance.hidden = false;
  el('prototype-note').hidden = false;
  cambiarVista('home');
  void comprobarAdmin();
}
function pintarPlantilla(jugadores) {
  const lista = el('roster-list');
  lista.replaceChildren();
  el('roster-total').textContent = String(jugadores.length) + ' / 16';
  if (!jugadores.length) {
    const aviso = document.createElement('p');
    aviso.className = 'roster-empty';
    aviso.textContent = 'Todavía no se han repartido futbolistas.';
    lista.appendChild(aviso);
    return;
  }
  const posiciones = [
    ['GK', '🥅 Porteros'],
    ['DEF', '🛡️ Defensas'],
    ['MID', '⚙️ Medios'],
    ['FWD', '🎯 Delanteros']
  ];
  const normalizar = (valor) => {
    const p = String(valor || '').trim().toUpperCase();
    if (['GK','POR','PORTERO','PORTEROS'].includes(p)) return 'GK';
    if (['DEF','DEFENSA','DEFENSAS'].includes(p)) return 'DEF';
    if (['MID','MED','MC','MEDIO','MEDIOS','CENTROCAMPISTA'].includes(p)) return 'MID';
    if (['FWD','DEL','DELANTERO','DELANTEROS'].includes(p)) return 'FWD';
    return 'OTRO';
  };
  const hacer = (etiqueta, clase, texto) => {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto !== undefined && texto !== null) nodo.textContent = String(texto);
    return nodo;
  };
  const grupos = posiciones.concat([['OTRO', 'Otros']]);
  for (const [codigo, titulo] of grupos) {
    const datos = jugadores.filter(j => normalizar(j.posicion) === codigo)
      .sort((a,b) => Number(b.valor_mercado_centimos || 0) - Number(a.valor_mercado_centimos || 0));
    if (!datos.length && codigo === 'OTRO') continue;
    const bloque = hacer('section', 'roster-position');
    const cabecera = hacer('div', 'roster-position-head');
    cabecera.append(hacer('h4', '', titulo), hacer('span', '', datos.length + ' · VALOR ↓'));
    bloque.appendChild(cabecera);
    if (!datos.length) {
      bloque.appendChild(hacer('p', 'roster-position-empty', 'Sin futbolistas en esta posición.'));
    }
    for (const jugador of datos) {
      const fila = hacer('article', 'roster-player');
      const descripcion = hacer('div', 'roster-player-info');
      descripcion.appendChild(hacer('strong', 'roster-player-name', jugador.nombre_jugador || 'Jugador sin nombre'));
      descripcion.appendChild(hacer('span', 'roster-player-club', jugador.club || 'Club sin confirmar'));
      // Solo mostramos puntos y cláusulas cuando la fuente segura devuelve esos campos.
      const detalles = [];
      if (jugador.puntos !== null && jugador.puntos !== undefined) detalles.push(jugador.puntos + ' pts');
      if (jugador.clausula_centimos !== null && jugador.clausula_centimos !== undefined) detalles.push('Cláusula ' + euros(jugador.clausula_centimos));
      if (detalles.length) descripcion.appendChild(hacer('small', 'roster-player-extra', detalles.join(' · ')));
      const acciones = hacer('div', 'roster-player-actions');
      acciones.appendChild(hacer('small', 'roster-value-label', 'VALOR'));
      acciones.appendChild(hacer('strong', 'roster-player-value', euros(jugador.valor_mercado_centimos || 0)));
      const vender = hacer('button', 'roster-sale-button', 'Vender al ☠️');
      vender.type = 'button';
      vender.disabled = true;
      vender.title = 'La venta al Equipo Malo aún no está activada';
      acciones.appendChild(vender);
      if(jugador.jugador_id){
        const mercado=hacer('button','roster-market-button','Poner en venta');
        mercado.type='button';mercado.addEventListener('click',()=>cambiarVista('sales',jugador.jugador_id));acciones.appendChild(mercado);
      }
      fila.append(descripcion, acciones);
      bloque.appendChild(fila);
    }
    lista.appendChild(bloque);
  }
}
async function consultarEquipo(jwt) {
  const equipos = await cliente.consultar('macroliga_mi_equipo', {}, jwt);
  if (!Array.isArray(equipos) || equipos.length !== 1) {
    throw new Error('No se ha encontrado un único equipo para este entrenador.');
  }
  const equipo = equipos[0];
  const jugadores = await cliente.consultar('macroliga_plantilla_equipo',
    {p_equipo_id: equipo.equipo_id}, jwt);
  if (!Array.isArray(jugadores)) throw new Error('No se pudo consultar la plantilla.');
  return {equipo, jugadores};
}
function venceSesion(sesion) {
  venceEn = Date.now() + (Number(sesion.expiresIn) || 3600) * 1000;
}

function pintarEquipo(equipo, jugadores) {
  divisionActual = equipo.division_id; identidadActual = equipo.equipo_id;
  el('team-short-name').textContent = equipo.nombre_equipo;
  el('team-title').textContent = equipo.nombre_equipo;
  el('team-division').textContent = equipo.nombre_division;
  el('header-balance').textContent = euros(equipo.saldo_centimos);
  el('team-balance').textContent = euros(equipo.saldo_centimos);
  el('team-value').textContent = euros(equipo.valor_plantilla_centimos);
  const patrimonio = Number(equipo.saldo_centimos)+Number(equipo.valor_plantilla_centimos);
  if(el('team-wealth'))el('team-wealth').textContent = euros(patrimonio);
  if(el('home-wealth'))el('home-wealth').textContent = euros(patrimonio);
  el('team-players').textContent = String(equipo.jugadores) + ' / 16';
  el('team-capacity').textContent = euros(equipo.margen_pujas_centimos);
  pintarPlantilla(jugadores);
}

// Estas consultas nunca renuevan, borran ni invalidan una sesión. Solo
// actualizan datos de la identidad que inició la petición.
async function actualizarEquipo(){
  if(!token||!identidadActual)return;
  const revision=++equipoRevision, sesion=intento, equipoId=identidadActual, division=divisionActual, jwt=token;
  const valid=()=>revision===equipoRevision&&sesion===intento&&equipoId===identidadActual&&division===divisionActual&&Boolean(token);
  try{
    const {equipo,jugadores}=await consultarEquipo(jwt);
    if(!valid()||equipo.equipo_id!==equipoId||equipo.division_id!==division)return;
    pintarEquipo(equipo,jugadores);
    if(el('team-refresh-status'))el('team-refresh-status').textContent='';
  }catch{
    if(valid()&&el('team-refresh-status'))el('team-refresh-status').textContent='No se pudo actualizar. Se muestran los últimos datos consultados.';
  }
}
function mostrarAdmin(autorizado){
  adminAutorizado=autorizado;
  if(adminNav)adminNav.hidden=!autorizado;
  nav?.classList.toggle('has-admin',autorizado);
}
async function comprobarAdmin(){
  if(!token||!divisionActual||!identidadActual)return;
  const revision=++adminRevision, sesion=intento, equipoId=identidadActual, division=divisionActual, jwt=token;
  const valid=()=>revision===adminRevision&&sesion===intento&&equipoId===identidadActual&&division===divisionActual&&Boolean(token);
  try{
    const result=await cliente.administrar('macroliga_admin_arranque_estado',{p_division:division},jwt);
    if(!valid()||!result||typeof result.teamCount!=='number')return;
    mostrarAdmin(true);
  }catch{
    if(valid()){mostrarAdmin(false);if(vistaActual==='admin')cambiarVista('home');}
  }
}

// El email ficticio no se solicita al usuario. Es el alias interno del nombre.
const cuentas = cuentasDemostracion();
const nombreGuardado = entrenadorRecordado(storage);
for (const cuenta of cuentas) {
  const opcion = document.createElement('option');
  opcion.value = cuenta.correo;
  opcion.textContent = cuenta.entrenador;
  entrenador.appendChild(opcion);
}
if (nombreGuardado && cuentas.some((c) => c.correo === nombreGuardado)) {
  entrenador.value = nombreGuardado;
}
aliasGestor.value = entrenador.value;
// El gestor del móvil usa un campo de usuario convencional, pero el usuario
// sigue eligiendo su nombre en el selector visible de MACROLIGA.
entrenador.addEventListener('change', () => {
  aliasGestor.value = entrenador.value;
  pin.value = '';
});
aliasGestor.addEventListener('input', () => {
  if (cuentas.some((c) => c.correo === aliasGestor.value)) {
    entrenador.value = aliasGestor.value;
  }
});
pin.addEventListener('input', () => {
  pin.value = pin.value.replace(/\D/g, '').slice(0, 6);
});
for (const boton of document.querySelectorAll('[data-view]')) {
  boton.addEventListener('click', () => cambiarVista(boton.dataset.view));
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!cliente || token || loginButton.disabled) return;
  // Algunos navegadores rellenan el usuario automáticamente sin disparar
  // un evento: recuperamos el alias solo si pertenece a los 16 autorizados.
  if (aliasGestor.value !== entrenador.value &&
      cuentas.some((c) => c.correo === aliasGestor.value)) {
    entrenador.value = aliasGestor.value;
  }
  aliasGestor.value = entrenador.value;
  const cuenta = cuentas.find((c) => c.correo === entrenador.value);
  if (!cuenta) { aviso('Selecciona tu entrenador.'); return; }
  if (!/^\d{6}$/.test(pin.value)) { aviso('Introduce un PIN de seis cifras.'); return; }
  const numeroIntento = ++intento;
  loginButton.disabled = true;
  aviso('Comprobando PIN…');
  let nuevaSesion = null;
  try {
    nuevaSesion = await cliente.iniciarSesionConSesion(cuenta.correo, pin.value);
    const {equipo, jugadores} = await consultarEquipo(nuevaSesion.accessToken);
    if (numeroIntento !== intento) {
      await cliente.cerrarSesion(nuevaSesion.accessToken);
      return;
    }
    token = nuevaSesion.accessToken;
    ultimoToken = token;
    venceSesion(nuevaSesion);
    sesionActual = {email: cuenta.correo, refreshToken: nuevaSesion.refreshToken};
    recordarEntrenador(storage, cuenta.correo);
    // Solo conserva el token de renovación, nunca el PIN.
    persistente = recordarPin.checked && guardarSesion(storage, cuenta.correo, nuevaSesion.refreshToken);
    if (!recordarPin.checked) olvidarSesion(storage);
    note.textContent = recordarPin.checked && !persistente
      ? 'MACROLIGA · El dispositivo no permite recordar el acceso.'
      : NOTA_NORMAL;
    pintarEquipo(equipo, jugadores);
    mostrarAplicacion();
  } catch (error) {
    if (nuevaSesion?.accessToken) await cliente.cerrarSesion(nuevaSesion.accessToken);
    if (numeroIntento === intento) {
      mostrarAcceso();
      aviso(error.message || 'No se pudo iniciar sesión.');
    }
  } finally {
    if (numeroIntento === intento) loginButton.disabled = false;
  }
});

// El cierre local es inmediato; ninguna renovación en curso puede reabrirlo.
function salir() {
  const anterior = ultimoToken;
  ultimoToken = null;
  ++intento;
  olvidarSesion(storage);
  persistente = false;
  sesionActual = null;
  mostrarAcceso();
  loginButton.disabled = false;
  note.textContent = NOTA_NORMAL;
  aviso('Has salido. Tu entrenador sigue seleccionado por comodidad.');
  if (anterior && cliente) void cliente.cerrarSesion(anterior);
}
el('logout-button').addEventListener('click', salir);
el('forget-session').addEventListener('click', salir);
retryButton.addEventListener('click', () => void restaurarSesion());

// Las pestañas de la PWA pueden convivir. Renovamos el token más reciente
// dentro de un bloqueo por origen, evitando rotaciones simultáneas.
function conBloqueo(tarea) {
  return navigator.locks?.request
    ? navigator.locks.request('macroliga-piloto-renovacion', tarea)
    : tarea();
}
function mismaSesion(a, b) {
  return a?.email === b?.email && a?.refreshToken === b?.refreshToken;
}
async function recuperarSesion(validarEquipo) {
  if (!cliente || refrescando) return;
  const guardada = persistente ? sesionRecordada(storage) : sesionActual;
  if (!guardada) return;
  const numeroIntento = intento;
  refrescando = true;
  retryButton.disabled = true;
  if (validarEquipo) {
    mostrarAcceso(true);
    aviso('Recuperando tu sesión…');
  }
  try {
    await conBloqueo(async () => {
      if (numeroIntento !== intento) return;
      // Otra pestaña puede haber rotado el token mientras esperábamos.
      const origen = persistente ? sesionRecordada(storage) : sesionActual;
      if (!origen || origen.email !== guardada.email) return;
      let renovada;
      try {
        renovada = await cliente.renovarSesion(origen.refreshToken);
      } catch (error) {
        if (numeroIntento !== intento) return;
        // Nunca borrar una sesión que cambió mientras llegaba la respuesta.
        if (persistente && !mismaSesion(sesionRecordada(storage), origen)) return;
        // Resolver la revocación dentro del bloqueo, antes de que otra
        // pestaña pueda iniciar una nueva rotación.
        if (error.sesionRevocada) {
          if (persistente) olvidarSesion(storage);
          persistente = false;
          sesionActual = null;
          ultimoToken = null;
          mostrarAcceso();
          aviso('Tu sesión ha caducado. Introduce el PIN para volver a entrar.');
          return;
        }
        throw error;
      }
      if (numeroIntento !== intento) return;
      if (persistente && !mismaSesion(sesionRecordada(storage), origen)) return;
      ultimoToken = renovada.accessToken;
      sesionActual = {email: origen.email, refreshToken: renovada.refreshToken};
      // Persistir la rotación ANTES de consultar las RPC.
      if (persistente && !guardarSesion(storage, origen.email, renovada.refreshToken)) {
        persistente = false;
        note.textContent = 'MACROLIGA · El dispositivo no permite recordar el acceso.';
      }
      if (validarEquipo) {
        const {equipo, jugadores} = await consultarEquipo(renovada.accessToken);
        if (numeroIntento !== intento) return;
        if (persistente && sesionRecordada(storage)?.email !== origen.email) return;
        entrenador.value = origen.email;
        aliasGestor.value = origen.email;
        recordarEntrenador(storage, origen.email);
        pintarEquipo(equipo, jugadores);
      }
      token = renovada.accessToken;
      venceSesion(renovada);
      if (validarEquipo) mostrarAplicacion();
    });
  } catch (error) {
    if (numeroIntento !== intento) return;
    if (validarEquipo || Date.now() >= venceEn) {
      mostrarAcceso(true);
      aviso('No se pudo conectar. Tu acceso sigue guardado; vuelve a conectar.');
    }
    // Un error temporal no borra el token de renovación ni pide el PIN.
  } finally {
    refrescando = false;
    retryButton.disabled = false;
  }
}

async function restaurarSesion() {
  if (!cliente || refrescando) return;
  if (!sesionActual) {
    sesionActual = sesionRecordada(storage);
    persistente = !!sesionActual;
  }
  if (!sesionActual) return;
  await recuperarSesion(true);
}
async function renovarSiCaduca() {
  if (!cliente || refrescando || document.hidden || !sesionActual) return;
  if (!token) {
    if (!recovery.hidden) await restaurarSesion();
  } else if (Date.now() + 120000 >= venceEn) {
    await recuperarSesion(false);
  }
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { void renovarSiCaduca(); if(token&&vistaActual==='home')void panelNoticias?.refreshHome(); }
});
window.addEventListener('online', () => {void renovarSiCaduca();if(token){void actualizarEquipo();void comprobarAdmin();if(vistaActual==='home')void panelNoticias?.refreshHome();}});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) void renovarSiCaduca();
});
setInterval(() => { if (token) { void renovarSiCaduca(); if(!document.hidden&&vistaActual==='home')void panelNoticias?.refreshHome(); } }, 60000);
window.addEventListener('storage', (event) => {
  if (event.key !== SESION_KEY && event.key !== null) return;
  if (!persistente) return;
  const reciente = sesionRecordada(storage);
  if (!reciente || reciente.email !== sesionActual?.email) {
    ++intento;
    persistente = false;
    sesionActual = null;
    ultimoToken = null;
    mostrarAcceso();
    aviso('La sesión ha cambiado en otra ventana. Vuelve a entrar.');
    // No cerrar sesión en el servidor desde esta pestaña: la otra ya
    // gestionó su cierre y puede estar iniciando una sesión nueva.
  }
});

try {
  cliente = crearCliente(window.MACROLIGA_CONFIG || {});
  aviso('Selecciona un entrenador e introduce su PIN.');
} catch {
  loginButton.disabled = true;
  aviso('La conexión de MACROLIGA no está disponible todavía.');
}

// Un HTML antiguo y un módulo nuevo pueden coexistir durante despliegues
// estáticos. No borrar la sesión; actualizar una sola vez por versión.
function actualizarAplicacion(manual=false){
  if(!window.location?.href)return false;
  const url=new URL(window.location.href);
  if(!manual&&url.searchParams.get('release')==='30')return false;
  url.searchParams.set('release','30');
  if(manual)url.searchParams.set('refresh',String(Date.now()));
  window.location.replace(url.href);
  return true;
}
el('app-refresh')?.addEventListener('click',()=>actualizarAplicacion(true));
const actualizandoHTML = Boolean(document.documentElement&&document.documentElement.dataset.release!=='30'&&actualizarAplicacion());

// El PIN nunca se guarda. Para no pedirlo cada vez, solo se conserva
// el token de renovación que emite Supabase en este dispositivo.
if (!actualizandoHTML) {
  mostrarAcceso();
  if (cliente) void restaurarSesion();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js', {updateViaCache: 'none'}).catch(() => {});
  }
}


