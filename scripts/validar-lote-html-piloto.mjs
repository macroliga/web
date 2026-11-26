// Lote de uso privado para el importador de propietario, sin red.
import {readFileSync} from 'node:fs';
import {normalizarCatalogo} from '../src/domain/catalogo-deportivo.mjs';
export function validar(raw) {
  if(raw?.catalogo?.kind!=='public-html')throw Error('Procedencia de propietario obligatoria');
  const catalogo=normalizarCatalogo(raw.catalogo,{allowPublicHtml:true});
  const active=catalogo.players.filter(p=>p.active);
  const ids=new Set(active.map(p=>p.externalId));
  if(active.length<490||new Set(active.map(p=>p.club)).size!==20||catalogo.players.length!==active.length)throw Error('Catálogo HTML incompleto');
  if(!Array.isArray(raw.puntos)||raw.puntos.length!==ids.size)throw Error('Puntos incompletos');
  const puntos=raw.puntos.map(({externalId,points})=>{
    if(!ids.delete(externalId)||!Number.isInteger(points)||points<-(2**31)||points>=2**31)throw Error('Puntos inválidos');
    return {externalId,points};
  }).sort((a,b)=>a.externalId<b.externalId?-1:a.externalId>b.externalId?1:0);
  return {catalogo,puntos};
}
try{
  process.stdout.write(JSON.stringify(validar(JSON.parse(readFileSync(0,'utf8')))));
}catch{
  console.error('Lote HTML incompatible');
  process.exitCode=1;
}
