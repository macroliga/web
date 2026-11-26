// Preparación local sin conexiones y sin escribir en la base de datos.
import {readFile,realpath,writeFile} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepararLoteComuniazo} from '../src/domain/lote-comuniazo.mjs';
try{
 if(process.argv.length!==3)throw Error('Uso: node scripts/preparar-lote-comuniazo.mjs <directorio de descarga en .macroliga-local>');
 const root=await realpath(fileURLToPath(new URL('../.macroliga-local/',import.meta.url))),dir=await realpath(process.argv[2]);
 const rel=relative(root,dir);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(rel.split('/').at(-1))||isAbsolute(rel)||rel.startsWith('..'))throw Error('Directorio privado de descarga inválido');
 const json=async file=>JSON.parse(await readFile(join(dir,file),'utf8'));
 const lote=prepararLoteComuniazo(await json('catalogo.json'),await json('informe-deportivo.json'));
 await writeFile(join(dir,'lote-importacion.json'),JSON.stringify(lote)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({mode:'VALIDADO LOCALMENTE; NO IMPORTADO',active:lote.puntos.length,snapshotHash:lote.catalogo.snapshotHash}));
}catch(error){console.error('Lote no preparado:',error.message);process.exitCode=1;}
