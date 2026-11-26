// MACROLIGA · Memoria local del entrenador y de la sesión de ensayo.
// Nunca se guarda el PIN. El refresh token permite reabrir la sesión sin
// volver a autenticar; solo se guarda en el dispositivo del usuario.
// En un dispositivo compartido se debe pulsar «Salir».
export const NOMBRE_KEY = 'macroliga.piloto.nombre.v1';
// La v1 rechazaba los tokens de 12 caracteres y podía borrarlos desde
// una pestaña antigua de la PWA. La v2 aísla la sesión corregida.
export const SESION_KEY = 'macroliga.piloto.sesion.v2';
const SESION_ANTERIOR_KEY = 'macroliga.piloto.sesion.v1';

function obtener(storage, clave) {
  try { return storage?.getItem(clave) ?? null; } catch { return null; }
}
function guardar(storage, clave, valor) {
  try { if (!storage) return false; storage.setItem(clave, valor); return storage.getItem(clave) === valor; } catch { return false; }
}
function quitar(storage, clave) {
  try { storage?.removeItem(clave); } catch { /* Almacenamiento deshabilitado */ }
}
function correoValido(email) {
  return typeof email === 'string' && /^demo(?:0[1-9]|1[0-6])@macroliga\.invalid$/.test(email);
}

export function recordarEntrenador(storage, email) {
  if (!correoValido(email)) return false;
  return guardar(storage, NOMBRE_KEY, email);
}
export function entrenadorRecordado(storage) {
  const email = obtener(storage, NOMBRE_KEY);
  return correoValido(email) ? email : null;
}
// El token es opaco: Supabase emite tokens de 12 caracteres, entre otros.
export function refreshValido(token) {
  return typeof token === 'string' && token.length > 0 && token.length <= 8192 && !/\s/.test(token);
}
export function guardarSesion(storage, email, refreshToken) {
  if (!correoValido(email) || !refreshValido(refreshToken)) return false;
  return guardar(storage, SESION_KEY, JSON.stringify({
    email, refreshToken
  }));
}
export function sesionRecordada(storage) {
  const actual = obtener(storage, SESION_KEY);
  const raw = actual ?? obtener(storage, SESION_ANTERIOR_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!correoValido(data?.email) ||
        !refreshValido(data?.refreshToken)) {
      olvidarSesion(storage);
      return null;
    }
    if (actual === null && guardarSesion(storage, data.email, data.refreshToken)) {
      quitar(storage, SESION_ANTERIOR_KEY);
    }
    return {email: data.email, refreshToken: data.refreshToken};
  } catch {
    olvidarSesion(storage);
    return null;
  }
}
export function olvidarSesion(storage) {
  quitar(storage, SESION_KEY);
  quitar(storage, SESION_ANTERIOR_KEY);
}
