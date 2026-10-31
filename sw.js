/* Service worker du CRM Hygiène & Combat : l'application s'ouvre sans attendre le réseau et se met à jour toute seule. */
const VERSION = 'crm-2026.10.31-0212';
const FICHIERS = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './icone-192.png', './icone-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FICHIERS.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(cles => Promise.all(cles.filter(c => c !== VERSION && c !== 'polices').map(c => caches.delete(c)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return; // API : toujours le réseau
  if (url.origin === location.origin) {
    // Fichiers de l'application : version installée (instantané) ; la nouvelle version arrive par la mise à jour du service worker.
    // L'outil comparaison (gros fichiers) est gardé à la première ouverture.
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(rep => {
      if (rep.ok && url.pathname.includes('/comparateur/')) { const copie = rep.clone(); caches.open(VERSION).then(c => c.put(e.request, copie)); }
      return rep;
    })));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open('polices').then(c => c.match(e.request).then(r => r || fetch(e.request).then(rep => { c.put(e.request, rep.clone()); return rep; }))));
  }
});
