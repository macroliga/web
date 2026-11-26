import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarCatalogo, verificarCatalogo, centimos } from '../src/domain/catalogo-deportivo.mjs';
import { planificarReparto, verificarReparto } from '../src/domain/reparto-inicial.mjs';
import { catalogoFicticio, divisionFicticia } from '../src/demo/catalogo-ficticio.mjs';
import { descargarCatalogo } from '../src/server/descarga-catalogo.mjs';
const catalog=catalogoFicticio();
const division=divisionFicticia();
const options={seed:'macroliga-ensayo-v1'};
const clone=()=>structuredClone(catalog);
const real=()=>({...clone(),kind:'authorized',provider:'proveedor-test',permissionRef:'autorización ficticia en test'});
const plan=()=>planificarReparto(catalog,division,options);

test('el catálogo normalizado tiene huella estable sin depender del orden de entrada',()=>{
  const raw=clone();
  raw.players.reverse();
  assert.equal(normalizarCatalogo(raw).snapshotHash,catalog.snapshotHash);
  assert.deepEqual(verificarCatalogo(catalog),catalog);
});
test('rechaza duplicados, datos deportivos incompletos y céntimos inválidos',()=>{
  const dup=clone();dup.players.push(dup.players[0]);assert.throws(()=>normalizarCatalogo(dup),/duplicado/);
  for (const b of [null,undefined,1.1,-1,'1.0','1,00','9223372036854775808',Number.MAX_SAFE_INTEGER+1]) {
    assert.throws(()=>centimos(b));
  }
  const missing=clone();delete missing.players[0].marketValueCents;assert.throws(()=>normalizarCatalogo(missing),/céntimos/);
  const pos=clone();pos.players[0].position='XX';assert.throws(()=>normalizarCatalogo(pos),/Posición/);
  const status=clone();delete status.players[0].active;assert.throws(()=>normalizarCatalogo(status),/Estado/);
  const date=clone();date.asOf='2026-02-30T00:00:00.000Z';assert.throws(()=>normalizarCatalogo(date),/fecha/);
  const curr=clone();curr.currency='USD';assert.throws(()=>normalizarCatalogo(curr),/moneda/);
  const rights=clone();delete rights.permissionRef;assert.throws(()=>normalizarCatalogo(rights),/autorización/);
});
test('detecta una modificación del catálogo firmado por su huella',()=>{
  const changed=clone();changed.players[0].marketValueCents='10';
  assert.throws(()=>verificarCatalogo(changed),/Huella/);
});
test('reparte 240 jugadores distintos; cuotas, reserva y patrimonio exactos en los 16 equipos',()=>{
  const p=plan();
  assert.equal(p.allocations.length,16);
  assert.equal(p.unassignedActive,260);
  const ids=p.allocations.flatMap(x=>x.players.map(y=>y.externalId));
  assert.equal(new Set(ids).size,240);
  for(const t of p.allocations) {
    assert.equal(t.players.length,15);
    assert.equal(t.players.filter(x=>x.position==='GK').length,2);
    assert.equal(t.players.filter(x=>x.position==='DEF').length,5);
    assert.equal(t.players.filter(x=>x.position==='MID').length,5);
    assert.equal(t.players.filter(x=>x.position==='FWD').length,3);
    assert.equal(BigInt(t.rosterValueCents),t.players.reduce((n,x)=>n+BigInt(x.marketValueCents),0n));
    assert.equal(BigInt(t.rosterValueCents)+BigInt(t.cashCents),7000000000n);
    assert.ok(BigInt(t.cashCents)>=0n);
  }
  assert.deepEqual(verificarReparto(catalog,division,p),p);
  assert.equal(p.mode,'preview');
  assert.equal(p.catalogKind,'fixture');
});
test('semilla y entrada canónica producen exactamente el mismo reparto',()=>{
  const a=plan(), b=planificarReparto(normalizarCatalogo({...catalog,players:[...catalog.players].reverse()}),{...division,teamIds:[...division.teamIds].reverse()},options);
  assert.deepEqual(a,b);
  assert.notEqual(a.planHash,planificarReparto(catalog,division,{seed:'otra-semilla'}).planHash);
});
test('en divisiones distintas no se mezclan propietarios; el mismo jugador puede existir en ambas',()=>{
  const a=plan();
  const b=planificarReparto(catalog,{...division,divisionId:'SEGUNDA',teamIds:division.teamIds.map(x=>'B-'+x)},options);
  assert.notEqual(a.planHash,b.planHash);
  assert.ok(b.allocations.every(t=>t.teamId.startsWith('B-')));
  assert.equal(new Set(b.allocations.flatMap(x=>x.players.map(y=>y.externalId))).size,240);
});
test('resguarda el presupuesto por equipo y permite fijar una caja mínima',()=>{
  const p=planificarReparto(catalog,division,{...options,minimumCashCents:'1000000000'});
  assert.ok(p.allocations.every(x=>BigInt(x.cashCents)>=1000000000n));
  assert.throws(()=>planificarReparto(catalog,division,{...options,minimumCashCents:'7000000001'}),/Caja mínima/);
});
test('rechaza catálogo insuficiente, presupuesto inviable, temporada, cuotas y división no válidos',()=>{
  const pc=clone();pc.players=pc.players.map(p=>p.position==='GK'?{...p,active:false}:p);
  assert.throws(()=>planificarReparto(normalizarCatalogo(pc),division,options),/GK/);
  assert.throws(()=>planificarReparto(catalog,{...division,initialWealthCents:'500000000'},options),/coste mínimo|viable|elegibles/);
  assert.throws(()=>planificarReparto(catalog,{...division,status:'active'},options),/borrador/);
  assert.throws(()=>planificarReparto(catalog,{...division,season:'otro'},options),/temporada/);
  assert.throws(()=>planificarReparto(catalog,{...division,maxRoster:15},options),/plaza libre/);
  assert.throws(()=>planificarReparto(catalog,{...division,teamIds:['a','a']},options),/duplicado/);
  assert.throws(()=>planificarReparto(catalog,division,{...options,slots:{GK:1,DEF:1,MID:1,FWD:1}}),/15 futbolistas/);
  assert.throws(()=>planificarReparto(catalog,division,{...options,reservePlayers:261}),/reserva/);
});
test('verificación impide modificar asignación o dinero tras calcular el plan',()=>{
  const p=plan();p.allocations[0].cashCents='7000000000';
  assert.throws(()=>verificarReparto(catalog,division,p),/alterado/);
});
const fuente={authorized:true,url:'https://feed.example.invalid/catalogo.json',allowedOrigin:'https://feed.example.invalid',
  provider:'proveedor-test',competition:'LALIGA',season:'2026_27',permissionRef:'autorización ficticia en test'};
const respuesta=raw=>new Response(JSON.stringify(raw),{headers:{'content-type':'application/json'}});
test('descarga JSON autorizado, verifica metadatos y no reenvía credenciales implícitas',async()=>{
  let calls=0;
  const got=await descargarCatalogo(fuente,{token:'no-debe-enviarse',fetchImpl:async(url,req)=>{
    calls++;assert.equal(url,fuente.url);assert.equal(req.method,'GET');assert.equal(req.redirect,'error');
    assert.equal(req.headers.Authorization,undefined);return respuesta(real());
  }});
  assert.equal(calls,1);
  assert.equal(got.kind,'authorized');assert.equal(got.players.length,500);
  assert.deepEqual(verificarCatalogo(got),got);
});
test('fuente bearer solo recibe su propia credencial ligada al origen exacto',async()=>{
  const auth={...fuente,auth:'bearer'};
  const fetchImpl=async(url,req)=>{
    assert.equal(req.headers.Authorization,'Bearer token-de-prueba');return respuesta(real());
  };
  await assert.rejects(descargarCatalogo(auth,{token:'token-de-prueba',tokenOrigin:'https://otro.invalid',fetchImpl}),/vinculada/);
  await descargarCatalogo(auth,{token:'token-de-prueba',tokenOrigin:fuente.allowedOrigin,fetchImpl});
});
test('bloquea fuente no autorizada, HTTP, origen equivocado, redirección y URL con secretos',async()=>{
  const variants=[{authorized:false},{url:'http://feed.example.invalid/catalogo.json'},
    {url:'https://evil.example.invalid/catalogo.json'},{url:'https://feed.example.invalid/catalogo.json?secret=x'},
    {url:'https://user:pwd@feed.example.invalid/catalogo.json'}];
  for(const v of variants) await assert.rejects(descargarCatalogo({...fuente,...v},{fetchImpl:()=>assert.fail('No debe llamar a la red')}));
  await assert.rejects(descargarCatalogo(fuente,{fetchImpl:()=>{throw Error('secreto-no-mostrar');}}),e=>!e.message.includes('secreto-no-mostrar'));
});
test('rechaza HTTP fallido, contenido no JSON, tamaño excesivo y feed de otra temporada',async()=>{
  await assert.rejects(descargarCatalogo(fuente,{fetchImpl:async()=>new Response('',{status:429})}),/429/);
  await assert.rejects(descargarCatalogo(fuente,{fetchImpl:async()=>new Response('<html>') }),/JSON/);
  await assert.rejects(descargarCatalogo(fuente,{fetchImpl:async()=>new Response('{',{headers:{'content-type':'application/json'}})}),/JSON/);
  await assert.rejects(descargarCatalogo(fuente,{maxBytes:64,fetchImpl:async()=>respuesta(real())}),/límite/);
  await assert.rejects(descargarCatalogo(fuente,{fetchImpl:async()=>respuesta({...real(),season:'otro'})}),/temporada|season/);
  await assert.rejects(descargarCatalogo(fuente,{fetchImpl:async()=>respuesta({...real(),kind:'fixture'})}),/autorizado/);
});
