import test from 'node:test';
import assert from 'node:assert/strict';
import { mercadoAbierto, equipoMaloAbierto, euros } from '../app/logic.mjs';
import { crearCliente } from '../app/api.mjs';

test('horario del mercado de invierno en Europe/Madrid', () => {
  assert.equal(mercadoAbierto(new Date('2026-11-26T00:00:00Z')), false); // 01:00
  assert.equal(mercadoAbierto(new Date('2026-11-26T04:59:00Z')), false); // 05:59
  assert.equal(mercadoAbierto(new Date('2026-11-26T05:00:00Z')), true);  // 06:00
  assert.equal(mercadoAbierto(new Date('2026-11-26T23:59:00Z')), true);  // 00:59
});

test('horario del mercado con cambio de horario de verano', () => {
  assert.equal(mercadoAbierto(new Date('2027-06-26T03:59:00Z')), false);
  assert.equal(mercadoAbierto(new Date('2027-06-26T04:00:00Z')), true);
  assert.equal(mercadoAbierto(new Date('2027-06-26T23:00:00Z')), false); // 01:00
});

test('Equipo Malo abierto desde mediodia hasta medianoche', () => {
  assert.equal(equipoMaloAbierto(new Date('2026-11-26T10:59:00Z')), false);
  assert.equal(equipoMaloAbierto(new Date('2026-11-26T11:00:00Z')), true);
  assert.equal(equipoMaloAbierto(new Date('2026-11-26T22:59:00Z')), true);
  assert.equal(equipoMaloAbierto(new Date('2026-11-26T23:00:00Z')), false);
});

test('importes convertidos de centimos a euros', () => {
  assert.match(euros(54000000), /540[.\s\u00a0]?000/);
  assert.equal(euros(NaN), '—');
});

test('cliente no admite configuracion incompleta', () => {
  assert.throws(() => crearCliente({supabaseUrl:'https://xuwjbfnhvvbdargcohfe.supabase.co',anonKey:''}));
});

test('cliente usa identidad propia en RPC y bloquea otras operaciones', async () => {
  const peticiones = [];
  const fetchImpl = async (url,options) => {
    peticiones.push({url,options});
    return {
      ok: true,
      json: async () => url.includes('/auth/') ? {access_token:'token-de-prueba'} : [{equipo_id:'ficticio'}]
    };
  };
  const api = crearCliente({supabaseUrl:'https://xuwjbfnhvvbdargcohfe.supabase.co',
    anonKey:'clave-publica-ficticia',fetchImpl});
  const token = await api.iniciarSesion('ejemplo@example.invalid','clave-ficticia');
  assert.equal(token,'token-de-prueba');
  const perfil = await api.consultar('macroliga_mi_equipo',{},token);
  assert.deepEqual(perfil,[{equipo_id:'ficticio'}]);
  assert.equal(peticiones[1].options.headers.Authorization, 'Bearer token-de-prueba');
  assert.match(peticiones[1].url,/\/rest\/v1\/rpc\/macroliga_mi_equipo$/);
  await assert.rejects(api.consultar('borrar_todo',{},token),/Operacion no permitida/);
  await assert.rejects(api.consultar('macroliga_mi_equipo',{},null),/Debes iniciar sesion/);
  assert.equal(peticiones.length,2);
});
