import { THEME_KEY, UNTHEMED } from './script';

/**
 * Light and dark themes for the public site.
 *
 * A visitor who has not chosen follows their device (prefers-color-scheme).
 * Choosing with the sun/moon button saves the choice in this browser. The
 * theme is the `dark` class on <html>, which redefines the colour tokens
 * (packages/ui tokens.css). The merchant console and its previews are not
 * themed: they always stay light.
 *
 * These helpers are shared by ThemeSync (theme-sync.tsx) and ThemeToggle
 * (theme.tsx), which are kept in separate client modules on purpose; see
 * theme-sync.tsx.
 */

export type Choice = 'light' | 'dark' | null;

export function readChoice(): Choice {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function systemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function apply(dark: boolean, pathname: string) {
  document.documentElement.classList.toggle('dark', dark && !UNTHEMED.test(pathname));
}
