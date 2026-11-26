// Reparto reproducible en memoria. Nunca escribe ni activa la liga.
import { POSICIONES, centimos, huella, orden, texto, verificarCatalogo } from './catalogo-deportivo.mjs';

// Propuesta configurable; no constituye todavía una regla aprobada de posiciones.
export const POSICIONES_PROPUESTAS = Object.freeze({GK:2,DEF:5,MID:5,FWD:3});
const valor = p=>BigInt(p.marketValueCents);
const cmpBig = (a,b)=>a<b?-1:a>b?1:0;
const rango = (seed,attempt,key)=>huella([seed,attempt,key]);
const compararPrecio = (a,b)=>cmpBig(valor(a),valor(b))||orden(a.externalId,b.externalId);

function reglasValidas(rules, maxRoster, wealth) {
  const slots = rules.slots??POSICIONES_PROPUESTAS;
  if (Object.keys(slots).length !== 4 || !POSICIONES.every(p=>Number.isSafeInteger(slots[p]) && slots[p]>=0)) {
    throw new TypeError('Cuotas de posición inválidas');
  }
  if (POSICIONES.reduce((n,p)=>n+slots[p],0)!==15 || maxRoster<16) {
    throw new Error('Se requieren 15 futbolistas y al menos una plaza libre');
  }
  const minCash = centimos(rules.minimumCashCents??'0','caja mínima');
  if (minCash>wealth) throw new Error('Caja mínima superior al patrimonio');
  const reserve = rules.reservePlayers??15;
  if (!Number.isSafeInteger(reserve)||reserve<0||reserve>20000) throw new TypeError('Reserva inválida');
  return {slots:Object.fromEntries(POSICIONES.map(p=>[p,slots[p]])),minimumCashCents:minCash.toString(),reservePlayers:reserve};
}
function ordenAleatorio(players,seed,i) {
  return players.map(p=>({p,rank:rango(seed,i,p.externalId)}))
    .sort((a,b)=>orden(a.rank,b.rank)||orden(a.p.externalId,b.p.externalId)).map(row=>row.p);
}
function asignar(seleccion, teams, rules, budget, seed, attempt) {
  const result=teams.map(id=>({teamId:id,players:[],total:0n,counts:Object.fromEntries(POSICIONES.map(p=>[p,0])),rank:rango(seed,attempt,id)}));
  // Primero los puestos que concentran jugadores caros. Reparte de mayor a
  // menor valor y favorece a la plantilla menos valorada que tenga hueco.
  const positions=POSICIONES.slice().sort((a,b)=>{
    const va=seleccion[a].reduce((n,p)=>n+valor(p),0n);
    const vb=seleccion[b].reduce((n,p)=>n+valor(p),0n);
    return cmpBig(vb,va)||orden(a,b);
  });
  for (const pos of positions) {
    for (const player of seleccion[pos].slice().sort((a,b)=>compararPrecio(b,a))) {
      const eligible=result.filter(t=>t.counts[pos]<rules.slots[pos]&&t.total+valor(player)<=budget)
        .sort((a,b)=>cmpBig(a.total,b.total)||orden(a.rank,b.rank)||orden(a.teamId,b.teamId));
      if (!eligible.length) return null;
      const team=eligible[0];
      team.players.push(player);team.total+=valor(player);team.counts[pos]++;
    }
  }
  return result;
}

export function planificarReparto(snapshot, division, options={}) {
  const catalog=verificarCatalogo(snapshot);
  if (division?.status!=='draft' || division.season!==catalog.season ||
      !Number.isSafeInteger(division.maxRoster)||division.maxRoster>30 ||
      !Array.isArray(division.teamIds)||division.teamIds.length===0||division.teamIds.length>64) {
    throw new Error('La división debe estar en borrador y coincidir con la temporada');
  }
  const divisionId=texto(division.divisionId,'división');
  const teams=division.teamIds.map(t=>texto(t,'equipo')).sort(orden);
  if (new Set(teams).size!==teams.length) throw new Error('Equipo duplicado');
  const wealth=centimos(division.initialWealthCents,'patrimonio');
  const seed=texto(options.seed,'semilla',200);
  const rules=reglasValidas(options,division.maxRoster,wealth);
  const budget=wealth-BigInt(rules.minimumCashCents);
  const active=catalog.players.filter(p=>p.active);
  if (active.length-teams.length*15<rules.reservePlayers) throw new Error('Faltan futbolistas para la reserva de mercado');
  const pools={};
  const cheapest={};
  for(const p of POSICIONES) {
    const need=teams.length*rules.slots[p];
    pools[p]=active.filter(x=>x.position===p&&valor(x)<=budget).sort(compararPrecio);
    if(pools[p].length<need) throw new Error('Insuficientes futbolistas elegibles en '+p);
    cheapest[p]=pools[p].slice(0,need);
  }
  const sum = sel=>POSICIONES.flatMap(p=>sel[p]).reduce((n,p)=>n+valor(p),0n);
  if(sum(cheapest)>budget*BigInt(teams.length)) throw new Error('El coste mínimo agregado supera el patrimonio disponible');
  let best=null, bestSpread=null, bestAttempt=null;
  // Varios sorteos deterministas. Si los elegidos superan el presupuesto
  // global, se sustituyen jugadores caros por alternativas de su posición.
  // No aumenta patrimonio, inventa precios ni admite saldo negativo.
  for(let attempt=0;attempt<48;attempt++) {
    // El conjunto más barato solo es respaldo si ningún sorteo fue viable.
    if(attempt===47&&best) break;
    const selected={};
    const reserve={};
    for(const p of POSICIONES) {
      const n=teams.length*rules.slots[p];
      const shuffled=attempt===47?pools[p]:ordenAleatorio(pools[p],seed,attempt);
      selected[p]=shuffled.slice(0,n);
      reserve[p]=shuffled.slice(n).sort(compararPrecio);
    }
    let total=sum(selected);
    const cap=budget*BigInt(teams.length);
    while(total>cap) {
      let swap=null;
      for(const p of POSICIONES) {
        if(!selected[p].length||!reserve[p].length) continue;
        const expensive=selected[p].reduce((a,b)=>compararPrecio(a,b)>=0?a:b);
        const saving=valor(expensive)-valor(reserve[p][0]);
        if(saving>0n&&(!swap||saving>swap.saving)) swap={p,expensive,saving};
      }
      if(!swap) break;
      const {p,expensive,saving}=swap;
      selected[p][selected[p].indexOf(expensive)]=reserve[p].shift();
      total-=saving;
    }
    if(total>cap) continue;
    const candidate=asignar(selected,teams,rules,budget,seed,attempt);
    if(!candidate) continue;
    const totals=candidate.map(t=>t.total).sort(cmpBig);
    const spread=totals.at(-1)-totals[0];
    // Mantener el mejor equilibrio hallado. Si empatan, el primer sorteo.
    if(best===null||spread<bestSpread) {best=candidate;bestSpread=spread;bestAttempt=attempt;}
  }
  if(!best) throw new Error('No se encontró un reparto viable con estas cuotas; revisar presupuesto o catálogo');
  const allocations=best.sort((a,b)=>orden(a.teamId,b.teamId)).map(t=>({
    teamId:t.teamId, players:t.players.map(p=>({externalId:p.externalId,position:p.position,marketValueCents:p.marketValueCents})).sort((a,b)=>orden(a.externalId,b.externalId)),
    rosterValueCents:t.total.toString(), cashCents:(wealth-t.total).toString(), wealthCents:wealth.toString()
  }));
  const assigned=new Set(allocations.flatMap(t=>t.players.map(p=>p.externalId)));
  if(assigned.size!==teams.length*15||allocations.some(t=>t.players.length!==15)) throw new Error('Invariante de reparto rota');
  const plan={schemaVersion:1,mode:'preview',catalogKind:catalog.kind,provider:catalog.provider,snapshotHash:catalog.snapshotHash,
    divisionId,season:division.season,maxRoster:division.maxRoster,initialWealthCents:wealth.toString(),seed,rules,
    attempt:bestAttempt,rosterSpreadCents:bestSpread.toString(),allocations,unassignedActive:active.length-assigned.size};
  return {...plan,planHash:huella(plan)};
}

export function verificarReparto(snapshot, division, plan) {
  // Recalcular de forma determinista; ninguna asignación del cliente es fiable.
  const expected=planificarReparto(snapshot,division,{seed:plan.seed,...plan.rules});
  if(huella(plan)!==huella(expected)) throw new Error('Plan alterado o incompatible con el catálogo/división');
  return expected;
}
