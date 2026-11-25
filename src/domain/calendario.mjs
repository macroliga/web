/**
 * MACROLIGA · cálculo del cierre de alineaciones sobre partidos de una jornada.
 * Las fechas deben venir como instantes UTC validados por la fuente de calendario.
 * Este módulo NO descarga horarios ni reemplaza las comprobaciones del servidor.
 */
// Nunca inferir un inicio a partir de estados desconocidos del proveedor.
// La fuente principal devuelve estados en MAYÚSCULAS; otras pueden usar minúsculas.
const ESTADOS_CON_PARTIDO = new Set([
  'SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED', 'FINISHED',
  'LIVE', 'PLAYING', 'IN_PROGRESS',
]);
export function comienzoDeJornada(partidos) {
  if (!Array.isArray(partidos)) throw new TypeError('Partidos inválidos');
  const candidatos=[];
  for (const p of partidos) {
    if (typeof p?.estado !== 'string' ||
        !ESTADOS_CON_PARTIDO.has(p.estado.trim().toUpperCase())) continue;
    if (!p.horarioConfirmado || !p.inicioUtc) continue;
    const tiempo = new Date(p.inicioUtc).getTime();
    if (!Number.isFinite(tiempo)) throw new TypeError('Fecha de partido inválida');
    candidatos.push(tiempo);
  }
  return candidatos.length ? new Date(Math.min(...candidatos)).toISOString() : null;
}

export function estadoAlineacion(instanteServidorUtc, instanteCierreUtc) {
  if (!instanteCierreUtc) return 'PENDIENTE_DE_CONFIRMAR';
  const ahora = new Date(instanteServidorUtc).getTime();
  const cierre = new Date(instanteCierreUtc).getTime();
  if (!Number.isFinite(ahora) || !Number.isFinite(cierre)) throw new TypeError('Fechas inválidas');
  return ahora < cierre ? 'ABIERTA' : 'BLOQUEADA';
}

export function cuentaAtras(instanteServidorUtc, instanteCierreUtc) {
  if (!instanteCierreUtc) return null;
  const ahora = new Date(instanteServidorUtc).getTime();
  const cierre = new Date(instanteCierreUtc).getTime();
  if (!Number.isFinite(ahora) || !Number.isFinite(cierre)) throw new TypeError('Fechas inválidas');
  const diferencia = Math.max(0, cierre - ahora);
  const totalSegundos = Math.floor(diferencia / 1000);
  return {
    dias: Math.floor(totalSegundos / 86400),
    horas: Math.floor(totalSegundos % 86400 / 3600),
    minutos: Math.floor(totalSegundos % 3600 / 60),
    segundos: totalSegundos % 60,
  };
}
