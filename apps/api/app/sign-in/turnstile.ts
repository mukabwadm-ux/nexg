/*
 * Cloudflare Turnstile for the console sign-in, without React: loading
 * Cloudflare's script, the states a check goes through, and what a failure
 * code means in words.
 */

export type TurnstileWidgetApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

/** Where a security check stands, as the form shows it. */
export type CheckState =
  | { state: 'checking' }
  | { state: 'needs-click' }
  | { state: 'passed'; token: string }
  | { state: 'failed'; code: string };

export const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
/** How long Cloudflare's script gets to arrive before we call it stuck. */
const SCRIPT_TIMEOUT_MS = 20_000;

/* Our own failure codes, beside Cloudflare's numeric ones. */
export const SCRIPT_BLOCKED = 'script-blocked';
export const SCRIPT_TIMEOUT = 'script-timeout';
export const RENDER_FAILED = 'render-failed';
export const UNSUPPORTED = 'unsupported-browser';

function loadedApi(): TurnstileWidgetApi | undefined {
  return (window as unknown as { turnstile?: TurnstileWidgetApi }).turnstile;
}

/**
 * Cloudflare's script. Readiness is judged by `window.turnstile` appearing,
 * not by the load event alone: a script tag left by an earlier attempt may
 * have loaded, or failed, before anyone was listening, and then no event
 * ever comes. A tag that failed or stalled is replaced, so a retry is real.
 */
export function loadTurnstile(timeoutMs = SCRIPT_TIMEOUT_MS): Promise<TurnstileWidgetApi> {
  const ready = loadedApi();
  if (ready) return Promise.resolve(ready);

  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (script?.dataset.failed) {
      script.remove();
      script = null;
    }
    if (!script) {
      script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    const tag = script;
    const startedAt = Date.now();
    let settled = false;
    const poll = window.setInterval(() => {
      const api = loadedApi();
      if (api) finish(api, '');
      else if (Date.now() - startedAt >= timeoutMs) finish(null, SCRIPT_TIMEOUT);
    }, 100);
    tag.addEventListener('error', () => finish(null, SCRIPT_BLOCKED), { once: true });

    function finish(api: TurnstileWidgetApi | null, failure: string) {
      if (settled) return;
      settled = true;
      window.clearInterval(poll);
      if (api) {
        resolve(api);
      } else {
        tag.dataset.failed = 'true';
        reject(new Error(failure));
      }
    }
  });
}

/** What a failed check means and what to do about it, by its code. */
export function describeFailure(code: string): string {
  if (code === SCRIPT_BLOCKED || code === SCRIPT_TIMEOUT || code === '200500') {
    return 'Your browser could not reach challenges.cloudflare.com. An ad or privacy blocker, a VPN or your network may be stopping it: allow that site, or try another browser.';
  }
  if (code === UNSUPPORTED || code === '110500') {
    return 'Cloudflare does not support this browser. Try an up-to-date Chrome, Edge, Firefox or Safari.';
  }
  if (code === '110100' || code === '110110' || code === '110200' || code === RENDER_FAILED) {
    return 'The check is set up wrongly on our side. Tell NexG support, quoting this code.';
  }
  if (code === '200100') {
    return "Your device's clock looks wrong. Set it to the right time, then try again.";
  }
  if (code.startsWith('1106')) {
    return 'The check took too long. Press Try again.';
  }
  return 'Cloudflare could not verify this browser. Turn off ad or privacy blockers for this site, or try another browser.';
}
