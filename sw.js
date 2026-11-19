/* La Tanière PinpinRex : service worker (hors-ligne + notifications) */
const VERSION = 'taniere-202611192202';
const SHELL = ['./', './index.html', './config.js', './host.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

try {
  importScripts('./config.js', FB + 'firebase-app-compat.js', FB + 'firebase-messaging-compat.js');
  const C = self.TANIERE_CONFIG;
  if (C && C.firebase && C.firebase.apiKey && !/REMPLACER/.test(C.firebase.apiKey)) {
    firebase.initializeApp(C.firebase);
    const messaging = firebase.messaging();
    // Les messages avec « notification » sont affichés automatiquement ; ceux en « data » seulement ici.
    messaging.onBackgroundMessage(p => {
      if (p.notification) return;
      const d = p.data || {};
      return self.registration.showNotification(d.title || 'La Tanière', {body: d.body || '', icon: './icon-192.png', badge: './icon-192.png', data: {link: d.link || './'}});
    });
  }
} catch (e) { /* hors-ligne au premier chargement : les notifications seront actives au prochain démarrage */ }

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k.startsWith('taniere-')).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Firebase (base de données, connexion) : jamais via le cache
  if (/googleapis\.com|firebaseio\.com|firebaseapp\.com|identitytoolkit|securetoken/.test(url.hostname)) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put('./index.html', cp)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  const cacheable = url.origin === location.origin || /gstatic\.com|fonts\.googleapis\.com|cdnjs\.cloudflare\.com/.test(url.hostname);
  if (!cacheable) return;
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req);
    const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit || Response.error());
    return hit || net;
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || (e.notification.data && e.notification.data.FCM_MSG && e.notification.data.FCM_MSG.notification && e.notification.data.FCM_MSG.notification.click_action) || './';
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    for (const w of list) if ('focus' in w) return w.focus();
    return self.clients.openWindow(link);
  }));
});
