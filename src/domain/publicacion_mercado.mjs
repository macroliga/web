/**
 * MACROLIGA · simulador verificable de publicación ATÓMICA de mercado.
 * NO escribe dinero real ni sustituye la futura transacción PostgreSQL.
 * Si detecta una inconsistencia, aborta TODO el lote: NUNCA elige un «segundo ganador».
 */
import { calcularGanadores } from './mercado.mjs';

/**
 * Estado simulado:
 * {
 *   equipos: Map<id,{saldoCentimos:bigint,jugadores:Set<id>,maximoFutbolistas:number}>,
 *   propietarios: Map<jugadorId,equipoId>,
 *   publicaciones: Set<cicloId>,
 *   movimientos: Array<{clave, ...}>
 * }
 *
 * Plan: {cicloId, publicaEn, pujasAdmitidas, lotes: Array<{loteId,jugadorId}>}.
 */
export function publicarCicloSimulado(estado, plan, ahoraUtc) {
  if (estado.publicaciones.has(plan.cicloId)) {
    return {estado, nuevosMovimientos:0, yaPublicado:true};
  }
  if (new Date(ahoraUtc).getTime() < new Date(plan.publicaEn).getTime()) {
    throw new Error('PUBLICACION_PREMATURA: la adjudicación aún no debe ser visible');
  }
  const equipos = new Map([...estado.equipos.entries()].map(([id, e])=>[
    id, {...e, jugadores: new Set(e.jugadores)}
  ]));
  const propietarios = new Map(estado.propietarios);
  const publicaciones = new Set(estado.publicaciones);
  const movimientos = [...estado.movimientos];
  const lotes = new Map(plan.lotes.map(l => [l.loteId, l]));
  if (lotes.size !== plan.lotes.length) throw new Error('INCONSISTENCIA: lote duplicado en el ciclo');
  const ganadores = calcularGanadores(plan.pujasAdmitidas);
  for (const {loteId, ganador} of ganadores) {
    const lote=lotes.get(loteId);
    if (!lote) throw new Error('INCONSISTENCIA: puja de lote ajeno al ciclo');
    if (propietarios.has(lote.jugadorId)) throw new Error('INCONSISTENCIA: futbolista ya adjudicado');
    const equipo=equipos.get(ganador.teamId);
    if (!equipo) throw new Error('INCONSISTENCIA: equipo inexistente');
    if (equipo.jugadores.size >= equipo.maximoFutbolistas) throw new Error('INCONSISTENCIA: plantilla excedería el máximo');
    // Ya validada cuando se presentó la puja: si surge una anomalía, abortar,
    // nunca resolver un «siguiente ganador» durante la publicación.
    equipo.saldoCentimos -= ganador.importeCentimos;
    equipo.jugadores.add(lote.jugadorId);
    propietarios.set(lote.jugadorId,ganador.teamId);
    movimientos.push({clave:`mercado:${plan.cicloId}:${loteId}`, equipoId:ganador.teamId,
      jugadorId:lote.jugadorId, deltaCentimos:-ganador.importeCentimos});
  }
  publicaciones.add(plan.cicloId);
  return {estado:{equipos,propietarios,publicaciones,movimientos},
    nuevosMovimientos:ganadores.length,yaPublicado:false};
}
