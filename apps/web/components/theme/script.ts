/** Where a visitor's light/dark choice is kept in their browser. */
export const THEME_KEY = 'nexg.theme';

/** Paths that are not the public site: the merchant console and its previews stay light. */
export const UNTHEMED = /^\/merchant(?:\/|$|-)/;

/*
 * Runs in <head> before the page paints, so a dark-mode visitor never sees a
 * flash of the light page: their saved choice, else their device's setting.
 * Kept tiny and self-contained.
 */
export const THEME_SCRIPT = `(function(){try{var p=location.pathname;if(/^\\/merchant(?:\\/|$|-)/.test(p))return;var s=localStorage.getItem('${THEME_KEY}');var d=s?s==='dark':matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;
