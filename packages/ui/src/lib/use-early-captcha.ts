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
 *
 * A prepared check that came back empty (Turnstile errored or timed out while
 * the page was opening) is not handed over as if it were a token: sending no
 * token is what made Supabase refuse the first sign-in, which the form then
 * reported as a wrong password. The check is run again instead.
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
  const take = React.useCallback(async () => {
    const ready = early.current;
    early.current = null;
    const prepared = ready && Date.now() - ready.at < FRESH_FOR_MS ? await ready.token : undefined;
    return prepared ?? getCaptchaToken();
  }, []);
  return { take, prepare };
}
