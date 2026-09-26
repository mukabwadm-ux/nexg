'use server';

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
  await supabase.auth.signOut();
  redirect('/sign-in');
}
