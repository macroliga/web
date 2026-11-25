import test from 'node:test';
import assert from 'node:assert/strict';
import {conectarPiloto} from '../src/server/adaptador-postgres.mjs';

test('sin DATABASE_URL no intenta conectarse',async()=>{
  await assert.rejects(()=>conectarPiloto(),/DATABASE_URL/);
});
test('no acepta URL de Comunio Laviana ni bases distintas',async()=>{
  await assert.rejects(()=>conectarPiloto({
    cadenaConexion:'postgresql://usuario:secreto@db.proyecto-distinto.supabase.co/postgres'
  }),/Destino rechazado/);
});
test('no acepta protocolos que no sean PostgreSQL',async()=>{
  await assert.rejects(()=>conectarPiloto({
    cadenaConexion:'https://db.xuwjbfnhvvbdargcohfe.supabase.co/postgres'
  }),/PostgreSQL/);
});
test('una ejecución real no admite conexiones postgres administrador',async()=>{
  await assert.rejects(()=>conectarPiloto({
    cadenaConexion:'postgresql://postgres:secreto@db.xuwjbfnhvvbdargcohfe.supabase.co/postgres',
    modoEscritura:true
  }),/usuario de base de datos limitado/);
});
test('una ejecución real no admite el usuario postgres con sufijos',async()=>{
  await assert.rejects(()=>conectarPiloto({
    cadenaConexion:'postgresql://postgres.otro:secreto@db.xuwjbfnhvvbdargcohfe.supabase.co/postgres',
    modoEscritura:true
  }),/usuario de base de datos limitado/);
});
test('otro usuario SQL no está autorizado para ejecutar el mercado',async()=>{
  await assert.rejects(()=>conectarPiloto({
    cadenaConexion:'postgresql://cualquier_usuario:secreto@db.xuwjbfnhvvbdargcohfe.supabase.co/postgres',
    modoEscritura:true
  }),/macroliga_runner/);
});
test('ni siquiera el modo de lectura permite usar postgres administrador',async()=>{
  await assert.rejects(()=>conectarPiloto({
    cadenaConexion:'postgresql://postgres:secreto@db.xuwjbfnhvvbdargcohfe.supabase.co/postgres'
  }),/macroliga_runner/);
});
test('los errores del destino no revelan contraseñas',async()=>{
  const clave='CONTRASENA_FICTICIA_SUPER_SECRETA';
  await assert.rejects(
    ()=>conectarPiloto({cadenaConexion:'postgres://user:'+clave+'@db.otra.supabase.co/postgres'}),
    e=>!String(e.message).includes(clave)
  );
});
