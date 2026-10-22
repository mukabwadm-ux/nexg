import { NextResponse } from 'next/server';

import { recordIdleSignOut } from '@/app/sign-in/actions';
import { createClient } from '@/lib/supabase/server';

/**
 * The idle timer's landing: sign the session out, record it, and land
 * the person on sign-in with the reason in the URL.
 *
 * A route handler rather than a server action because the client calls
 * it with a bare location change from a page that no longer trusts
 * itself, and the sign-out must run even if nothing else on the page
 * does.
 *
 * The middleware holds the same gate on every request, so a browser
 * that never reaches this route still cannot outlive the timeout — this
 * is the path that makes the *screen* honest about what happened.
 */
export async function GET() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();

  if (data.user?.email) {
    await recordIdleSignOut(data.user.email);
  }

  await supabase.auth.signOut();

  const url = new URL('/sign-in', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3001');
  url.searchParams.set('idle', '1');
  return NextResponse.redirect(url);
}
