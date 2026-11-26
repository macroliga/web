// Acepta exclusivamente la pareja de archivos generada en una descarga.
import {verificarCatalogo} from './catalogo-deportivo.mjs';
export function prepararLoteComuniazo(snapshot,report){
 const catalogo=verificarCatalogo(snapshot);
 if(catalogo.kind!=='authorized'||catalogo.provider!=='comuniazo'||catalogo.competition!=='LALIGA'||catalogo.season!=='2026_27')throw Error('Catálogo incompatible o no autorizado');
 if(report?.snapshotHash!==catalogo.snapshotHash||report.asOf!==catalogo.asOf)throw Error('Informe de otra descarga');
 const active=catalogo.players.filter(p=>p.active),ids=new Set(active.map(p=>p.externalId));
 if(report.active!==active.length||report.clubs!==20||active.length<490||new Set(active.map(p=>p.club)).size!==20)throw Error('Cobertura de catálogo incompleta');
 if(!Array.isArray(report.points)||report.points.length!==ids.size)throw Error('Puntos incompletos');
 for(const p of report.points){
  if(!ids.delete(p?.externalId)||!Number.isInteger(p.points)||p.points < -2147483648||p.points>2147483647)throw Error('Puntos inválidos o duplicados');
 }
 return {catalogo,puntos:report.points.map(({externalId,points})=>({externalId,points})).sort((a,b)=>a.externalId<b.externalId?-1:a.externalId>b.externalId?1:0)};
}
