// Diagnóstico local: solo stdin y resultados agregados. Sin archivos, API ni DB.
import {readFileSync} from 'node:fs';
import {normalizarCatalogo,POSICIONES} from '../src/domain/catalogo-deportivo.mjs';
import {planificarReparto,verificarReparto} from '../src/domain/reparto-inicial.mjs';
import {divisionFicticia} from '../src/demo/catalogo-ficticio.mjs';

export function previsualizar(raw) {
  if(raw?.kind!=='diagnostic'||raw?.provider!=='comuniazo'||raw?.competition!=='LALIGA'||raw?.season!=='2026_27') {
    throw Error('Solo lectura pública de diagnóstico de la temporada');
  }
  const snap=normalizarCatalogo(raw,{allowDiagnostic:true});
  const division=divisionFicticia();
  const plan=planificarReparto(snap,division,{seed:'comuniazo-html-vista-previa'});
  verificarReparto(snap,division,plan);
  const assigned=new Set(plan.allocations.flatMap(t=>t.players.map(p=>p.externalId)));
  const free=snap.players.filter(p=>p.active&&BigInt(p.marketValueCents)>0n&&!assigned.has(p.externalId));
  const quotas={GK:2,DEF:5,MID:5,FWD:3};
  const freeByPosition=Object.fromEntries(POSICIONES.map(p=>[p,free.filter(x=>x.position===p).length]));
  if(POSICIONES.some(p=>freeByPosition[p]<quotas[p])) throw Error('No hay reserva variada 2/5/5/3 tras el reparto');
  const values=plan.allocations.map(t=>BigInt(t.rosterValueCents)).sort((a,b)=>a<b?-1:a>b?1:0);
  return {mode:'DIAGNÓSTICO EN MEMORIA, SIN IMPORTACIÓN',teams:plan.allocations.length,assigned:assigned.size,
    availableComputer:free.length,freeByPosition,wealthCents:plan.initialWealthCents,rosterMinCents:String(values[0]),
    rosterMaxCents:String(values.at(-1)),spreadCents:plan.rosterSpreadCents,rosterSlots:plan.rules.slots,
    marketFeasible:15,marketSlots:quotas};
}
try {
  const raw=JSON.parse(readFileSync(0,'utf8'));
  console.log(JSON.stringify(previsualizar(raw)));
} catch(error) {
  // No reproducir filas ni enlaces en la consola.
  console.error('Vista previa rechazada: '+error.message);
  process.exitCode=1;
}
