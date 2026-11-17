'use client';

import { captchaSiteKey } from '@nexg/ui';
import * as React from 'react';

/*
 * Cloudflare Turnstile, shown in the form.
 *
 * The rest of NexG runs the check invisibly in a corner of the page. On the
 * developer console that left people stuck: when Cloudflare wanted a click,
 * the box in the corner went unnoticed and the sign-in was refused. Here the
 * check sits above the Sign in button, so it can be seen and ticked, and if
 * Cloudflare refuses to run on the page its own error shows in the box.
 */

type TurnstileWidgetApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadTurnstile(): Promise<TurnstileWidgetApi> {
  const existing = (window as unknown as { turnstile?: TurnstileWidgetApi }).turnstile;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', () => {
      const api = (window as unknown as { turnstile?: TurnstileWidgetApi }).turnstile;
      if (api) resolve(api);
      else reject(new Error('Turnstile did not load.'));
    });
    script.addEventListener('error', () => reject(new Error('Turnstile could not be loaded.')));
  });
}

export interface TurnstileHandle {
  /** A token is good for one sign-in; ask for a new one after each attempt. */
  reset: () => void;
}

export function TurnstileBox({
  onToken,
  onError,
  handle,
}: {
  onToken: (token: string | null) => void;
  onError: (code: string) => void;
  handle: React.MutableRefObject<TurnstileHandle | null>;
}) {
  const container = React.useRef<HTMLDivElement>(null);
  const siteKey = captchaSiteKey();
  const callbacks = React.useRef({ onToken, onError });
  callbacks.current = { onToken, onError };

  React.useEffect(() => {
    if (!siteKey || !container.current) return;
    let widgetId: string | null = null;
    let api: TurnstileWidgetApi | null = null;
    let cancelled = false;
    loadTurnstile()
      .then((loaded) => {
        if (cancelled || !container.current) return;
        api = loaded;
        widgetId = loaded.render(container.current, {
          sitekey: siteKey,
          size: 'flexible',
          appearance: 'always',
          callback: (token: string) => callbacks.current.onToken(token),
          'expired-callback': () => callbacks.current.onToken(null),
          'error-callback': (code: string | number) => {
            callbacks.current.onToken(null);
            callbacks.current.onError(String(code));
            return true;
          },
        });
        handle.current = {
          reset: () => {
            callbacks.current.onToken(null);
            if (api && widgetId) api.reset(widgetId);
          },
        };
      })
      .catch(() => callbacks.current.onError('script-not-loaded'));
    return () => {
      cancelled = true;
      handle.current = null;
      if (api && widgetId) api.remove(widgetId);
    };
  }, [siteKey, handle]);

  if (!siteKey) return null;
  return <div ref={container} className="min-h-[65px]" data-testid="turnstile-box" />;
}
