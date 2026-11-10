import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { landingFor, safeNext, type PartnerHome } from '@/lib/auth-portals';
import { INVALID_LINK_PATH, safeAuthNext } from '@/lib/auth-next';
import { createClient } from '@/lib/supabase/server';

/**
 * The PKCE return leg, for password links requested in this browser and for
 * Google / Apple sign-in.
 *
 * - `next` is only ever an internal path (lib/auth-portals `safeNext`), so this
 *   cannot become an open redirect.
 * - The redirect origin comes from the Host header, as in the middleware: the
 *   origin the browser used (127.0.0.1 in development, nexgapp.com in
 *   production), never a guessed internal URL.
 * - A first Google or Apple sign-in with no name on the account goes to
 *   /sign-up/finish to confirm it (Apple only shares the name once). Nobody
 *   who signs in with a provider gets the set-your-password email.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const origin = `${request.nextUrl.protocol}//${request.headers.get('host') ?? request.nextUrl.host}`;
  const go = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin));
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  };

  const flow = params.get('flow');
  const code = params.get('code');

  /* A provider can send the visitor back with an error instead of a code
     (cancelled, provider switched off, misconfigured). */
  if (flow === 'oauth' && (!code || params.get('error'))) {
    const back = new URLSearchParams({ error: 'oauth' });
    const next = safeNext(params.get('next'));
    if (next) back.set('next', next);
    return go(`/sign-in?${back}`);
  }

  if (!code) return go(INVALID_LINK_PATH);

  const supabase = createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return go(flow === 'oauth' ? '/sign-in?error=oauth' : INVALID_LINK_PATH);
  }

  if (flow !== 'oauth') return go(safeAuthNext(params.get('next')));

  const next = safeNext(params.get('next'));
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  if (typeof meta['first_name'] !== 'string' || !meta['first_name']) {
    const finish = new URLSearchParams();
    if (next) finish.set('next', next);
    const query = finish.toString();
    return go(query ? `/sign-up/finish?${query}` : '/sign-up/finish');
  }

  const { data: home } = await supabase.rpc('fn_partner_home');
  return go(landingFor('customer', (home as PartnerHome) ?? null, next));
}
