// Integración de red HTTPS local. Requiere openssl; no llama a un proveedor real.
import {createServer} from 'node:https';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {catalogoFicticio,divisionFicticia} from '../src/demo/catalogo-ficticio.mjs';

const dir=await mkdtemp(join(tmpdir(),'macroliga-https-'));
let server;
try {
  const key=join(dir,'key.pem'),cert=join(dir,'cert.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost',
    '-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-keyout',key,'-out',cert],{stdio:'ignore'});
  const sourceRaw={...catalogoFicticio(),kind:'authorized',provider:'servidor-formato-test',permissionRef:'Simulación local autorizada'};
  delete sourceRaw.snapshotHash;
  let calls=0;
  server=createServer({key:await readFile(key),cert:await readFile(cert)},(req,res)=>{
    calls++;
    assert.equal(req.method,'GET');
    assert.equal(req.headers.authorization,undefined);
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify(sourceRaw));
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin='https://127.0.0.1:'+server.address().port;
  await writeFile(join(dir,'fuente.json'),JSON.stringify({authorized:true,url:origin+'/catalogo.json',allowedOrigin:origin,
    provider:sourceRaw.provider,competition:sourceRaw.competition,season:sourceRaw.season,permissionRef:sourceRaw.permissionRef}));
  await writeFile(join(dir,'division.json'),JSON.stringify(divisionFicticia()));
  const run=spawn(process.execPath,['scripts/preparar-inicio.mjs','--fuente',join(dir,'fuente.json'),'--division',
    join(dir,'division.json'),'--semilla','red-local'],{env:{...process.env,NODE_EXTRA_CA_CERTS:cert},stdio:['ignore','pipe','pipe']});
  let out='',err='';
  run.stdout.on('data',b=>out+=b);run.stderr.on('data',b=>err+=b);
  const code=await new Promise((resolve,reject)=>{run.on('error',reject);run.on('close',resolve);});
  assert.equal(code,0,err);
  const result=JSON.parse(out);
  assert.equal(calls,1);assert.equal(result.catalogo,500);assert.equal(result.asignados,240);
  assert.equal(result.patrimonioPorEquipoCentimos,'7000000000');assert.equal(result.libres,260);
  console.log('PASS descarga HTTPS real y CLI local: 500 fichas ficticias, 240 asignaciones, 260 libres; cero credenciales.');
} finally {if(server) await new Promise(resolve=>server.close(resolve));await rm(dir,{force:true,recursive:true});}
