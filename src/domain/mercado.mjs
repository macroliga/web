/**
 * MACROLIGA · Reglas PURAS del mercado (sin acceso a base de datos).
 * Dinero siempre expresado en céntimos mediante BigInt.
 * Producción: la autoridad final estará en RPC transaccionales de PostgreSQL.
 */
export class ReglaDeJuegoError extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'ReglaDeJuegoError';
    this.codigo = codigo;
  }
}

function comprobarEnteroNoNegativo(valor, nombre) {
  if (typeof valor !== 'bigint' || valor < 0n) {
    throw new TypeError(`${nombre} debe ser un BigInt no negativo expresado en céntimos`);
  }
}

/** El 25 % se calcula sobre el valor ACTUAL de la plantilla, no sobre el patrimonio. */
export function capacidadEconomica({ saldoCentimos, valorPlantillaCentimos, porcentajeDeuda = 25n }) {
  if (typeof saldoCentimos !== 'bigint') throw new TypeError('saldoCentimos debe ser BigInt');
  comprobarEnteroNoNegativo(valorPlantillaCentimos, 'valorPlantillaCentimos');
  comprobarEnteroNoNegativo(porcentajeDeuda, 'porcentajeDeuda');
  if (porcentajeDeuda > 100n) throw new RangeError('Porcentaje de deuda no válido');
  const deudaMaximaCentimos = valorPlantillaCentimos * porcentajeDeuda / 100n;
  return { deudaMaximaCentimos, limiteTotalCentimos: saldoCentimos + deudaMaximaCentimos };
}

/**
 * Valida la oferta ANTES de registrarla. Todas las pujas activas consumen dinero y plazas.
 * No hay prioridades de compra ni se aceptan pujas «condicionalmente válidas».
 */
export function validarPuja({ saldoCentimos, valorPlantillaCentimos, futbolistasEnPlantilla,
  pujasActivasCentimos, importeNuevoCentimos, maximoFutbolistas = 16,
  porcentajeDeuda = 25n }) {
  comprobarEnteroNoNegativo(importeNuevoCentimos, 'importeNuevoCentimos');
  if (importeNuevoCentimos === 0n) throw new ReglaDeJuegoError('IMPORTE', 'La puja debe ser mayor que cero');
  if (!Number.isInteger(futbolistasEnPlantilla) || futbolistasEnPlantilla < 0 ||
      !Number.isInteger(maximoFutbolistas) || maximoFutbolistas < 1) {
    throw new TypeError('Número de futbolistas o máximo inválido');
  }
  if (!Array.isArray(pujasActivasCentimos)) throw new TypeError('pujasActivasCentimos debe ser un array');
  for (const importe of pujasActivasCentimos) comprobarEnteroNoNegativo(importe, 'puja activa');
  const { limiteTotalCentimos, deudaMaximaCentimos } = capacidadEconomica({
    saldoCentimos, valorPlantillaCentimos, porcentajeDeuda,
  });
  const comprometidoCentimos = pujasActivasCentimos.reduce((total, importe) => total + importe, 0n);
  const disponibleCentimos = limiteTotalCentimos - comprometidoCentimos;
  if (futbolistasEnPlantilla + pujasActivasCentimos.length >= maximoFutbolistas) {
    throw new ReglaDeJuegoError('SIN_PLAZAS', 'No quedan plazas libres para otra puja');
  }
  if (importeNuevoCentimos > disponibleCentimos) {
    throw new ReglaDeJuegoError('LIMITE_ECONOMICO', 'La nueva puja supera el saldo más el 25 % de crédito de plantilla menos las ofertas activas');
  }
  return { valido: true, limiteTotalCentimos, deudaMaximaCentimos,
    comprometidoAntesCentimos: comprometidoCentimos,
    comprometidoDespuesCentimos: comprometidoCentimos + importeNuevoCentimos,
    plazasRestantesDespues: maximoFutbolistas - futbolistasEnPlantilla - pujasActivasCentimos.length - 1 };
}

/**
 * Orden: importe descendente; empate por marca de tiempo y secuencia
 * monotónica del servidor (bids.submission_order). Si ambas marcas temporales
 * coinciden, no usar un UUID aleatorio para decidir quién fue primero.
 */
export function ordenarPujasDeLote(pujas) {
  if (!Array.isArray(pujas)) throw new TypeError('Se esperaba una lista de pujas');
  for (const p of pujas) {
    if (typeof p.importeCentimos !== 'bigint' || p.importeCentimos <= 0n) {
      throw new TypeError('Importe de puja incorrecto');
    }
    if (!Number.isFinite(new Date(p.registradaEn).getTime())) {
      throw new TypeError('Fecha de puja inválida');
    }
  }
  return [...pujas].sort((a, b) => {
    if (a.importeCentimos !== b.importeCentimos) return a.importeCentimos > b.importeCentimos ? -1 : 1;
    const ta = new Date(a.registradaEn).getTime();
    const tb = new Date(b.registradaEn).getTime();
    if (ta !== tb) return ta - tb;
    const sa = a.secuenciaRegistro;
    const sb = b.secuenciaRegistro;
    if (!(typeof sa === 'bigint' || Number.isSafeInteger(sa)) ||
        !(typeof sb === 'bigint' || Number.isSafeInteger(sb))) {
      throw new Error('PRIORIDAD_NO_DETERMINABLE: dos pujas comparten instante sin secuencia');
    }
    if (BigInt(sa) === BigInt(sb)) {
      throw new Error('PRIORIDAD_NO_DETERMINABLE: secuencias duplicadas');
    }
    return BigInt(sa) < BigInt(sb) ? -1 : 1;
  });
}

/**
 * Cálculo de resultados a partir de la instantánea de pujas YA ADMITIDAS a la 01:00.
 * La publicación a las 06:00 es otro paso, atómico, pendiente de función SQL.
 * No se buscan segundos ganadores por «oferta inválida».
 */
export function calcularGanadores(pujasAdmitidas) {
  const porLote = new Map();
  for (const p of pujasAdmitidas) {
    if (p.estado !== 'active') continue;
    if (typeof p.importeCentimos !== 'bigint' || p.importeCentimos <= 0n) throw new TypeError('Puja admitida con importe incorrecto');
    const lista = porLote.get(p.loteId) ?? [];
    lista.push(p);
    porLote.set(p.loteId, lista);
  }
  return [...porLote.entries()].map(([loteId, pujas]) => ({
    loteId, ganador: ordenarPujasDeLote(pujas)[0], numeroPujas: pujas.length,
  })).sort((a, b) => String(a.loteId).localeCompare(String(b.loteId)));
}

export function puedePresentarPujaEnCiclo(instante, ciclo) {
  const t = new Date(instante).getTime();
  return ciclo.estado === 'open' && t >= new Date(ciclo.abreEn).getTime() && t < new Date(ciclo.cierraEn).getTime();
}
