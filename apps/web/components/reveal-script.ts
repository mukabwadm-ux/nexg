/** Set on <html> before the first paint while homepage entrances may play. */
export const REVEAL_CLASS = 'nx-anim';

/** Set by the first Reveal to mount, telling the script below it hydrated. */
export const REVEAL_READY = '__nxRevealReady';

/*
 * Runs in <head> before the page paints. With scripts on and no request for
 * reduced motion it marks <html>, and CSS holds the homepage's animated items
 * back, so they first appear through their entrance rather than showing and
 * then hiding. Safety net: if no Reveal has mounted 3s after the page has
 * loaded (its scripts failed), or 8s after it started, the mark comes off
 * and everything shows. No-JS visitors and crawlers never get the mark, so
 * they always see the content.
 */
export const REVEAL_SCRIPT = `(function(){try{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;var h=document.documentElement;h.classList.add('${REVEAL_CLASS}');var off=function(){if(!window.${REVEAL_READY})h.classList.remove('${REVEAL_CLASS}');};addEventListener('load',function(){setTimeout(off,3000);});setTimeout(off,8000);}catch(e){}})();`;
