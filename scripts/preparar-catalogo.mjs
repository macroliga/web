// Descarga/normaliza exclusivamente el catálogo. No crea plantillas ni toca Supabase.
import {readFile,writeFile} from 'node:fs/promises';
import {normalizarCatalogo,verificarCatalogo} from '../src/domain/catalogo-deportivo.mjs';
import {descargarCatalogo} from '../src/server/descarga-catalogo.mjs';

const usage='Uso: node scripts/preparar-catalogo.mjs (--catalogo archivo.json | --fuente fuente.json) --salida catalogo-validado.json';
const args={};
try {
  for(let i=2;i<process.argv.length;i+=2){
    const key=process.argv[i],value=process.argv[i+1];
    if(!['--catalogo','--fuente','--salida'].includes(key)||!value||value.startsWith('--')||key in args)throw Error(usage);
    args[key]=value;
  }
  if(Boolean(args['--catalogo'])===Boolean(args['--fuente'])||!args['--salida'])throw Error(usage);
  const json=async file=>JSON.parse(await readFile(file,'utf8'));
  let snapshot;
  if(args['--fuente']) snapshot=await descargarCatalogo(await json(args['--fuente']),{token:process.env.MACROLIGA_CATALOGO_BEARER,tokenOrigin:process.env.MACROLIGA_CATALOGO_TOKEN_ORIGIN});
  else{
    const raw=await json(args['--catalogo']);
    snapshot=raw.snapshotHash?verificarCatalogo(raw):normalizarCatalogo(raw);
  }
  if(snapshot.kind!=='authorized')throw Error('Solo se genera un catálogo de carga desde un origen autorizado.');
  // No incluir un expediente de reparto ni sobrescribir archivos existentes.
  await writeFile(args['--salida'],JSON.stringify(snapshot,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({players:snapshot.players.length,provider:snapshot.provider,competition:snapshot.competition,season:snapshot.season,snapshotHash:snapshot.snapshotHash,mode:'CATÁLOGO PREPARADO; SIN ESCRITURAS EN SUPABASE'}));
} catch(error){console.error('No se ha preparado el catálogo:',error.message);process.exitCode=1;}
