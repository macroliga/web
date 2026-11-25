/**
 * Actualización deportiva idempotente por revisión: no sumar puntos a los existentes.
 * Cada entrada es {claveJugadorPartido, revision, puntos}.
 * Los datos se reciben de un proveedor externo autorizado en un futuro conector.
 */
export function aplicarPuntuaciones(snapshot, entradas) {
  if (!(snapshot instanceof Map) || !Array.isArray(entradas)) throw new TypeError('Argumentos inválidos');
  const resultado = new Map(snapshot);
  let nuevas = 0, corregidas = 0, ignoradas = 0;
  for (const entrada of entradas) {
    if (typeof entrada.claveJugadorPartido !== 'string' ||
        entrada.claveJugadorPartido.trim().length === 0 ||
        !Number.isSafeInteger(entrada.revision) || entrada.revision < 1 ||
        !Number.isSafeInteger(entrada.puntos)) {
      throw new TypeError('Puntuación deportiva inválida');
    }
    const anterior = resultado.get(entrada.claveJugadorPartido);
    if (anterior && entrada.revision < anterior.revision) {
      ignoradas++;
      continue;
    }
    if (anterior && entrada.revision === anterior.revision) {
      if (anterior.puntos !== entrada.puntos) {
        throw new Error(`Conflicto de datos: misma revisión con puntos distintos (${entrada.claveJugadorPartido})`);
      }
      ignoradas++;
      continue;
    }
    resultado.set(entrada.claveJugadorPartido, {revision: entrada.revision, puntos: entrada.puntos});
    if (anterior) corregidas++;
    else nuevas++;
  }
  return {resultado,nuevas,corregidas,ignoradas};
}
