/* Setplan: hält die Seite ohne Netz verfügbar. Schale und Version zuerst aus dem Netz, der Plan aus dem Speicher. */
const BASIS = new URL('./', self.location).pathname;
const SCHALE = 'setplan-schale-v1:' + BASIS, DATEN = 'setplan-daten-v1:' + BASIS;
const VORAB = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'version.json'];
const istPlan = u => /\/plan\.[0-9a-f]{8,}\.enc$/.test(u.pathname);

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SCHALE);
    await Promise.all(VORAB.map(async u => {
      try { const r = await fetch(u, { cache: 'no-store' }); if (r.ok) await c.put(u, r); } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const namen = await caches.keys();
    await Promise.all(namen.filter(n => n === 'setplan-schale-v1' || n === 'setplan-daten-v1' || (n.startsWith('setplan-') && n.endsWith(':' + BASIS) && n !== SCHALE && n !== DATEN)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function netzZuerst(e) {
  const req = e.request, c = await caches.open(SCHALE);
  const netz = fetch(req.url, { cache: 'no-store' }).then(r => {
    if (r && r.ok) { const kopie = r.clone(); e.waitUntil(c.put(req.url, kopie).catch(() => {})); }
    return r;
  }).catch(() => null);
  const frist = new Promise(res => setTimeout(() => res(null), 3000));
  let r = await Promise.race([netz, frist]);
  if (r && r.ok) return r;
  let treffer = await c.match(req.url, { ignoreSearch: true });
  if (!treffer && req.mode === 'navigate') treffer = (await c.match('./')) || (await c.match('index.html'));
  if (treffer) return treffer;
  r = r || await netz;
  return r || new Response('Kein Netz und nichts gespeichert.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function planAusSpeicher(e) {
  const req = e.request, c = await caches.open(DATEN);
  const treffer = await c.match(req.url);
  if (treffer) return treffer;
  const r = await fetch(req.url, { cache: 'no-store' });
  if (r.ok) {
    const kopie = r.clone();
    e.waitUntil(c.put(req.url, kopie).then(async () => {
      const alle = await c.keys();
      await Promise.all(alle.filter(k => k.url !== req.url).map(k => c.delete(k)));
    }).catch(() => {}));
  }
  return r;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin || !u.pathname.startsWith(BASIS)) return;
  e.respondWith(istPlan(u) ? planAusSpeicher(e) : netzZuerst(e));
});
