'use client';

import * as React from 'react';

import { getCaptchaToken } from './captcha';

/** Turnstile honours a token for five minutes; one older than four is dropped. */
const FRESH_FOR_MS = 240_000;

/**
 * A Turnstile token fetched when a form opens, so it is usually ready by the
 * time the form is sent. Started on submit instead, every sign-in waited for
 * Cloudflare's script to load and its check to run before anything was sent.
 *
 * `take()` hands over the prepared token, or asks for a fresh one when none
 * is ready or it is too old. A token is single-use, so call `prepare()` after
 * a failed attempt to have the next one ready for the retry.
 */
export function useEarlyCaptcha(): {
  take: () => Promise<string | undefined>;
  prepare: () => void;
} {
  const early = React.useRef<{ at: number; token: Promise<string | undefined> } | null>(null);
  const prepare = React.useCallback(() => {
    early.current = { at: Date.now(), token: getCaptchaToken() };
  }, []);
  React.useEffect(prepare, [prepare]);
  const take = React.useCallback(() => {
    const ready = early.current;
    early.current = null;
    return ready && Date.now() - ready.at < FRESH_FOR_MS ? ready.token : getCaptchaToken();
  }, []);
  return { take, prepare };
}
