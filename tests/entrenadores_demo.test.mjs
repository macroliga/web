import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTRENADORES_PILOTO, cuentasDemostracion } from '../src/demo/entrenadores_historicos.mjs';
import { generarPinesUnicos } from '../src/demo/pines.mjs';

test('dieciseis entrenadores historicos sin duplicados', () => {
  assert.equal(ENTRENADORES_PILOTO.length,16);
  assert.equal(new Set(ENTRENADORES_PILOTO).size,16);
});

test('alias de prueba sin correos reales ni contrasenas hardcodeadas', () => {
  const cuentas=cuentasDemostracion();
  assert.equal(cuentas.length,16);
  assert.equal(new Set(cuentas.map(c=>c.correo)).size,16);
  for (const [i,c] of cuentas.entries()) {
    assert.equal(c.numero,i+1);
    assert.match(c.correo,/^demo\d{2}@macroliga\.invalid$/);
    assert.equal(c.equipo,'Equipo de '+c.entrenador);
    assert.equal(Object.hasOwn(c,'contrasena'),false);
  }
});

test('la lista no contiene administradores privilegiados', () => {
  for (const c of cuentasDemostracion()) {
    assert.deepEqual(Object.keys(c).sort(), ['correo','entrenador','equipo','numero'].sort());
  }
});

test('PIN cifrados por Supabase Auth: generacion de seis cifras distintas', () => {
  const pines = generarPinesUnicos(16);
  assert.equal(pines.length, 16);
  assert.equal(new Set(pines).size, 16);
  for (const pin of pines) assert.match(pin, /^\d{6}$/);
});

test('PIN de seis cifras permite ceros iniciales', () => {
  assert.deepEqual(generarPinesUnicos(2, (() => {
    const numeros = [3, 123456];
    return () => numeros.shift();
  })()), ['000003', '123456']);
});

test('generacion rechaza valores invalidos', () => {
  assert.throws(() => generarPinesUnicos(0), RangeError);
  assert.throws(() => generarPinesUnicos(2, () => -1), /aleatorio/);
});
