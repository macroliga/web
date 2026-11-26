// CLI de simulación. No tiene conexión a Supabase ni modo APPLY.
import { readFile,mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizarCatalogo, verificarCatalogo } from '../src/domain/catalogo-deportivo.mjs';
import { planificarReparto, verificarReparto } from '../src/domain/reparto-inicial.mjs';
import { descargarCatalogo } from '../src/server/descarga-catalogo.mjs';
import { catalogoFicticio,divisionFicticia } from '../src/demo/catalogo-ficticio.mjs';

const usage='Uso: node scripts/preparar-inicio.mjs --demo [--semilla ...] [--guardar] | (--catalogo archivo.json | --fuente fuente.json) --division division.json [--reglas reglas.json] --semilla ... [--guardar]';
async function json(path) {
  const content=await readFile(path);
  if(content.byteLength>8*1024*1024) throw new Error('Archivo de entrada demasiado grande');
  return JSON.parse(content.toString('utf8'));
}
function argumentos(args) {
  const result={};
  for(let i=0;i<args.length;i++) {
    const key=args[i];
    if(!['--demo','--catalogo','--fuente','--division','--reglas','--semilla','--guardar','--help'].includes(key)||key in result) throw new Error('Argumento inválido o duplicado');
    if(['--demo','--guardar','--help'].includes(key)) result[key]=true;
    else {
      const value=args[++i];
      if(!value||value.startsWith('--')) throw new Error('Falta valor de '+key);
      result[key]=value;
    }
  }
  return result;
}
async function ejecutar() {
  const args=argumentos(process.argv.slice(2));
  if(args['--help']) {console.log(usage);return;}
  if(['--demo','--catalogo','--fuente'].filter(k=>args[k]).length!==1) throw new Error('Seleccionar exactamente un origen');
  const demo=args['--demo'];
  if(demo&&args['--division']) throw new Error('La demostración solo admite equipos ficticios');
  if(!demo&&(!args['--division']||!args['--semilla'])) throw new Error('División y semilla obligatorias');
  let snapshot;
  if(demo) snapshot=catalogoFicticio();
  else if(args['--fuente']) snapshot=await descargarCatalogo(await json(args['--fuente']),{token:process.env.MACROLIGA_CATALOGO_BEARER,tokenOrigin:process.env.MACROLIGA_CATALOGO_TOKEN_ORIGIN});
  else {
    const raw=await json(args['--catalogo']);
    snapshot=raw.snapshotHash?verificarCatalogo(raw):normalizarCatalogo(raw);
  }
  const division=demo?divisionFicticia():await json(args['--division']);
  if(!demo&&snapshot.kind!=='authorized') throw new Error('Para origen ficticio usar --demo, sin equipos reales');
  const rules=args['--reglas']?await json(args['--reglas']):{};
  const plan=planificarReparto(snapshot,division,{...rules,seed:args['--semilla']??'macroliga-ensayo-v1'});
  verificarReparto(snapshot,division,plan);
  const values=plan.allocations.map(t=>BigInt(t.rosterValueCents));
  const cash=plan.allocations.map(t=>BigInt(t.cashCents));
  const minimum=values.reduce((a,b)=>a<b?a:b),maximum=values.reduce((a,b)=>a>b?a:b);
  const summary={modo:'SIMULACIÓN, SIN ESCRITURAS EN SUPABASE',origen:snapshot.kind,proveedor:snapshot.provider,
    temporada:plan.season,catalogo:snapshot.players.length,equipos:plan.allocations.length,
    asignados:plan.allocations.reduce((n,t)=>n+t.players.length,0),libres:plan.unassignedActive,
    patrimonioPorEquipoCentimos:plan.initialWealthCents,valorPlantillaMinCentimos:String(minimum),valorPlantillaMaxCentimos:String(maximum),
    saldoMinCentimos:String(cash.reduce((a,b)=>a<b?a:b)),saldoMaxCentimos:String(cash.reduce((a,b)=>a>b?a:b)),
    diferenciaPlantillasCentimos:plan.rosterSpreadCents,cuotas:plan.rules.slots,huellaCatalogo:snapshot.snapshotHash,huellaPlan:plan.planHash};
  if(args['--guardar']) {
    // Carpeta ignorada por git. No exportar ni sobrescribir datos deportivos.
    const path=resolve('.macroliga-local','arranque-'+plan.planHash+'.json');
    await mkdir(resolve('.macroliga-local'),{recursive:true,mode:0o700});
    await writeFile(path,JSON.stringify({snapshot,division,plan},null,2)+'\n',{flag:'wx',mode:0o600});
    summary.archivo=path;
  }
  console.log(JSON.stringify(summary,null,2));
}
ejecutar().catch(error=>{console.error('No se preparó el reparto: '+error.message);console.error(usage);process.exitCode=1;});
