// MACROLIGA - recursos públicos, NUNCA sesiones, tokens, API ni claves.
const CACHE = 'macroliga-pwa-estatica-v29';
const STATIC = ['./index.html','./styles.css?v=29','./app.js?v=29','./api.mjs?v=28','./noticias.mjs?v=26',
  './catalogo.mjs?v=29','./clausulas-equipo-malo.mjs?v=28','./alineacion.mjs?v=24','./clasificacion.mjs?v=27','./admin.mjs?v=17','./logic.mjs?v=10','./entrenadores.mjs?v=10','./session.mjs?v=10','./icon.svg','./manifest.webmanifest'];
const urlRecurso = (item) => new URL(item, self.registration.scope).href;
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) =>
    cache.addAll(STATIC.map((item) => new Request(urlRecurso(item), {cache:'reload'}))))
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
  // Solo recursos exactos; no mezclar módulos de entregas diferentes.
  const navegacion = request.mode === 'navigate' &&
    [urlRecurso('./'), urlRecurso('./index.html')].includes(url.origin + url.pathname);
  const allowed = navegacion || STATIC.some((item) => urlRecurso(item) === url.href);
  if (!allowed) return;
  event.respondWith(fetch(request, {cache:'no-cache'}).catch(async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(navegacion ? urlRecurso('./index.html') : request)
      || Response.error();
  }));
});

