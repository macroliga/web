// MACROLIGA · Memoria local del entrenador y de la sesión de ensayo.
// Nunca se guarda el PIN. El refresh token permite reabrir la sesión sin
// volver a autenticar; solo se guarda en el dispositivo del usuario.
// En un dispositivo compartido se debe pulsar «Salir».
export const NOMBRE_KEY = 'macroliga.piloto.nombre.v1';
export const SESION_KEY = 'macroliga.piloto.sesion.v1';

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
export function guardarSesion(storage, email, refreshToken) {
  if (!correoValido(email) || typeof refreshToken !== 'string' ||
      refreshToken.length < 1 || refreshToken.length > 8192) return false;
  return guardar(storage, SESION_KEY, JSON.stringify({
    email, refreshToken
  }));
}
export function sesionRecordada(storage) {
  const raw = obtener(storage, SESION_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!correoValido(data?.email) ||
        typeof data?.refreshToken !== 'string' ||
        data.refreshToken.length < 1 || data.refreshToken.length > 8192) {
      quitar(storage, SESION_KEY);
      return null;
    }
    return {email: data.email, refreshToken: data.refreshToken};
  } catch {
    quitar(storage, SESION_KEY);
    return null;
  }
}
export function olvidarSesion(storage) {
  quitar(storage, SESION_KEY);
}
