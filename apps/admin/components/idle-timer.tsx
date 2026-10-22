'use client';

import * as React from 'react';

import { STAFF_IDLE_TIMEOUT_MS } from '@/lib/idle';

/**
 * The idle timer, client half.
 *
 * The middleware closes an idle session on the next request; this is the
 * courtesy that closes a tab nobody is using without waiting for one. It
 * watches for real activity — mouse, keys, scroll, touch, the tab coming
 * back to the front — and when nothing has happened for the timeout it
 * signs the session out and lands on sign-in with the reason on the page.
 *
 * A Realtime ping or a background fetch is deliberately *not* activity:
 * a screen updating itself while its operator went to lunch is exactly
 * the case the rule exists for. Only a person touching the console counts.
 *
 * If scripts are blocked this component never runs — and the middleware
 * still holds the gate, which is why the rule lives there first.
 */

/** Warn this long before the timeout, so the sign-out is never a surprise. */
const WARN_BEFORE_MS = 30_000;

export function IdleTimer() {
  const last = React.useRef(Date.now());
  const [warned, setWarned] = React.useState(false);

  React.useEffect(() => {
    const touch = () => {
      last.current = Date.now();
      setWarned(false);
    };

    /*
     * mousemove is throttled by a timestamp rather than by attaching and
     * detaching listeners: the dance is a bug factory, and a cheap date
     * comparison once a second costs nothing.
     */
    let lastMove = 0;
    const onEvent = (event: Event) => {
      if (event.type !== 'mousemove' || Date.now() - lastMove >= 1000) {
        lastMove = Date.now();
        touch();
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const;
    for (const type of events) {
      window.addEventListener(type, onEvent, { passive: true });
    }
    window.addEventListener('focus', touch);

    const interval = window.setInterval(() => {
      const idleFor = Date.now() - last.current;

      if (idleFor >= STAFF_IDLE_TIMEOUT_MS) {
        window.clearInterval(interval);

        /*
         * Sign the session out, not just navigate away. Leaving a valid
         * session cookie behind would make the next click a silent
         * return, which is a timeout that never happened.
         */
        window.location.href = '/api/idle-signout';
        return;
      }

      setWarned(idleFor >= STAFF_IDLE_TIMEOUT_MS - WARN_BEFORE_MS);
    }, 5000);

    return () => {
      for (const type of events) {
        window.removeEventListener(type, onEvent);
      }
      window.removeEventListener('focus', touch);
      window.clearInterval(interval);
    };
  }, []);

  if (!warned) return null;

  return (
    <div
      role="status"
      className="bg-ink/95 fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-3 text-white shadow-lg"
    >
      <p className="text-sm font-bold">Still there? You are about to be signed out.</p>
      <p className="mt-0.5 text-xs font-semibold text-white/60">
        Move the mouse or press a key to stay signed in.
      </p>
    </div>
  );
}
