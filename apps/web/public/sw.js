/*
 * The service worker.
 *
 * Two jobs, and deliberately not a third. It receives pushes so
 * a notification can reach a lock screen with the tab closed,
 * and it serves a small offline page so a dropped connection on
 * a Nairobi matatu shows something written rather than a
 * browser error.
 *
 * It does **not** cache pages or API responses. Everything on
 * this site that matters is live — what is open, what a
 * delivery costs, where a rider is — and a cached copy of any
 * of it is a confident lie. A stale price is worse than a spinner.
 */

const VERSION = 'nexg-v1';
const OFFLINE_URL = '/offline';

/* Only the things that cannot go stale: the shell of the
   offline page and the icon. */
const PRECACHE = [OFFLINE_URL, '/icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      /* A failed precache must not block activation — the push
         half still works without the offline page. */
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/*
 * Network only, with the offline page as the last resort for a
 * navigation. No cache-first anywhere: see the note at the top.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(VERSION);
      return (await cache.match(OFFLINE_URL)) ?? Response.error();
    }),
  );
});

/*
 * A push arrives.
 *
 * The payload carries a `tag`, and the notification is shown
 * with it, so ten updates about one delivery replace each other
 * on the lock screen instead of stacking into a pile somebody
 * swipes away without reading.
 */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'NexG', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'NexG';
  const options = {
    body: payload.body || '',
    icon: '/icon.png',
    badge: '/icon.png',
    tag: payload.tag || undefined,
    /* Replace quietly rather than buzzing again for the same
       thing — the spec is explicit about this. */
    renotify: false,
    data: { href: payload.href || '/' },
    actions: payload.href ? [{ action: 'open', title: 'Open' }] : undefined,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/*
 * Tapping it. An already-open tab is focused and navigated
 * rather than a second one opened, because somebody tracking a
 * delivery does not want two copies of the page.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(href).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(href);
    }),
  );
});
