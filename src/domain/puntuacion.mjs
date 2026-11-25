/** MACROLIGA · reglas puras de puntuación y premios. */
export const PENALIZACION_HUECO = -4;
export const CENTIMOS_POR_PUNTO = 1_000_000n; // 10 000 euros
export const PREMIOS_TRES_ULTIMOS_CENTIMOS = [150_000_000n, 100_000_000n, 50_000_000n];

/**
 * slots: exactamente 11 elementos. Cada uno es null (hueco), o
 * { playerId: string, points: integer | null } (null = aún pendiente de publicar).
 */
export function calcularPuntuacionOnce(slots, saldoAlInicioCentimos) {
  if (!Array.isArray(slots) || slots.length !== 11) throw new TypeError('Se necesitan exactamente 11 posiciones');
  if (typeof saldoAlInicioCentimos !== 'bigint') throw new TypeError('Saldo inicial debe ser BigInt');
  const ocupados = slots.filter(s => s !== null);
  const huecos = 11 - ocupados.length;
  const pendientes = ocupados.filter(s => s.points === null).length;
  for (const jugador of ocupados) {
    if (!jugador.playerId || !(jugador.points === null || Number.isInteger(jugador.points))) {
      throw new TypeError('Futbolista o puntuación incorrectos');
    }
  }
  if (saldoAlInicioCentimos < 0n) {
    return { puntos: 0, huecos, pendientes, definitiva: pendientes === 0,
      motivo: 'SALDO_NEGATIVO' };
  }
  if (ocupados.length === 0) {
    return { puntos: 0, huecos: 11, pendientes: 0, definitiva: true, motivo: 'ONCE_VACIO' };
  }
  const total = ocupados.reduce((suma, s) => suma + (s.points ?? 0), PENALIZACION_HUECO * huecos);
  return { puntos: total, huecos, pendientes, definitiva: pendientes === 0,
    motivo: pendientes > 0 ? 'PENDIENTE_DATOS' : 'NORMAL' };
}

export function premioPorPuntos(puntos) {
  if (!Number.isInteger(puntos)) throw new TypeError('Puntos no enteros');
  return BigInt(Math.max(0, puntos)) * CENTIMOS_POR_PUNTO;
}

/**
 * Puntúa los tres peores de LA JORNADA. Empates: peor puesto en la general previa.
 * No se inventa desempate adicional cuando ambas posiciones previas coinciden.
 */
export function premiosPorUltimos(resultados) {
  if (!Array.isArray(resultados) || resultados.length < 3) throw new RangeError('Se necesitan al menos 3 equipos');
  const ordenados = [...resultados].sort((a, b) =>
    a.puntos - b.puntos || b.puestoGeneralAnterior - a.puestoGeneralAnterior ||
    String(a.equipoId).localeCompare(String(b.equipoId)));
  for (let i = 1; i < ordenados.length; i++) {
    if (ordenados[i].puntos === ordenados[i - 1].puntos &&
        ordenados[i].puestoGeneralAnterior === ordenados[i - 1].puestoGeneralAnterior) {
      throw new Error('DESEMPATE_SECUNDARIO_PENDIENTE: dos equipos comparten puntos y puesto previo');
    }
  }
  return new Map(ordenados.slice(0, 3).map((r, i) => [r.equipoId, PREMIOS_TRES_ULTIMOS_CENTIMOS[i]]));
}

/** Correcciones: devolución/cobro por diferencia, nunca pago completo duplicado. */
export function ajustarPremio(pagadoAnteriorCentimos, premioRecalculadoCentimos) {
  if (typeof pagadoAnteriorCentimos !== 'bigint' || typeof premioRecalculadoCentimos !== 'bigint') {
    throw new TypeError('Los importes deben ser BigInt');
  }
  if (pagadoAnteriorCentimos < 0n || premioRecalculadoCentimos < 0n) {
    throw new RangeError('Un premio acumulado no puede ser negativo');
  }
  return premioRecalculadoCentimos - pagadoAnteriorCentimos;
}
