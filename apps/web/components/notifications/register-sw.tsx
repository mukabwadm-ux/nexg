'use client';

import * as React from 'react';

/**
 * Registers the service worker, which is what makes the site
 * installable and what receives pushes later.
 *
 * Registration itself asks for nothing and shows nothing — it
 * is the install prompt and the notification permission that
 * are intrusive, and neither happens here. Deferred past load
 * so it never competes with the first paint on a slow
 * connection.
 */
export function RegisterServiceWorker() {
  React.useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* A failed registration costs the offline page and push.
           It must not surface to somebody trying to order dinner. */
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
