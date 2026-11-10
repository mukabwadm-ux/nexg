'use client';

import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

type Provider = 'google' | 'apple';

/* Read at build time. With both off (the default) this renders nothing and
   the sign-in pages are exactly as they were. */
const ENABLED: Record<Provider, boolean> = {
  google: process.env.NEXT_PUBLIC_AUTH_GOOGLE === 'on',
  apple: process.env.NEXT_PUBLIC_AUTH_APPLE === 'on',
};

const NAMES: Record<Provider, string> = { google: 'Google', apple: 'Apple' };

/** Whether Supabase has the provider switched on, asked before redirecting. */
async function providerReady(provider: Provider): Promise<boolean> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return false;
    const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    if (!response.ok) return false;
    const settings = (await response.json()) as { external?: Record<string, boolean> };
    return settings.external?.[provider] === true;
  } catch {
    return false;
  }
}

/**
 * "Continue with Google" and "Continue with Apple", for customers.
 *
 * Each button shows only when its flag is on (NEXT_PUBLIC_AUTH_GOOGLE /
 * NEXT_PUBLIC_AUTH_APPLE). Before leaving the page it checks that Supabase
 * actually has the provider enabled; a provider that is flagged on here but
 * not yet configured in Supabase gives a clear message rather than Supabase's
 * raw JSON error page.
 *
 * OAuth redirects carry no Turnstile token; Supabase does not ask for one on
 * this path, and the email forms keep theirs.
 */
export function SocialSignIn({
  next,
  label = 'or use your email',
}: {
  next?: string;
  label?: string;
}) {
  const providers = (Object.keys(ENABLED) as Provider[]).filter((p) => ENABLED[p]);
  const [busy, setBusy] = React.useState<Provider | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (providers.length === 0) return null;

  async function start(provider: Provider) {
    setBusy(provider);
    setError(null);
    const fail = (message: string) => {
      setBusy(null);
      setError(message);
    };
    if (!(await providerReady(provider)))
      return fail(
        `${NAMES[provider]} sign-in is not available yet. Use your email and password for now.`,
      );
    const redirectTo = new URL('/auth/callback', window.location.origin);
    redirectTo.searchParams.set('flow', 'oauth');
    if (next) redirectTo.searchParams.set('next', next);
    const { data, error: oauthError } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectTo.toString(), skipBrowserRedirect: true },
    });
    if (oauthError || !data.url)
      return fail(`We could not reach ${NAMES[provider]}. Try again, or use your email.`);
    window.location.assign(data.url);
  }

  return (
    <div>
      <div className="space-y-3">
        {providers.includes('google') && (
          <button
            type="button"
            onClick={() => void start('google')}
            disabled={busy !== null}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#747775] bg-white px-4 text-[0.9375rem] font-semibold text-[#1F1F1F] transition-colors hover:bg-[#F8F9FA] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F1F1F] disabled:opacity-60"
          >
            <GoogleLogo />
            {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
          </button>
        )}
        {providers.includes('apple') && (
          <button
            type="button"
            onClick={() => void start('apple')}
            disabled={busy !== null}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-black px-4 text-[0.9375rem] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-60"
          >
            <AppleLogo />
            {busy === 'apple' ? 'Opening Apple…' : 'Continue with Apple'}
          </button>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-danger mt-3 text-sm font-semibold">
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex items-center gap-3" aria-hidden="true">
        <span className="border-border flex-1 border-t" />
        <span className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-[0.12em]">
          {label}
        </span>
        <span className="border-border flex-1 border-t" />
      </div>
    </div>
  );
}

/** Google's standard multicolour "G" mark. */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** Apple's logo, white on the black button as Apple's guidelines ask. */
function AppleLogo() {
  return (
    <svg width="16" height="19" viewBox="0 0 814 1000" aria-hidden="true" fill="currentColor">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
    </svg>
  );
}
