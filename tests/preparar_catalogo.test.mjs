import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {catalogoFicticio} from '../src/demo/catalogo-ficticio.mjs';
import {normalizarCatalogo,verificarCatalogo} from '../src/domain/catalogo-deportivo.mjs';
const exec=promisify(execFile);
const script=fileURLToPath(new URL('../scripts/preparar-catalogo.mjs',import.meta.url));
test('catálogo independiente: valida y exporta sin división, rechaza fixture, no sobrescribe',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'macroliga-catalogo-test-'));
  try{
    const input=join(dir,'input.json'),output=join(dir,'output.json');
    const fixture=catalogoFicticio();
    await writeFile(input,JSON.stringify(fixture));
    const run=()=>exec(process.execPath,[script,'--catalogo',input,'--salida',output]);
    await assert.rejects(run(),/origen autorizado/);
    const snapshot=normalizarCatalogo({...fixture,kind:'authorized',permissionRef:'Prueba artificial LOCAL, nunca para importar'});
    await writeFile(input,JSON.stringify(snapshot));
    await run();
    assert.deepEqual(verificarCatalogo(JSON.parse(await readFile(output,'utf8'))),snapshot);
    await assert.rejects(run(),/EEXIST/);
    assert.deepEqual(verificarCatalogo(JSON.parse(await readFile(output,'utf8'))),snapshot);
  }finally{await rm(dir,{recursive:true,force:true});}
});
