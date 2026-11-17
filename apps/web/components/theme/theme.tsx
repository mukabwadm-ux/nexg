'use client';

import { Moon, Sun } from 'lucide-react';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { THEME_KEY } from './script';
import { apply } from './theme-dom';

/*
 * Light and dark themes for the public site: see theme-dom.ts. ThemeSync,
 * which the root layout renders, lives in theme-sync.tsx; keep it out of this
 * module (theme-sync.tsx says why).
 */

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
