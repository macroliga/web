import test from 'node:test';
import assert from 'node:assert/strict';
import { capacidadEconomica, validarPuja, calcularGanadores, ordenarPujasDeLote, puedePresentarPujaEnCiclo, ReglaDeJuegoError } from '../src/domain/mercado.mjs';
const M = 100_000_000n; // 1 millón EUR expresado en céntimos
const equipo = (p = {}) => ({ saldoCentimos: 10n*M, valorPlantillaCentimos: 50n*M,
  futbolistasEnPlantilla: 12, pujasActivasCentimos: [], importeNuevoCentimos: 1n*M, ...p });

test('50 M valor + 10 M saldo = 22,5 M capacidad agregada', () => {
  assert.deepEqual(capacidadEconomica(equipo()), { deudaMaximaCentimos: 12_500_000_00n, limiteTotalCentimos: 22_500_000_00n });
});
test('una puja que iguala exactamente el límite está permitida', () => {
  assert.equal(validarPuja(equipo({ importeNuevoCentimos: 22_500_000_00n })).valido, true);
});
test('4 pujas de 20 M en total; quinta de 3 M rechazada', () => {
  assert.throws(() => validarPuja(equipo({ pujasActivasCentimos: [6n*M,5n*M,5n*M,4n*M], importeNuevoCentimos: 3n*M, futbolistasEnPlantilla: 10 })),
    e => e instanceof ReglaDeJuegoError && e.codigo === 'LIMITE_ECONOMICO');
});
test('15 jugadores: solo una puja activa', () => {
  assert.equal(validarPuja(equipo({ futbolistasEnPlantilla: 15 })).valido, true);
  assert.throws(() => validarPuja(equipo({ futbolistasEnPlantilla: 15, pujasActivasCentimos: [2n*M] })), e => e.codigo === 'SIN_PLAZAS');
});
test('16 jugadores: ninguna puja', () => {
  assert.throws(() => validarPuja(equipo({ futbolistasEnPlantilla: 16 })), e => e.codigo === 'SIN_PLAZAS');
});
test('14 jugadores: hasta dos pujas activas', () => {
  assert.equal(validarPuja(equipo({ futbolistasEnPlantilla: 14, pujasActivasCentimos: [1n*M] })).plazasRestantesDespues,0);
  assert.throws(() => validarPuja(equipo({ futbolistasEnPlantilla: 14, pujasActivasCentimos: [1n*M,1n*M] })), e => e.codigo === 'SIN_PLAZAS');
});
test('saldos negativos siguen admitiendo crédito hasta el 25 %', () => {
  const c = capacidadEconomica(equipo({ saldoCentimos: -5n*M }));
  assert.equal(c.limiteTotalCentimos, 7_500_000_00n);
});
test('importe exacto en céntimos: fracción del crédito redondeada hacia abajo', () => {
  assert.equal(capacidadEconomica({ saldoCentimos: 0n, valorPlantillaCentimos: 3n }).deudaMaximaCentimos, 0n);
});
test('mayor oferta gana, y empate adjudicado a la primera registrada', () => {
  const p = [
    {id:'2',loteId:'A',teamId:'B',importeCentimos:5n*M,registradaEn:'2026-11-25T09:00:00Z',estado:'active'},
    {id:'1',loteId:'A',teamId:'A',importeCentimos:5n*M,registradaEn:'2026-11-25T08:00:00Z',estado:'active'},
    {id:'3',loteId:'B',teamId:'C',importeCentimos:7n*M,registradaEn:'2026-11-25T09:00:00Z',estado:'active'},
    {id:'4',loteId:'A',teamId:'D',importeCentimos:3n*M,registradaEn:'2026-11-25T07:00:00Z',estado:'withdrawn'}
  ];
  assert.equal(ordenarPujasDeLote(p.slice(0,2))[0].teamId,'A');
  assert.deepEqual(calcularGanadores(p).map(v=>[v.loteId,v.ganador.teamId]),[['A','A'],['B','C']]);
});
test('el mercado corta exactamente en el instante de cierre', () => {
  const ciclo={ estado:'open', abreEn:'2026-11-25T05:00:00Z', cierraEn:'2026-11-26T00:00:00Z' };
  assert.equal(puedePresentarPujaEnCiclo('2026-11-25T05:00:00Z',ciclo),true);
  assert.equal(puedePresentarPujaEnCiclo('2026-11-25T23:59:59Z',ciclo),true);
  assert.equal(puedePresentarPujaEnCiclo('2026-11-26T00:00:00Z',ciclo),false);
});
