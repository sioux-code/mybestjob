const CACHE_NOM = 'mybestjob-v5';

// Uniquement les assets statiques immuables (jamais le HTML)
const STATIQUES = ['/style.css', '/app.js', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NOM).then(c => c.addAll(STATIQUES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(cles =>
      Promise.all(cles.filter(c => c !== CACHE_NOM).map(c => caches.delete(c)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // HTML → toujours réseau (jamais de cache pour éviter spinner stale)
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // API → réseau d'abord, réponse vide en hors-ligne
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ offres: [], errors: ['Hors ligne'] }), {
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Assets statiques (CSS, JS, images) → cache d'abord
  e.respondWith(
    caches.match(e.request).then(cached =>
      cached ||
      fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NOM).then(c => c.put(e.request, clone));
        }
        return res;
      })
    )
  );
});
