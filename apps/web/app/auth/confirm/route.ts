import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { INVALID_LINK_PATH, safeAuthNext } from '@/lib/auth-next';
import { createClient } from '@/lib/supabase/server';

/**
 * One-click password links.
 *
 * The recovery email links here with Supabase's one-time token hash instead of
 * going through Supabase's redirect and /auth/callback. The callback needs a
 * PKCE code verifier saved in the browser that asked for the email, so a link
 * opened in a mail app, another browser, or after the registration page signed
 * the merchant out always failed first time. Verifying the token hash on the
 * server works wherever the link is opened and sets the session cookie here.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  const next = safeAuthNext(request.nextUrl.searchParams.get('next'));

  if (!tokenHash || type !== 'recovery') {
    return NextResponse.redirect(new URL(INVALID_LINK_PATH, request.url));
  }

  const supabase = createClient();
  const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });

  if (error) {
    return NextResponse.redirect(new URL(INVALID_LINK_PATH, request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
