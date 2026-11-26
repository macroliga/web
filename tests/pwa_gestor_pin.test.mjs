import test from 'node:test';
import assert from 'node:assert/strict';
import { solicitarGuardadoPin } from '../app/gestor-pin.mjs';

const correo = 'demo01@macroliga.invalid';
const pin = '029481';

test('se solicita al gestor solo tras un login validado, sin almacenamiento propio', async () => {
  let credenciales = null;
  class CredentialFicticia {
    constructor(datos) { Object.assign(this, datos); }
  }
  const navegador = {
    credentials: {
      async store(credencial) { credenciales = credencial; }
    }
  };
  const seSolicito = await solicitarGuardadoPin({
    navegador, PasswordCredentialCtor: CredentialFicticia,
    correo, nombre: 'Luis Aragonés', pin
  });
  assert.equal(seSolicito, true);
  assert.equal(credenciales.id, correo);
  assert.equal(credenciales.password, pin);
  assert.equal(credenciales.name, 'Luis Aragonés');
});

test('navegador sin PasswordCredential no intenta guardar PIN', async () => {
  let llamadas = 0;
  const resultado = await solicitarGuardadoPin({
    navegador: {credentials: {async store(){llamadas++}}},
    PasswordCredentialCtor: undefined, correo, nombre: 'Luis Aragonés', pin
  });
  assert.equal(resultado, false);
  assert.equal(llamadas, 0);
});

test('no intenta almacenar PIN para un usuario ajeno o con formato inválido', async () => {
  let llamadas = 0;
  class CredentialFicticia {}
  const navegador = {credentials:{async store(){llamadas++}}};
  for(const prueba of [
    {correo:'usuario@gmail.com',pin},
    {correo,pin:'123'},
    {correo,pin:'secreto'}
  ]) {
    const ok = await solicitarGuardadoPin({
      navegador,PasswordCredentialCtor:CredentialFicticia,
      nombre:'Luis Aragonés',...prueba
    });
    assert.equal(ok,false);
  }
  assert.equal(llamadas,0);
});

test('un rechazo del guardado no bloquea el login', async () => {
  class CredentialFicticia {}
  const resultado = await solicitarGuardadoPin({
    navegador:{credentials:{async store(){throw Error('denegado')}}},
    PasswordCredentialCtor:CredentialFicticia,correo,
    nombre:'Luis Aragonés',pin
  });
  assert.equal(resultado,false);
});
