/*
 * Cloudflare Turnstile, shared by every app and form.
 *
 * One invisible widget is rendered once per page (bottom-right, and only
 * visible when Turnstile wants the visitor to interact). Each call to
 * getCaptchaToken() resets it and runs it again, because a token is good
 * for exactly one verification: one Supabase sign-in, sign-up, anonymous
 * session or password reset, or one of our own form submissions.
 *
 * With no NEXT_PUBLIC_TURNSTILE_SITE_KEY the helpers return undefined and
 * every caller carries on as before, so the code can ship before the keys.
 */

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  execute: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/* Packages that typecheck @nexg/ui without Node's types (packages/location)
   still compile. Next inlines the literal process.env.NEXT_PUBLIC_… at build. */
declare const process: { env: { NEXT_PUBLIC_TURNSTILE_SITE_KEY?: string } };

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
/** Long enough for a visitor to finish an interactive challenge. */
const TOKEN_TIMEOUT_MS = 120_000;

/** Field name used to carry the token in FormData. */
export const CAPTCHA_FIELD = 'captchaToken';

export function captchaSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;
}

let scriptLoad: Promise<TurnstileApi> | null = null;
let widgetId: string | null = null;
let executedOnce = false;
let waiting: { resolve: (token: string) => void; reject: (error: Error) => void } | null = null;
let queue: Promise<unknown> = Promise.resolve();

function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptLoad) return scriptLoad;
  scriptLoad = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load.'));
    script.onerror = () => {
      scriptLoad = null;
      reject(new Error('Turnstile could not be loaded.'));
    };
    document.head.appendChild(script);
  });
  return scriptLoad;
}

function ensureWidget(api: TurnstileApi, siteKey: string): string {
  if (widgetId) return widgetId;
  const container = document.createElement('div');
  container.setAttribute('data-nexg-captcha', '');
  container.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483000;';
  document.body.appendChild(container);
  widgetId = api.render(container, {
    sitekey: siteKey,
    execution: 'execute',
    appearance: 'interaction-only',
    callback: (token: string) => {
      waiting?.resolve(token);
      waiting = null;
    },
    'error-callback': () => {
      waiting?.reject(new Error('Turnstile could not verify this browser.'));
      waiting = null;
      return true;
    },
    'expired-callback': () => undefined,
  });
  return widgetId;
}

async function freshToken(siteKey: string): Promise<string> {
  const api = await loadScript();
  const id = ensureWidget(api, siteKey);
  if (executedOnce) api.reset(id);
  executedOnce = true;
  return new Promise<string>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      waiting = null;
      reject(new Error('Turnstile timed out.'));
    }, TOKEN_TIMEOUT_MS);
    waiting = {
      resolve: (token) => {
        window.clearTimeout(timer);
        resolve(token);
      },
      reject: (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    };
    api.execute(id);
  });
}

/**
 * A fresh single-use token, or undefined when Turnstile is not configured or
 * could not run (the server or Supabase then decides whether to accept).
 * Calls are queued, so two forms never fight over the one widget.
 */
export function getCaptchaToken(): Promise<string | undefined> {
  const siteKey = captchaSiteKey();
  if (!siteKey || typeof window === 'undefined') return Promise.resolve(undefined);
  const next = queue.then(
    () => freshToken(siteKey).catch(() => undefined),
    () => freshToken(siteKey).catch(() => undefined),
  );
  queue = next;
  return next;
}

/** Adds a fresh token to a form's data (no-op without a site key). */
export async function withCaptcha(formData: FormData): Promise<FormData> {
  const token = await getCaptchaToken();
  if (token) formData.set(CAPTCHA_FIELD, token);
  return formData;
}
