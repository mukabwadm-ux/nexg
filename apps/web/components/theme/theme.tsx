'use client';

import { Moon, Sun } from 'lucide-react';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { THEME_KEY, UNTHEMED } from './script';

/**
 * Light and dark themes for the public site.
 *
 * A visitor who has not chosen follows their device (prefers-color-scheme).
 * Choosing with the sun/moon button saves the choice in this browser. The
 * theme is the `dark` class on <html>, which redefines the colour tokens
 * (packages/ui tokens.css). The merchant console and its previews are not
 * themed: they always stay light.
 */

type Choice = 'light' | 'dark' | null;

function readChoice(): Choice {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function systemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(dark: boolean, pathname: string) {
  document.documentElement.classList.toggle('dark', dark && !UNTHEMED.test(pathname));
}

/**
 * Keeps the class right as the visitor moves between pages (into or out of
 * the console) and when their device switches while they have not chosen.
 * Rendered once, in the root layout.
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

/** The sun/moon button in the headers. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const pathname = usePathname() ?? '/';
  const [dark, setDark] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, [pathname]);

  const toggle = () => {
    const next = !document.documentElement.classList.contains('dark');
    try {
      window.localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
    } catch {
      /* Private mode: it still switches for this page. */
    }
    apply(next, pathname);
    setDark(next);
  };

  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button type="button" onClick={toggle} aria-label={label} title={label} className={className}>
      {/* Before the first effect the state is unknown; draw the moon. */}
      {dark ? (
        <Sun className="text-gold h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
      )}
    </button>
  );
}
