// MACROLIGA - recursos publicos, NUNCA sesiones, tokens, API ni claves.
// Cache static-only, versionado para actualizar PWA tras cada entrega.
const CACHE = 'macroliga-pwa-estatica-v5';
const STATIC = ['./index.html','./styles.css','./app.js','./api.mjs',
  './logic.mjs','./entrenadores.mjs','./icon.svg'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('macroliga-pwa-') && key !== CACHE)
      .map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin ||
      url.pathname.endsWith('/config.js')) return;
  // Solo cachea la lista explicita de recursos estaticos; cualquier otra
  // ruta se deja sin interceptar para evitar almacenar datos privados.
  const allowed = STATIC.some((item) =>
    new URL(item, self.registration.scope).pathname === url.pathname);
  if (!allowed) return;
  event.respondWith(fetch(request).catch(() => caches.match(request, {ignoreSearch:true})));
});
