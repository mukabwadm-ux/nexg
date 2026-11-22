/*
 * Runs in <head> before the page paints: sets <html lang> to the visitor's
 * chosen language, and dir="rtl" for Arabic, so a right-to-left page never
 * paints left to right first. The server renders lang="en" so public pages
 * can stay cached; this corrects it from the cookie.
 *
 * The portals (merchant, host, rider, booking workspace) are English-only,
 * so they keep left to right whatever the visitor picked on the public site.
 */
export const LOCALE_SCRIPT = String.raw`(function(){try{var m=document.cookie.match(/(?:^|;\s*)nexg_locale=([A-Za-z0-9-]{2,20})/);if(!m)return;var l=m[1].toLowerCase(),h=document.documentElement;h.lang=l;if(/^\/(merchant|host\/|rider\/|booking-workspace)/.test(location.pathname))return;if(/^(ar|he|fa|ur)(-|$)/.test(l))h.dir='rtl';}catch(e){}})();`;
