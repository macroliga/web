import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/styles.css', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../app/sw.js', import.meta.url), 'utf8');

test('login privado separado de menús, requiere nombre y PIN', () => {
  assert.match(html, /id="login-view"/);
  assert.match(html, /id="private-view" hidden/);
  assert.match(html, /id="manager-select"[^>]+required/);
  assert.match(html, /id="password"[^>]+type="password"/);
  assert.match(html, /pattern="\[0-9\]\{6\}"/);
  assert.doesNotMatch(html, /Acceso de managers/);
  assert.match(app, /cliente\.iniciarSesion\(cuenta\.correo, pin\.value\)/);
  assert.match(app, /privateView\.hidden = false/);
  assert.match(app, /loginView\.hidden = true/);
});
test('saldo en cabecera, Mi equipo compacto y datos solo en su vista', () => {
  assert.match(html, /id="top-balance" hidden/);
  assert.match(html, /id="header-balance"/);
  assert.match(html, /class="team-shortcut" data-view="team"/);
  assert.match(html, /id="team-view"[^>]+hidden/);
  assert.match(app, /el\('header-balance'\)\.textContent = euros/);
  assert.match(app, /topBalance\.hidden = true/);
});
test('cuatro accesos principales en 2 columnas y barra inferior de cinco', () => {
  assert.equal((html.match(/class="tile tile-/g)||[]).length,4);
  assert.equal((html.match(/<button type="button" data-view="(home|rules|cup|standings|admin)"/g)||[]).length,5);
  assert.match(styles, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(styles, /env\(safe-area-inset-bottom/);
});
test('pantallas pendientes no simulan operaciones activas', () => {
  assert.match(html, /Todavía no hay operaciones disponibles/);
  assert.match(html, /En preparación/);
  assert.doesNotMatch(html, /Horario abierto/);
});
test('la caché no intercepta API, claves o credenciales', () => {
  assert.match(worker, /macroliga-pwa-estatica-v5/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /url\.pathname\.endsWith\('\/config\.js'\)/);
  assert.match(worker, /if \(!allowed\) return/);
  assert.doesNotMatch(worker, /auth\/v1\/token/);
});
