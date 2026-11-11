/* Service worker du CRM Hygiène & Combat : l'application s'ouvre sans attendre le réseau et se met à jour toute seule. */
const VERSION = 'crm-2026.11.11-1546';
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

// ---------------------------------------------------------------- Notifications (Web Push)
// Le serveur envoie une notification vide : on demande ici le contenu à l'API, avec la session gardée par l'application
// (IndexedDB « crm-hc », clé « sw »), puis on l'affiche. Toucher la notification ouvre la fiche, l'agenda ou les tâches.
const API = 'https://script.google.com/macros/s/AKfycbyi4wD91ajHJmD_goYeQZRiTgZgCQYApcerBk6cUuFYGVyEATy_SHLW0CKrnn9y20T1/exec';
function idb(cle, valeur) {
  return new Promise(ok => {
    const r = indexedDB.open('crm-hc', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onerror = () => ok(undefined);
    r.onsuccess = () => {
      const t = r.result.transaction('kv', valeur === undefined ? 'readonly' : 'readwrite');
      const q = valeur === undefined ? t.objectStore('kv').get(cle) : t.objectStore('kv').put(valeur, cle);
      q.onsuccess = () => ok(valeur === undefined ? q.result : true);
      q.onerror = () => ok(undefined);
    };
  });
}
async function afficherNotifications() {
  const session = await idb('sw');
  let liste = [];
  if (session && session.jeton) {
    try {
      const depuis = (await idb('notif_vu')) || 0;
      const j = await (await fetch(session.api || API, { method: 'POST', body: JSON.stringify({ fn: 'crmNotifications', args: [depuis], jeton: session.jeton }) })).json();
      if (j.ok) liste = j.r || [];
    } catch (e) { liste = []; }
  }
  if (!liste.length) return self.registration.showNotification('Hygiène & Combat', { body: 'Ouvrez le CRM pour voir la nouveauté.', icon: 'icone-192.png', tag: 'hc' });
  await idb('notif_vu', Math.max(...liste.map(x => x.t)));
  await Promise.all(liste.slice(-5).map(n => self.registration.showNotification(n.titre, { body: n.texte, icon: 'icone-192.png', badge: 'icone-192.png', tag: n.id, data: { url: n.url } })));
}
self.addEventListener('push', e => e.waitUntil(afficherNotifications()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(fenetres => {
    const f = fenetres[0];
    if (f) return f.focus().then(() => f.postMessage({ type: 'notif-ouvrir', url }));
    return self.clients.openWindow('./' + (url ? '?ouvrir=' + encodeURIComponent(url) : ''));
  }));
});
