// MACROLIGA · Prueba HTTP real de acceso (solo cuentas de ensayo ya provisionadas).
// No crea usuarios, no modifica datos y no imprime tokens ni contraseñas.
// Se ejecuta manualmente en una máquina confiable mediante variables de entorno.
// Requiere dos managers ficticios con equipos diferentes EN LA MISMA DIVISIÓN.
import assert from 'node:assert/strict';
import { crearCliente } from '../app/api.mjs';

const REF = 'xuwjbfnhvvbdargcohfe';
const URL = 'https://' + REF + '.supabase.co';
const env = process.env;

const inputs = {
  publicKey: env.MACROLIGA_TEST_PUBLIC_KEY,
  emailA: env.MACROLIGA_TEST_EMAIL_A,
  passwordA: env.MACROLIGA_TEST_PASSWORD_A,
  emailB: env.MACROLIGA_TEST_EMAIL_B,
  passwordB: env.MACROLIGA_TEST_PASSWORD_B
};
const missing = Object.entries(inputs).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error('Prueba no iniciada. Faltan variables:', missing.join(', '));
  process.exitCode = 2;
} else {
  const cliente = crearCliente({supabaseUrl: URL, anonKey: inputs.publicKey});
  let tokenA = null;
  let tokenB = null;

  async function apiDirecta(tabla, token) {
    const respuesta = await fetch(URL + '/rest/v1/' + tabla + '?select=*', {
      headers: {apikey: inputs.publicKey, Authorization: 'Bearer ' + token}
    });
    // Una tabla sin politicas RLS debe estar cerrada: 403, o 200 con [].
    if ([401, 403, 404].includes(respuesta.status)) return;
    assert.equal(respuesta.status, 200, 'Respuesta inesperada en ' + tabla);
    const filas = await respuesta.json();
    assert.deepEqual(filas, [], 'Exposición por lectura directa de ' + tabla);
  }

  async function perfil(token) {
    const filas = await cliente.consultar('macroliga_mi_equipo', {}, token);
    assert.ok(Array.isArray(filas) && filas.length === 1,
      'Cada cuenta de prueba debe tener exactamente un equipo activo');
    assert.ok(typeof filas[0].saldo_centimos === 'number' ||
              typeof filas[0].saldo_centimos === 'string',
      'El saldo no se recibió');
    assert.ok(typeof filas[0].nombre_equipo === 'string', 'Nombre de equipo ausente');
    return filas[0];
  }

  async function ejecutar() {
    tokenA = await cliente.iniciarSesion(inputs.emailA, inputs.passwordA);
    tokenB = await cliente.iniciarSesion(inputs.emailB, inputs.passwordB);
    assert.notEqual(tokenA, tokenB, 'Las cuentas no pueden compartir identidad');

    const a = await perfil(tokenA);
    const b = await perfil(tokenB);
    assert.notEqual(a.equipo_id, b.equipo_id, 'A y B deberían tener equipos distintos');
    assert.equal(a.division_id, b.division_id, 'Los dos usuarios deben ser de la misma división');

    // Cada manager ve su plantilla, y también la plantilla pública del rival.
    const propiaA = await cliente.consultar('macroliga_plantilla_equipo',
      {p_equipo_id:a.equipo_id}, tokenA);
    const propiaB = await cliente.consultar('macroliga_plantilla_equipo',
      {p_equipo_id:b.equipo_id}, tokenB);
    const rivalDesdeA = await cliente.consultar('macroliga_plantilla_equipo',
      {p_equipo_id:b.equipo_id}, tokenA);
    assert.ok(Array.isArray(propiaA) && Array.isArray(propiaB));
    assert.deepEqual(rivalDesdeA, propiaB, 'La plantilla pública del rival no coincide');

    // Se puede leer el propio saldo solo en la RPC privada, no por tablas.
    for (const token of [tokenA, tokenB]) {
      await apiDirecta('wallet_entries', token);
      await apiDirecta('bids', token);
      await apiDirecta('managers', token);
    }

    // Si se proporciona un equipo de otra división, debe negarse su lectura.
    if (env.MACROLIGA_TEST_TEAM_OTRA_DIVISION) {
      await assert.rejects(
        cliente.consultar('macroliga_plantilla_equipo',
          {p_equipo_id:env.MACROLIGA_TEST_TEAM_OTRA_DIVISION}, tokenA),
        /No se pudo completar|No autorizado|403/
      );
    }
    console.log('OK: dos inicios de sesión reales, saldos aislados y plantillas autorizadas.');
    console.log('OK: acceso directo a movimientos y pujas denegado.');
    console.log('No se han creado ni modificado datos.');
  }

  try {
    await ejecutar();
  } catch (error) {
    console.error('Prueba de acceso fallida:', error.message);
    process.exitCode = 1;
  } finally {
    await Promise.all([
      cliente.cerrarSesion(tokenA),
      cliente.cerrarSesion(tokenB)
    ]);
  }
}
