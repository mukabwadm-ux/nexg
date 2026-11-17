'use client';

import dynamic from 'next/dynamic';

/**
 * The application form on the merchant home, downloaded only when the home
 * shows it (a new-form application still in setup).
 *
 * It brings the whole registration app with it: the category catalogue, its
 * schema validator and the form, about 220 KB compressed. Next bundles every
 * client component a page imports into one group, so with a plain import
 * every merchant's home downloaded all of it, live businesses included.
 * The registration pages import the form directly; it is their main content.
 */
export const LazyConnectedApplication = dynamic(() =>
  import('./connected-application').then((module) => module.ConnectedApplication),
);
