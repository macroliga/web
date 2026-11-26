import { crearCliente } from './api.mjs';
import { euros } from './logic.mjs';
import { cuentasDemostracion } from './entrenadores.mjs';

// El contenido privado permanece oculto hasta validar nombre + PIN en Supabase.
const el = (id) => document.getElementById(id);
const loginView = el('login-view');
const privateView = el('private-view');
const loginForm = el('login-form');
const entrenador = el('manager-select');
const pin = el('password');
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
for (const cuenta of cuentas) {
  const opcion = document.createElement('option');
  opcion.value = cuenta.correo;
  opcion.textContent = cuenta.entrenador;
  entrenador.appendChild(opcion);
}
pin.addEventListener('input', () => {
  pin.value = pin.value.replace(/\D/g, '').slice(0, 6);
});
for (const boton of document.querySelectorAll('[data-view]')) {
  boton.addEventListener('click', () => cambiarVista(boton.dataset.view));
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!cliente || token) return;
  const cuenta = cuentas.find((c) => c.correo === entrenador.value);
  if (!cuenta) { aviso('Selecciona tu entrenador.'); return; }
  if (!/^\d{6}$/.test(pin.value)) { aviso('Introduce un PIN de seis cifras.'); return; }
  const numeroIntento = ++intento;
  loginButton.disabled = true;
  aviso('Comprobando PIN…');
  let nuevoToken = null;
  try {
    nuevoToken = await cliente.iniciarSesion(cuenta.correo, pin.value);
    const equipos = await cliente.consultar('macroliga_mi_equipo', {}, nuevoToken);
    if (!Array.isArray(equipos) || equipos.length !== 1) {
      throw new Error('No se ha encontrado un único equipo para este entrenador.');
    }
    const equipo = equipos[0];
    const jugadores = await cliente.consultar('macroliga_plantilla_equipo',
      {p_equipo_id: equipo.equipo_id}, nuevoToken);
    if (!Array.isArray(jugadores)) throw new Error('No se pudo consultar la plantilla.');
    if (numeroIntento !== intento) {
      await cliente.cerrarSesion(nuevoToken);
      return;
    }
    token = nuevoToken;
    pintarEquipo(equipo, jugadores);
    mostrarAplicacion();
  } catch (error) {
    if (nuevoToken) await cliente.cerrarSesion(nuevoToken);
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
  mostrarAcceso();
  loginForm.reset();
  aviso('Has salido. Elige un entrenador para volver a entrar.');
  if (anterior && cliente) void cliente.cerrarSesion(anterior);
});

try {
  cliente = crearCliente(window.MACROLIGA_CONFIG || {});
  aviso('Selecciona un entrenador e introduce su PIN.');
} catch {
  loginButton.disabled = true;
  aviso('La conexión de MACROLIGA no está disponible todavía.');
}

// No se guardan contraseñas ni tokens en localStorage o cookies de la PWA.
mostrarAcceso();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
