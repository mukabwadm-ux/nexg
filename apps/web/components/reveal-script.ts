/** Set on <html> before the first paint while homepage entrances may play. */
export const REVEAL_CLASS = 'nx-anim';

/** Set when the Reveal code has loaded: the page's scripts are running. */
export const REVEAL_LOADED = '__nxRevealLoaded';

/** Set by the first Reveal to mount: the page has hydrated. */
export const REVEAL_READY = '__nxRevealReady';

/*
 * Runs in <head> before the page paints. With scripts on and no request for
 * reduced motion it marks <html>, and CSS holds the homepage's animated items
 * back, so they first appear through their entrance rather than showing and
 * then hiding.
 *
 * Safety net, so content can never stay hidden: 3s after the page has loaded
 * the mark comes off unless a Reveal has mounted. If the scripts did load and
 * are only slow to start (a slow phone), it waits up to two more 3s rounds;
 * if they never arrived, it also comes off 8s after the page started. No-JS
 * visitors and crawlers never get the mark, so they always see the content.
 */
export const REVEAL_SCRIPT = `(function(){try{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;var h=document.documentElement,w=window,n=0;h.classList.add('${REVEAL_CLASS}');var off=function(){if(w.${REVEAL_READY})return;if(w.${REVEAL_LOADED}&&n++<2){setTimeout(off,3000);return;}h.classList.remove('${REVEAL_CLASS}');};addEventListener('load',function(){setTimeout(off,3000);});setTimeout(function(){if(!w.${REVEAL_LOADED})off();},8000);}catch(e){}})();`;
