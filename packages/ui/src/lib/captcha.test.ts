import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Options = { callback: (token: string) => void; 'error-callback': () => void };

function fakeTurnstile(outcome: 'pass' | 'fail' = 'pass') {
  let options: Options | null = null;
  let issued = 0;
  const api = {
    render: vi.fn((_el: HTMLElement, opts: Options) => {
      options = opts;
      return 'widget-1';
    }),
    reset: vi.fn(),
    execute: vi.fn(() => {
      queueMicrotask(() => {
        if (outcome === 'pass') options?.callback(`token-${++issued}`);
        else options?.['error-callback']();
      });
    }),
  };
  window.turnstile = api;
  return api;
}

async function freshModule() {
  vi.resetModules();
  return import('./captcha');
}

describe('captcha', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '1x00000000000000000000AA');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.turnstile;
    document.querySelectorAll('[data-nexg-captcha]').forEach((node) => node.remove());
  });

  it('returns no token when no site key is configured, so forms keep working', async () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    const { getCaptchaToken, withCaptcha } = await freshModule();
    expect(await getCaptchaToken()).toBeUndefined();
    const form = await withCaptcha(new FormData());
    expect(form.has('captchaToken')).toBe(false);
  });

  it('hands out a fresh single-use token per call, resetting the one widget in between', async () => {
    const api = fakeTurnstile();
    const { getCaptchaToken } = await freshModule();
    expect(await getCaptchaToken()).toBe('token-1');
    expect(await getCaptchaToken()).toBe('token-2');
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(api.reset).toHaveBeenCalledTimes(1);
    expect(api.execute).toHaveBeenCalledTimes(2);
  });

  it('adds the token to form data under captchaToken', async () => {
    fakeTurnstile();
    const { withCaptcha, CAPTCHA_FIELD } = await freshModule();
    const form = await withCaptcha(new FormData());
    expect(form.get(CAPTCHA_FIELD)).toBe('token-1');
  });

  it('returns undefined rather than throwing when Turnstile fails', async () => {
    fakeTurnstile('fail');
    const { getCaptchaToken } = await freshModule();
    expect(await getCaptchaToken()).toBeUndefined();
  });
});
