// MACROLIGA · PIN temporales del piloto. Solo se generan en un entorno privado.
// Los PIN se entregan al administrador fuera del repositorio y deben cambiarse
// si estas cuentas se reutilizan con personas reales.
import { randomInt } from 'node:crypto';

export function generarPinesUnicos(cantidad = 16, aleatorio = randomInt) {
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 1_000_000) {
    throw new RangeError('Cantidad de PIN fuera de rango');
  }
  const pines = new Set();
  let intentos = 0;
  while (pines.size < cantidad) {
    if (++intentos > cantidad * 100) {
      throw new Error('No se pudieron generar suficientes PIN únicos');
    }
    const numero = aleatorio(0, 1_000_000);
    if (!Number.isInteger(numero) || numero < 0 || numero > 999_999) {
      throw new Error('Generador aleatorio no válido');
    }
    pines.add(String(numero).padStart(6, '0'));
  }
  return [...pines];
}
