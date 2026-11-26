import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SESION_KEY, NOMBRE_KEY, guardarSesion, sesionRecordada,
  olvidarSesion, recordarEntrenador, entrenadorRecordado
} from '../app/session.mjs';

function almacen() {
  const datos = new Map();
  return {
    getItem: (key) => datos.has(key) ? datos.get(key) : null,
    setItem: (key,val) => datos.set(key, String(val)),
    removeItem: (key) => datos.delete(key),
    datos
  };
}
const EMAIL = 'demo02@macroliga.invalid';
const REFRESH = 'refresh-token-ficticio-de-mas-de-20-caracteres';

test('recuerda el entrenador seleccionado sin guardar el PIN', () => {
  const storage = almacen();
  assert.equal(recordarEntrenador(storage, EMAIL), true);
  assert.equal(entrenadorRecordado(storage), EMAIL);
  assert.equal(storage.datos.has(SESION_KEY), false);
  assert.equal(storage.datos.get(NOMBRE_KEY), EMAIL);
});

test('la sesion conserva solo el refresh token y el alias, no el PIN ni access token', () => {
  const storage = almacen();
  assert.equal(guardarSesion(storage, EMAIL, REFRESH), true);
  assert.deepEqual(sesionRecordada(storage), {email:EMAIL,refreshToken:REFRESH});
  const texto = storage.datos.get(SESION_KEY);
  assert.equal(texto.includes('pin'), false);
  assert.equal(texto.includes('accessToken'), false);
  assert.equal(Object.keys(JSON.parse(texto)).length, 2);
});

test('salir elimina sesion pero conserva nombre de entrenador', () => {
  const storage = almacen();
  recordarEntrenador(storage, EMAIL);
  guardarSesion(storage, EMAIL, REFRESH);
  olvidarSesion(storage);
  assert.equal(sesionRecordada(storage), null);
  assert.equal(entrenadorRecordado(storage), EMAIL);
});

test('no restaura sesiones de otro proyecto, alias invalidos ni datos corruptos', () => {
  const storage = almacen();
  assert.equal(guardarSesion(storage,'otro@example.invalid',REFRESH),false);
  assert.equal(guardarSesion(storage,EMAIL,''),false);
  storage.setItem(SESION_KEY,'{"email":"otro@example.invalid","refreshToken":"'+REFRESH+'"}');
  assert.equal(sesionRecordada(storage),null);
  storage.setItem(SESION_KEY,'{json roto}');
  assert.equal(sesionRecordada(storage),null);
});

test('almacenamiento no disponible no rompe el inicio ni el cierre de sesion', () => {
  const bad = {getItem(){throw Error('bloqueado')},setItem(){throw Error('bloqueado')},
    removeItem(){throw Error('bloqueado')}};
  assert.equal(recordarEntrenador(bad, EMAIL),false);
  assert.equal(guardarSesion(bad,EMAIL,REFRESH),false);
  assert.equal(sesionRecordada(bad),null);
  assert.doesNotThrow(() => olvidarSesion(bad));
});

test('acepta tokens opacos reales de 12 caracteres y conserva el alias', () => {
  const storage = almacen();
  assert.equal(guardarSesion(storage, EMAIL, 'fakeRefresh1'), true);
  assert.deepEqual(sesionRecordada(storage), {email:EMAIL, refreshToken:'fakeRefresh1'});
  assert.equal(guardarSesion(storage, EMAIL, ' '), false);
  assert.equal(guardarSesion(storage, EMAIL, 'a'.repeat(8193)), false);
  assert.equal(guardarSesion(null, EMAIL, 'fakeRefresh1'), false);
  assert.equal(guardarSesion({setItem(){}, getItem(){return null}}, EMAIL, 'fakeRefresh1'), false);
});

test('migra la sesión anterior y protege frente a una pestaña con código antiguo', () => {
  const storage = almacen();
  const legacy = 'macroliga.piloto.sesion.v1';
  storage.setItem(legacy, JSON.stringify({email:EMAIL,refreshToken:'fakeRefresh1'}));
  assert.deepEqual(sesionRecordada(storage),{email:EMAIL,refreshToken:'fakeRefresh1'});
  assert.equal(storage.getItem(legacy),null);
  storage.removeItem(legacy); // La versión antigua no puede borrar la sesión v2.
  assert.equal(sesionRecordada(storage).refreshToken,'fakeRefresh1');
  storage.setItem(legacy, JSON.stringify({email:EMAIL,refreshToken:REFRESH}));
  olvidarSesion(storage);
  assert.equal(sesionRecordada(storage),null);
  assert.equal(storage.getItem(legacy),null);
});
