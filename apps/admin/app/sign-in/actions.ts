'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

export interface SignInResult {
  ok: boolean;
  message: string;
}

/**
 * Staff sign-in.
 *
 * Section 5.1 calls for Google Workspace with the domain restriction. That
 * needs OAuth credentials that do not exist yet, so this is email and
 * password against the same Supabase project — and the domain rule is applied
 * here, where section 5.1 says it belongs (configuration, not schema).
 *
 * Signing in is not authorisation. Whether this account can see a rider or
 * touch a document is decided by staff_user and role_grant through RLS, on
 * every query. A valid session with no staff row gets an empty console.
 */
export async function signIn(
  _prev: SignInResult | null,
  formData: FormData,
): Promise<SignInResult | undefined> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '') || '/';

  if (!email || !password) {
    return { ok: false, message: 'Enter your work email and password.' };
  }

  const domain = process.env.STAFF_EMAIL_DOMAIN;
  if (domain && !email.endsWith(`@${domain}`)) {
    return { ok: false, message: `Use your @${domain} work account.` };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  await record(supabase, email, error ? 'bad_password' : 'success');

  if (error) {
    // Deliberately not "no such user" versus "wrong password": that tells an
    // attacker which staff emails exist.
    return { ok: false, message: 'That email and password do not match.' };
  }

  // Only ever to a path on this console — `next` comes from the query string.
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}

export async function signOut() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();

  if (data.user?.email) {
    await record(supabase, data.user.email, 'signed_out');
  }

  await supabase.auth.signOut();
  redirect('/sign-in');
}

/**
 * Write the attempt down.
 *
 * Every one, including the refusals — those are the interesting
 * ones, and they are the only ones there is no session for, which
 * is why the RPC is reachable without one.
 *
 * Deliberately after the auth call and deliberately swallowed: a
 * log that cannot be written must not stop somebody signing in. The
 * gap shows on the Audit console as a quiet hour rather than as an
 * outage, which is the right way round.
 *
 * No IP. The country comes from the edge header and the address is
 * never read — a sign-in log is exactly the table somebody would
 * later be tempted to use to place a person.
 */
async function record(
  supabase: ReturnType<typeof createClient>,
  email: string,
  outcome: 'success' | 'bad_password' | 'signed_out',
) {
  try {
    const h = headers();
    const ua = h.get('user-agent') ?? '';

    if (outcome === 'signed_out') {
      await supabase.rpc('rpc_record_sign_in', {
        p_email: email,
        p_outcome: 'success',
        p_session_id: undefined,
      });
      return;
    }

    await supabase.rpc('rpc_record_sign_in', {
      p_email: email,
      p_outcome: outcome,
      p_auth_method: 'password',
      p_mfa_used: false,
      p_ip_country: h.get('x-vercel-ip-country') ?? undefined,
      /*
       * A stable-ish handle for "this browser", from the things a
       * browser sends anyway. Not a fingerprint: no canvas, no
       * fonts, no screen. It is enough to say "a device we have
       * seen before" and not enough to follow somebody between
       * sites.
       */
      p_device_fingerprint: deviceId(ua, h.get('accept-language')),
      p_device_label: deviceLabel(ua),
      p_user_agent: undefined,
    });
  } catch {
    /* See above: never block a sign-in on the log. */
  }
}

function deviceLabel(ua: string): string {
  const browser = /Edg/i.test(ua)
    ? 'Edge'
    : /Firefox/i.test(ua)
      ? 'Firefox'
      : /SamsungBrowser/i.test(ua)
        ? 'Samsung Internet'
        : /Chrome|CriOS/i.test(ua)
          ? 'Chrome'
          : /Safari/i.test(ua)
            ? 'Safari'
            : 'Other';
  const os = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad/i.test(ua)
      ? 'iOS'
      : /Windows/i.test(ua)
        ? 'Windows'
        : /Mac OS/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'Other';
  return `${browser} · ${os}`;
}

function deviceId(ua: string, lang: string | null): string {
  /* Hashed, and from coarse inputs only — the label above plus the
     language. Two people on the same model of phone share it, which
     is the point: it answers "a new device" without identifying
     one. */
  const basis = `${deviceLabel(ua)}|${(lang ?? '').split(',')[0] ?? ''}`;
  let h = 0;
  for (let i = 0; i < basis.length; i += 1) {
    h = (h * 31 + basis.charCodeAt(i)) | 0;
  }
  return `d${(h >>> 0).toString(36)}`;
}
