'use client';

import { usePathname } from 'next/navigation';
import * as React from 'react';

import { apply, readChoice, systemDark } from './theme-dom';

/**
 * Keeps the class right as the visitor moves between pages (into or out of
 * the console) and when their device switches while they have not chosen.
 * Rendered once, in the root layout.
 *
 * Its own module, apart from ThemeToggle, on purpose. Next 14 builds each
 * page's client manifest by merging in the manifests of the pages above it
 * in the URL, and a client module both pages use takes the parent page's
 * chunk list. With ThemeSync in the same module as the header's ThemeToggle,
 * /merchants/sign-in downloaded the whole /merchants registration app (about
 * 290 KB compressed), and /riders/sign-in and /hosts/sign-in their landing
 * pages' code. Only the root layout imports this module, so it carries the
 * root layout's chunks alone.
 */
export function ThemeSync() {
  const pathname = usePathname() ?? '/';
  React.useEffect(() => {
    const choice = readChoice();
    apply(choice ? choice === 'dark' : systemDark(), pathname);
    if (choice) return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply(query.matches, pathname);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [pathname]);
  return null;
}
