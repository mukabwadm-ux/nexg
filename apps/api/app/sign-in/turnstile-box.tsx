'use client';

import { captchaSiteKey } from '@nexg/ui';
import * as React from 'react';

import {
  type CheckState,
  loadTurnstile,
  RENDER_FAILED,
  SCRIPT_BLOCKED,
  SCRIPT_TIMEOUT,
  type TurnstileWidgetApi,
  UNSUPPORTED,
} from './turnstile';

/*
 * Cloudflare Turnstile, shown in the form.
 *
 * The rest of NexG runs the check invisibly in a corner of the page. On the
 * developer console that left people stuck: when Cloudflare wanted a click,
 * the box in the corner went unnoticed and the sign-in was refused. Here the
 * check sits above the Sign in button, so it can be seen and ticked, and
 * every turn it takes (asking for a click, passed, failed with a code) is
 * reported to the form, which says it in words.
 */

export interface TurnstileHandle {
  /** A token is good for one sign-in; ask for a new one after each attempt. */
  reset: () => void;
}

export function TurnstileBox({
  onChange,
  handle,
}: {
  onChange: (check: CheckState) => void;
  handle: React.MutableRefObject<TurnstileHandle | null>;
}) {
  const container = React.useRef<HTMLDivElement>(null);
  const siteKey = captchaSiteKey();
  const report = React.useRef(onChange);
  report.current = onChange;

  React.useEffect(() => {
    if (!siteKey || !container.current) return;
    let api: TurnstileWidgetApi | null = null;
    let widgetId: string | null = null;
    let cancelled = false;
    const tell = (check: CheckState) => {
      if (!cancelled) report.current(check);
    };

    loadTurnstile()
      .then((loaded) => {
        if (cancelled || !container.current) return;
        api = loaded;
        widgetId = loaded.render(container.current, {
          sitekey: siteKey,
          size: 'flexible',
          appearance: 'always',
          callback: (token: string) => tell({ state: 'passed', token }),
          'expired-callback': () => tell({ state: 'checking' }),
          'before-interactive-callback': () => tell({ state: 'needs-click' }),
          'after-interactive-callback': () => tell({ state: 'checking' }),
          'unsupported-callback': () => tell({ state: 'failed', code: UNSUPPORTED }),
          'error-callback': (code: string | number) => {
            tell({ state: 'failed', code: String(code || 'unknown') });
            return true;
          },
        });
        handle.current = {
          reset: () => {
            if (api && widgetId) api.reset(widgetId);
          },
        };
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : '';
        const code =
          message === SCRIPT_BLOCKED || message === SCRIPT_TIMEOUT ? message : RENDER_FAILED;
        tell({ state: 'failed', code });
      });

    return () => {
      cancelled = true;
      handle.current = null;
      if (api && widgetId) api.remove(widgetId);
    };
  }, [siteKey, handle]);

  if (!siteKey) return null;
  return <div ref={container} className="min-h-[65px]" data-testid="turnstile-box" />;
}
