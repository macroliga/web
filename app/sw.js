// Solo recursos publicos. NUNCA guarda datos de sesion, RPC ni credenciales.
const CACHE = 'macroliga-pwa-estatica-v2';
const STATIC = ['./index.html','./styles.css','./app.js','./api.mjs','./logic.mjs','../src/demo/entrenadores_historicos.mjs','./icon.svg'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k.startsWith('macroliga-pwa-') && k !== CACHE)
        .map((k) => caches.delete(k))
  )));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.endsWith('/config.js')) return;
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
