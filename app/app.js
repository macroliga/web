import { crearCliente } from './api.mjs';
import { euros } from './logic.mjs';
import { cuentasDemostracion } from './entrenadores.mjs';
import { recordarEntrenador, entrenadorRecordado, guardarSesion,
  sesionRecordada, olvidarSesion, SESION_KEY } from './session.mjs';

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

const SECCIONES = Object.freeze({
  clauses: ['🔨', 'Cláusulas', 'Las cláusulas estarán disponibles cuando termine la puesta a punto del piloto.'],
  lineup: ['👕', 'Alineación', 'Aquí podrás preparar tu once y consultar los partidos. Todavía no hay jornadas activadas.'],
  market: ['⚽', 'Mercado', 'Las pujas y los fichajes aparecerán aquí cuando activemos el mercado del piloto.'],
  bad: ['👹', 'Equipo Malo', 'Las compras y las cláusulas especiales del Equipo Malo todavía no están activadas.'],
  rules: ['📖', 'Normas', 'Las normas de MACROLIGA se publicarán aquí antes del inicio de la competición.'],
  cup: ['🏆', 'Copa', 'La Copa está reservada para una fase posterior. Aún no se ha definido su formato.'],
  standings: ['📊', 'Clasificación', 'La clasificación aparecerá cuando tengamos jornadas y puntuaciones.'],
  admin: ['⚙', 'Administración', 'El panel de administración todavía está en desarrollo y tendrá acceso restringido.']
});
let cliente = null;
let token = null;
let intento = 0;
let venceEn = 0;
let refrescando = false;
const storage = (() => { try { return window.localStorage; } catch { return null; } })();

function aviso(texto) {
  loginMessage.textContent = texto;
}
function cambiarVista(nombre) {
  if (!token) return;
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
  window.scrollTo({top: 0, behavior: 'instant'});
}
function borrarDatosPrivados() {
  for (const id of ['team-title','team-short-name','team-division','header-balance',
    'team-balance','team-value','team-players','team-capacity']) {
    el(id).textContent = '—';
  }
  el('roster-list').replaceChildren();
}
function mostrarAcceso() {
  pin.value = '';
  token = null;
  venceEn = 0;
  privateView.hidden = true;
  topBalance.hidden = true;
  el('prototype-note').hidden = true;
  loginView.hidden = false;
  borrarDatosPrivados();
}
function mostrarAplicacion() {
  pin.value = '';
  loginView.hidden = true;
  privateView.hidden = false;
  topBalance.hidden = false;
  el('prototype-note').hidden = false;
  cambiarVista('home');
}
function pintarPlantilla(jugadores) {
  const lista = el('roster-list');
  lista.replaceChildren();
  if (!jugadores.length) {
    const li = document.createElement('li');
    li.textContent = 'Todavía no se han repartido futbolistas.';
    lista.appendChild(li);
    return;
  }
  for (const j of jugadores) {
    const li = document.createElement('li');
    li.textContent = [j.nombre_jugador, j.posicion, j.club,
      euros(j.valor_mercado_centimos)].filter(Boolean).join(' · ');
    lista.appendChild(li); // Se muestra como texto, nunca como HTML.
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
  venceEn = Date.now() + Math.max(60, Number(sesion.expiresIn) || 3600) * 1000;
}

function pintarEquipo(equipo, jugadores) {
  el('team-short-name').textContent = equipo.nombre_equipo;
  el('team-title').textContent = equipo.nombre_equipo;
  el('team-division').textContent = equipo.nombre_division;
  el('header-balance').textContent = euros(equipo.saldo_centimos);
  el('team-balance').textContent = euros(equipo.saldo_centimos);
  el('team-value').textContent = euros(equipo.valor_plantilla_centimos);
  el('team-players').textContent = String(equipo.jugadores) + ' / 16';
  el('team-capacity').textContent = euros(equipo.margen_pujas_centimos);
  pintarPlantilla(jugadores);
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
  if (!cliente || token) return;
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
    venceSesion(nuevaSesion);
    recordarEntrenador(storage, cuenta.correo);
    // Solo se conserva el refresh token, nunca el PIN.
    const accesoGuardado = recordarPin.checked && guardarSesion(storage, cuenta.correo, nuevaSesion.refreshToken);
    if (!recordarPin.checked) olvidarSesion(storage);
    if (recordarPin.checked && !accesoGuardado) window.alert('No se pudo recordar el acceso en este dispositivo. Tendrás que introducir el PIN al volver.');
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

el('logout-button').addEventListener('click', () => {
  const anterior = token;
  ++intento;
  // La acción Salir revoca el acceso local inmediatamente.
  olvidarSesion(storage);
  mostrarAcceso();
  aviso('Has salido. Tu entrenador sigue seleccionado por comodidad.');
  if (anterior && cliente) void cliente.cerrarSesion(anterior);
});

async function restaurarSesion() {
  const guardada = sesionRecordada(storage);
  if (!cliente || !guardada) return;
  const existe = cuentas.some((c) => c.correo === guardada.email);
  if (!existe) { olvidarSesion(storage); return; }
  const numeroIntento = ++intento;
  loginButton.disabled = true;
  aviso('Recuperando tu sesión…');
  let renovada = null;
  try {
    renovada = await cliente.renovarSesion(guardada.refreshToken);
    // Los refresh tokens de Supabase rotan: persistir el nuevo antes
    // de consultar el equipo para no reutilizar uno antiguo por accidente.
    if (numeroIntento !== intento) return;
    guardarSesion(storage, guardada.email, renovada.refreshToken);
    const {equipo, jugadores} = await consultarEquipo(renovada.accessToken);
    if (numeroIntento !== intento) return;
    token = renovada.accessToken;
    venceSesion(renovada);
    entrenador.value = guardada.email;
    recordarEntrenador(storage, guardada.email);
    pintarEquipo(equipo, jugadores);
    mostrarAplicacion();
  } catch (error) {
    if (numeroIntento !== intento) return;
    if (error.status === 400 || error.status === 401) {
      olvidarSesion(storage);
      mostrarAcceso();
      aviso('Tu sesión ha caducado. Introduce el PIN para volver a entrar.');
    } else {
      mostrarAcceso();
      aviso('No se pudo recuperar tu sesión. Comprueba la conexión e inténtalo de nuevo.');
    }
  } finally {
    if (numeroIntento === intento) loginButton.disabled = false;
  }
}

// El móvil puede suspender la PWA: al volver, renovar solo si queda poco
// tiempo de validez. Nunca mostramos datos ajenos mientras recuperamos.
async function renovarSiCaduca() {
  if (!cliente || !token || refrescando || Date.now() + 120000 < venceEn) return;
  const guardada = sesionRecordada(storage);
  if (!guardada) return;
  const numeroIntento = intento;
  const tokenAnterior = token;
  refrescando = true;
  try {
    const renovada = await cliente.renovarSesion(guardada.refreshToken);
    if (numeroIntento !== intento || token !== tokenAnterior) return;
    guardarSesion(storage, guardada.email, renovada.refreshToken);
    token = renovada.accessToken;
    venceSesion(renovada);
  } catch (error) {
    if (numeroIntento !== intento) return;
    if (error.status === 400 || error.status === 401) {
      olvidarSesion(storage);
      mostrarAcceso();
      aviso('La sesión ha caducado. Introduce tu PIN para volver a entrar.');
    }
  } finally {
    refrescando = false;
  }
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void renovarSiCaduca();
});
window.addEventListener('storage', (event) => {
  // Si el usuario cierra sesión en otra pestaña del mismo navegador,
  // se ocultan también aquí sus datos privados.
  if (event.key === SESION_KEY && event.newValue === null && token) {
    ++intento;
    const anterior = token;
    mostrarAcceso();
    aviso('Has salido en otra ventana.');
    if (cliente) void cliente.cerrarSesion(anterior);
  }
});

try {
  cliente = crearCliente(window.MACROLIGA_CONFIG || {});
  aviso('Selecciona un entrenador e introduce su PIN.');
} catch {
  loginButton.disabled = true;
  aviso('La conexión de MACROLIGA no está disponible todavía.');
}

// El PIN nunca se guarda. Para no pedirlo cada vez, solo se conserva
// el token de renovación que emite Supabase en este dispositivo.
mostrarAcceso();
if (cliente) void restaurarSesion();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
