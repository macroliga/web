import test from 'node:test';
import assert from 'node:assert/strict';
import {ejecutarPasoMercado} from '../src/server/mercado-ejecutor.mjs';
import {crearAdaptadorConsultas,conectarPiloto} from '../src/server/adaptador-postgres.mjs';

const DIV='11111111-1111-4111-8111-111111111111';
const AYER='22222222-2222-4222-8222-222222222222';
const HOY='33333333-3333-4333-8333-333333333333';

function divisionFicticia(fallo=null) {
  const llamadas=[];
  const ciclos=[{
    id:AYER,status:'open',opens_at:'2026-11-24T05:00:00Z',
    closes_at:'2026-11-25T00:00:00Z',publishes_at:'2026-11-25T05:00:00Z'
  }];
  let falloPendiente=fallo;
  const consultar=async(sql,parametros=[])=>{
    const nombre=sql.match(/app_private\.(runner_[a-z_]+)\(/)?.[1];
    assert.ok(nombre,'La conexión no debe leer tablas directamente: '+sql);
    llamadas.push(nombre);
    if(nombre===falloPendiente){
      falloPendiente=null;
      throw new Error('FALLO_SIMULADO_'+nombre);
    }
    switch(nombre){
      case 'runner_hora_servidor':return [{hora:'2026-11-25T05:10:00Z'}];
      case 'runner_division':
        assert.deepEqual(parametros,[DIV]);
        return [{id:DIV,timezone:'Europe/Madrid',season_status:'active'}];
      case 'runner_ciclos':return structuredClone(ciclos);
      case 'runner_cerrar':
        assert.equal(ciclos[0].status,'open');
        ciclos[0].status='calculated';return [{total:0}];
      case 'runner_publicar':
        assert.equal(ciclos[0].status,'calculated');
        ciclos[0].status='published';return [{total:0}];
      case 'runner_preparar':
        assert.deepEqual(parametros,[DIV,'2026-11-25']);
        assert.equal(ciclos.length,1,'Un reintento nunca debe duplicar lotes');
        ciclos.push({
          id:HOY,status:'draft',opens_at:'2026-11-25T05:00:00Z',
          closes_at:'2026-11-26T00:00:00Z',publishes_at:'2026-11-26T05:00:00Z'
        });
        return [{ciclo_id:HOY,arrastrados:2,nuevos:13}];
      case 'runner_abrir':
        assert.equal(ciclos[1].status,'draft');
        ciclos[1].status='open';return [{total:15}];
      default:throw new Error('Función no prevista: '+nombre);
    }
  };
  return {store:crearAdaptadorConsultas(consultar),ciclos,llamadas};
}
const acciones=r=>r.resultado[0].pasos.map(p=>p.accion);

test('Node: solo lectura no modifica el mercado ficticio',async()=>{
  const d=divisionFicticia();
  const r=await ejecutarPasoMercado({store:d.store,divisiones:[DIV]});
  assert.equal(r.errores,0);
  assert.deepEqual(acciones(r),['cerrar','publicar','preparar','abrir']);
  assert.equal(d.ciclos[0].status,'open');
  assert.deepEqual(d.llamadas,['runner_hora_servidor','runner_division','runner_ciclos']);
});

test('Node: ciclo completo y segunda ejecución sin duplicados',async()=>{
  const d=divisionFicticia();
  const r=await ejecutarPasoMercado({store:d.store,divisiones:[DIV],soloLectura:false});
  assert.equal(r.errores,0);
  assert.deepEqual(acciones(r),['cerrar','publicar','preparar','abrir']);
  assert.deepEqual(d.ciclos.map(c=>c.status),['published','open']);
  const siguiente=await ejecutarPasoMercado({store:d.store,divisiones:[DIV],soloLectura:false});
  assert.equal(siguiente.errores,0);
  assert.deepEqual(acciones(siguiente),[]);
  assert.equal(d.ciclos.length,2);
});

test('Node: caída durante publicación, reintento retoma sin recerrar',async()=>{
  const d=divisionFicticia('runner_publicar');
  const r1=await ejecutarPasoMercado({store:d.store,divisiones:[DIV],soloLectura:false});
  assert.equal(r1.errores,1);
  assert.deepEqual(acciones(r1),['cerrar','publicar']);
  assert.equal(d.ciclos.length,1);
  const r2=await ejecutarPasoMercado({store:d.store,divisiones:[DIV],soloLectura:false});
  assert.equal(r2.errores,0);
  assert.deepEqual(acciones(r2),['publicar','preparar','abrir']);
});

test('Node: caída durante apertura, reintento abre el draft existente',async()=>{
  const d=divisionFicticia('runner_abrir');
  const r1=await ejecutarPasoMercado({store:d.store,divisiones:[DIV],soloLectura:false});
  assert.equal(r1.errores,1);
  assert.deepEqual(acciones(r1),['cerrar','publicar','preparar','abrir']);
  assert.equal(d.ciclos[1].status,'draft');
  const r2=await ejecutarPasoMercado({store:d.store,divisiones:[DIV],soloLectura:false});
  assert.equal(r2.errores,0);
  assert.deepEqual(acciones(r2),['abrir']);
  assert.equal(d.ciclos.length,2);
});

test('Node: host extraño, usuario administrador y sslmode=disable rechazados',async()=>{
  const url='postgresql://macroliga_runner:CLAVE_FICTICIA@db.xuwjbfnhvvbdargcohfe.supabase.co/postgres';
  await assert.rejects(()=>conectarPiloto({cadenaConexion:url+'?sslmode=disable'}),/Parámetros/);
  await assert.rejects(()=>conectarPiloto({cadenaConexion:url.replace('db.xuwjbfnhvvbdargcohfe','db.otro')}),/Destino rechazado/);
  await assert.rejects(()=>conectarPiloto({cadenaConexion:url.replace('macroliga_runner','postgres')}),/macroliga_runner/);
  await assert.rejects(()=>conectarPiloto({cadenaConexion:url.replace(':CLAVE_FICTICIA',':')}),/contraseña/);
});
