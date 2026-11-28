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
  assert.match(app, /cliente\.iniciarSesionConSesion\(cuenta\.correo, pin\.value\)/);
  assert.match(app, /privateView\.hidden = false/);
  assert.match(app, /loginView\.hidden = true/);
});
test('saldo en cabecera, Mi equipo compacto y datos solo en su vista', () => {
  assert.match(html, /id="top-balance" hidden/);
  assert.match(html, /id="header-balance"/);
  assert.match(html, /id="home-wealth"/);
  assert.match(html, /id="team-wealth"/);
  assert.match(html, /class="team-shortcut" data-view="team"/);
  assert.match(html, /id="team-view"[^>]+hidden/);
  assert.match(app, /el\('header-balance'\)\.textContent = euros/);
  assert.match(app, /topBalance\.hidden = true/);
});
test('navegación compacta fija en la parte superior y todos los accesos disponibles', () => {
  const nav=html.match(/<nav class="bottom-nav compact-nav"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav);
  for (const view of ['home','team','market','bad','lineup','news','standings','rules','cup','admin']) assert.match(nav,new RegExp('data-view="'+view+'"'));
  assert.match(nav, /<details id="nav-more"/);
  assert.match(styles, /\.compact-nav[^\{]*\{position:sticky;top:0/);
  assert.match(styles, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(html, /id="admin-nav" hidden/);
  assert.match(app, /mostrarAdmin\(true\)/);
  assert.doesNotMatch(html, /league-status-card|id="admin-home"|id="home-manager-count"/);
  assert.match(html, /id="admin-state"/);
  assert.doesNotMatch(app, /actualizarResumenLiga|adminHome/);
  assert.match(html, /id="app-refresh"/);
});
test('pantallas pendientes no simulan operaciones activas', () => {
  assert.match(html, /Todavía no hay operaciones disponibles/);
  assert.match(html, /Sección en preparación/);
  assert.doesNotMatch(html, /Horario abierto/);
});
test('la caché no intercepta API, claves o credenciales', () => {
  const release = html.match(/data-release="(\d+)"/)?.[1];
  assert.ok(release, 'El HTML declara una versión');
  assert.ok(worker.includes("'macroliga-pwa-estatica-v"+release+"'"));
  for (const asset of ['app.js','styles.css']) {
    assert.ok(html.includes('./'+asset+'?v='+release));
    assert.ok(worker.includes("'./"+asset+"?v="+release+"'"));
  }
  const modNoticias = app.match(/from '\.\/noticias\.mjs\?v=(\d+)'/);
  assert.ok(modNoticias, 'Noticias tiene versión de recurso');
  assert.ok(worker.includes("'./noticias.mjs?v="+modNoticias[1]+"'"));
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /url\.pathname\.endsWith\('\/config\.js'\)/);
  assert.match(worker, /if \(!allowed\) return/);
  assert.doesNotMatch(worker, /auth\/v1\/token/);
});

test('botón Salir accesible en Más y sesión recuperable', () => {
  assert.match(html, /<details id="nav-more"[\s\S]*?id="logout-button"[\s\S]*?<\/details>/);
  assert.match(styles, /\.nav-more-panel\{position:absolute/);
  assert.match(app, /async function restaurarSesion\(\)/);
  assert.match(app, /cliente\.renovarSesion\(origen\.refreshToken\)/);
  assert.match(app, /guardarSesion\(storage, cuenta\.correo, nuevaSesion\.refreshToken\)/);
  assert.match(app, /olvidarSesion\(storage\)/);
  assert.match(app, /recordarEntrenador\(storage, cuenta\.correo\)/);
});

test('la sesión oculta del navegador no revela datos sin autenticarse', () => {
  assert.match(html, /id="private-view" hidden/);
  assert.match(html, /id="top-balance" hidden/);
  assert.match(app, /privateView\.hidden = true/);
  assert.match(app, /topBalance\.hidden = true/);
  assert.match(app, /mostrarAcceso\(\);\s*if \(cliente\) void restaurarSesion\(\);/);
});

test('la política CSP permite solo scripts propios y API propia de MACROLIGA', () => {
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /connect-src 'self' https:\/\/xuwjbfnhvvbdargcohfe\.supabase\.co/);
  assert.match(worker, /'\.\/session\.mjs\?v=10'/);
});

test('PIN compatible con autocompletado y opción explícita de recordar sesión', () => {
  assert.match(html, /id="login-username"[^>]+autocomplete="username"/);
  assert.match(html, /id="password"[^>]+autocomplete="current-password"/);
  assert.match(html, /id="remember-pin" type="checkbox" checked/);
  assert.match(html, /Recordar mi acceso en este dispositivo/);
  assert.doesNotMatch(app, /solicitarGuardadoPin\(/);
  assert.match(app, /recordarPin.checked && guardarSesion/);
  assert.match(html, /id="session-recovery" hidden/);
});
