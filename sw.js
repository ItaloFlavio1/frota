// Permite instalar como aplicativo e abrir as telas sem internet.
// Sempre tenta a versão mais nova na rede; usa a cópia guardada só se estiver sem conexão.
// Dados do Supabase nunca são guardados aqui.
const CACHE = 'cabral-frota-v1';

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  const proprio = url.origin === location.origin;
  const biblioteca = /cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/.test(url.host);
  if (req.method !== 'GET' || !(proprio || biblioteca)) return;
  e.respondWith(
    fetch(req).then(resp => {
      if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
      return resp;
    }).catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
