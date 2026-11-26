import { crearCliente } from './api.mjs';
import { mercadoAbierto, equipoMaloAbierto, euros } from './logic.mjs';

const buscar = (id) => document.getElementById(id);
const correo = buscar('email');
const clave = buscar('password');
const entrar = buscar('login-button');
const salir = buscar('logout-button');
const formulario = buscar('login-form');
const mensaje = buscar('login-message');
let cliente = null;
let token = null;

function aviso(texto) { mensaje.textContent = texto; }

function horarios() {
  const mercado = mercadoAbierto();
  const malo = equipoMaloAbierto();
  buscar('market-status').textContent = mercado ? 'Horario abierto' : 'Cerrado hasta las 06:00';
  buscar('bad-status').textContent = malo ? 'Horario abierto' : 'Cerrado hasta las 12:00';
  buscar('market-status').closest('.tile').classList.toggle('closed', !mercado);
  buscar('bad-status').closest('.tile').classList.toggle('closed', !malo);
  // Son indicadores de horario, no aseguran que las operaciones esten habilitadas.
}
horarios();
setInterval(horarios, 60000);

function activarSesion(si) {
  correo.disabled = si;
  clave.disabled = si;
  entrar.hidden = si;
  salir.hidden = !si;
}

function limpiarEquipo() {
  buscar('team-division').textContent = 'Sin iniciar sesion';
  buscar('team-name').textContent = 'Tu equipo aparecera aqui';
  for (const id of ['team-balance','team-value','team-players','team-capacity']) {
    buscar(id).textContent = '—';
  }
  const lista = buscar('roster-list');
  lista.replaceChildren();
  const li = document.createElement('li');
  li.textContent = 'Inicia sesion para verla.';
  lista.append(li);
}

function pintarPlantilla(jugadores) {
  const lista = buscar('roster-list');
  lista.replaceChildren();
  if (!Array.isArray(jugadores) || jugadores.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Sin futbolistas asignados todavia.';
    lista.append(li);
    return;
  }
  for (const j of jugadores) {
    const li = document.createElement('li');
    li.textContent = [j.nombre_jugador, j.posicion, j.club,
      euros(j.valor_mercado_centimos)].filter(Boolean).join(' · ');
    lista.append(li); // textContent evita introducir HTML desde datos externos
  }
}

async function cargarEquipo() {
  const filas = await cliente.consultar('macroliga_mi_equipo', {}, token);
  if (!Array.isArray(filas) || filas.length === 0) {
    throw new Error('La cuenta todavia no tiene un equipo asignado.');
  }
  // En el piloto solo existe una division. La estructura ya admite otras.
  const equipo = filas[0];
  buscar('team-division').textContent = equipo.nombre_division;
  buscar('team-name').textContent = equipo.nombre_equipo;
  buscar('team-balance').textContent = euros(equipo.saldo_centimos);
  buscar('team-value').textContent = euros(equipo.valor_plantilla_centimos);
  buscar('team-players').textContent = String(equipo.jugadores) + ' / 16';
  buscar('team-capacity').textContent = euros(equipo.margen_pujas_centimos);
  const plantilla = await cliente.consultar('macroliga_plantilla_equipo',
    { p_equipo_id: equipo.equipo_id }, token);
  pintarPlantilla(plantilla);
  aviso('Sesion iniciada. Hola, ' + equipo.nombre_manager + '.');
}

formulario.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!cliente) return;
  entrar.disabled = true;
  aviso('Comprobando acceso…');
  try {
    token = await cliente.iniciarSesion(correo.value.trim(), clave.value);
    clave.value = '';
    await cargarEquipo();
    activarSesion(true);
  } catch (error) {
    if (token) await cliente.cerrarSesion(token);
    token = null;
    limpiarEquipo();
    aviso(error.message || 'No se pudo iniciar sesion.');
  } finally {
    entrar.disabled = false;
  }
});

salir.addEventListener('click', async () => {
  const actual = token;
  token = null;
  activarSesion(false);
  limpiarEquipo();
  aviso('Sesion cerrada en este dispositivo.');
  if (cliente && actual) await cliente.cerrarSesion(actual);
});

try {
  cliente = crearCliente(window.MACROLIGA_CONFIG || {});
  buscar('connection-state').textContent = 'API configurada';
  aviso('Acceso reservado a cuentas creadas por el administrador.');
} catch {
  entrar.disabled = true;
  buscar('connection-state').textContent = 'Pendiente de configurar';
  aviso('Vista previa sin cuentas reales. Falta configurar la clave publica de la API.');
}
