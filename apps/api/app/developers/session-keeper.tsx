'use client';

import { useEffect } from 'react';

import { keepDeveloperSession, type SessionCheck } from './session-actions';

/** Activity is reported at most this often: the idle limit is a few minutes. */
const REPORT_EVERY_MS = 60_000;

/** Where an idle developer is sent (IDLE_SIGN_IN in lib/developer-session). */
const IDLE_SIGN_IN = '/sign-in?next=/developers&reason=idle';

/**
 * Keeps the developer's sign-in alive while they use the console, and signs
 * them out when it lapses (rpc_developer_session, 20270203000500).
 *
 * The page load has just reported activity. After that, a click or key press
 * reports it again at most once a minute, and when the deadline passes with
 * no activity the console asks the database whether the sign-in is still
 * current: if not, it goes to the sign-in page, which says why. A developer
 * whose sign-in nothing binds (no merchant) gets no deadline and no timer.
 */
export function SessionKeeper({ expiresAt }: { expiresAt: string | null }) {
  useEffect(() => {
    let active = true;
    let lastReport = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const apply = (check: SessionCheck) => {
      if (!active) return;
      if (check.lapsed) {
        active = false;
        window.location.assign(IDLE_SIGN_IN);
        return;
      }
      arm(check.expiresAt);
    };
    const ask = (activity: boolean) => {
      keepDeveloperSession(activity).then(apply, () => undefined);
    };
    function arm(deadline: string | null) {
      if (timer) clearTimeout(timer);
      timer = undefined;
      const at = deadline ? Date.parse(deadline) : NaN;
      if (!Number.isFinite(at)) return;
      timer = setTimeout(() => ask(false), Math.max(0, at - Date.now()) + 1_000);
    }
    const activity = (event: Event) => {
      if (!active || !event.isTrusted || Date.now() - lastReport < REPORT_EVERY_MS) return;
      lastReport = Date.now();
      ask(true);
    };

    arm(expiresAt);
    window.addEventListener('pointerdown', activity, { passive: true });
    window.addEventListener('keydown', activity);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('keydown', activity);
    };
  }, [expiresAt]);

  return null;
}
