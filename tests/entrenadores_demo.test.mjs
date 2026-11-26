import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTRENADORES_PILOTO, cuentasDemostracion } from '../src/demo/entrenadores_historicos.mjs';

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
