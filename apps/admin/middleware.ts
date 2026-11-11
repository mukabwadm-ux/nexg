import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import {
  STAFF_SEEN_COOKIE,
  STAFF_SEEN_MAX_AGE_S,
  isStaffSessionIdle,
  readStaffSeen,
  sessionIdOf,
  writeStaffSeen,
} from '@/lib/idle';

/**
 * Keeps the Supabase session fresh and keeps signed-out visitors out of the
 * console, and closes a session that has gone quiet.
 *
 * This is chrome, not security: every table the console reads is behind RLS
 * that checks staff_user and role_grant, so a forged cookie gets an empty
 * console rather than someone else's data. The redirect exists so a signed-out
 * staff member lands on sign-in instead of a page of blanks.
 *
 * The idle rule is the one piece here that is security rather than chrome:
 * it is enforced on the server, on every request, and cannot be bypassed by
 * keeping a tab open or blocking scripts. Each authenticated request touches
 * a last-seen cookie; a request that arrives more than STAFF_IDLE_TIMEOUT_MS
 * after the previous one ends the session, whatever the browser says.
 */
export async function middleware(request: NextRequest) {
  let budget: ReturnType<typeof setTimeout> | undefined;
  const response =
    request.nextUrl.pathname === '/api/merchant-applications/review'
      ? await Promise.race([
          staffSessionMiddleware(request).catch(() =>
            reviewProblem(
              503,
              'session_unavailable',
              'Session verification is temporarily unavailable.',
            ),
          ),
          new Promise<NextResponse>((resolve) => {
            budget = setTimeout(
              () =>
                resolve(
                  reviewProblem(
                    504,
                    'session_timeout',
                    'Session verification timed out. No decision was sent.',
                  ),
                ),
              8000,
            );
          }),
        ]).finally(() => clearTimeout(budget))
      : await staffSessionMiddleware(request);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('CDN-Cache-Control', 'no-store');
  response.headers.set('Vercel-CDN-Cache-Control', 'no-store');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  const vary = response.headers.get('Vary');
  if (!vary?.split(',').some((value) => value.trim().toLowerCase() === 'cookie'))
    response.headers.set('Vary', vary ? `${vary}, Cookie` : 'Cookie');
  return response;
}

function reviewProblem(status: number, code: string, detail: string) {
  const requestId = crypto.randomUUID();
  return NextResponse.json(
    {
      type: 'about:blank',
      title: status === 401 ? 'Session expired' : 'Session unavailable',
      status,
      code,
      detail,
      request_id: requestId,
    },
    { status, headers: { 'Content-Type': 'application/problem+json', 'X-Request-ID': requestId } },
  );
}

async function staffSessionMiddleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  /*
   * Without these, createServerClient throws — and a throw in middleware is
   * MIDDLEWARE_INVOCATION_FAILED on every route the matcher covers, which is
   * every page. That error says nothing about what is wrong, so a deployment
   * missing one variable looks like a broken application rather than a
   * missing setting. Let the request through and let the page report it.
   */
  if (!url || !key) {
    console.error(
      'Supabase environment variables are not set. NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.',
    );
    return response;
  }

  const { pathname } = request.nextUrl;
  const isSignIn = pathname.startsWith('/sign-in');
  const isReviewApi = pathname === '/api/merchant-applications/review';
  const redirected = (destination: URL) => {
    const result = NextResponse.redirect(destination);
    response.cookies.getAll().forEach((cookie) => result.cookies.set(cookie));
    return result;
  };
  const projectRef = new URL(url).hostname.split('.')[0];
  const authCookie = `sb-${projectRef}-auth-token`;
  const hasAuthCookie = request.cookies
    .getAll()
    .some(({ name }) => name === authCookie || name.startsWith(`${authCookie}.`));

  /*
   * An absent Supabase session cookie cannot identify a signed-in user.
   * Avoid a network validation call for the common anonymous request,
   * including first visits to sign-in; chunked Supabase cookies are covered.
   */
  if (!hasAuthCookie) {
    // The review handler returns authenticated Problem Details, not HTML.
    if (isSignIn || isReviewApi) return response;

    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = '/sign-in';
    if (pathname !== '/') signInUrl.searchParams.set('next', pathname);
    return redirected(signInUrl);
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        const previousCookies = response.cookies.getAll();
        response = NextResponse.next({ request });
        previousCookies.forEach((cookie) => response.cookies.set(cookie));
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isSignIn) {
    if (isReviewApi) return response;
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    // So the console returns them where they were headed.
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return redirected(url);
  }

  if (user && isSignIn) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return redirected(url);
  }

  if (user) {
    /*
     * The idle gate. Last-seen travels with the request; a request that
     * arrives more than the timeout after the previous one closes the
     * session. The clock is the server's cookie trail, not the browser:
     * a tab left open, a laptop asleep, a script blocked — none of them
     * can keep the cookie young.
     *
     * Supabase's own token lifetime is a project-wide setting shared
     * with the public site, so the console cannot shorten it there. This
     * is the console's own rule, and it is deliberately stricter.
     *
     * The stamp names the sign-in session it was made in, so it can live
     * as long as that sign-in (an idle hour is still idle) while a new
     * sign-in, which has a new session id, starts clean.
     */
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const signIn = sessionIdOf(session?.access_token) ?? 'unknown';
    const now = Date.now();
    if (
      isStaffSessionIdle(readStaffSeen(request.cookies.get(STAFF_SEEN_COOKIE)?.value), signIn, now)
    ) {
      /*
       * End the session rather than merely redirecting. Clearing the
       * auth cookies here means the next request cannot present them
       * again, so an idle timeout is a real sign-out, not a nag that a
       * still-valid cookie walks straight past.
       */
      const signInUrl = request.nextUrl.clone();
      signInUrl.pathname = '/sign-in';
      signInUrl.search = '';
      signInUrl.searchParams.set('idle', '1');

      const expired = isReviewApi
        ? reviewProblem(401, 'session_expired', 'Sign in again before reviewing an application.')
        : NextResponse.redirect(signInUrl);
      for (const cookie of request.cookies.getAll()) {
        if (cookie.name.startsWith('sb-')) {
          expired.cookies.set(cookie.name, '', { path: '/', maxAge: 0 });
        }
      }
      expired.cookies.set(STAFF_SEEN_COOKIE, '', { path: '/', maxAge: 0 });
      return expired;
    }

    response.cookies.set(STAFF_SEEN_COOKIE, writeStaffSeen(signIn, now), {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      /*
       * As long as the sign-in can live, so an idle session never outlasts
       * its own stamp and reads as "never seen you". It used to expire after
       * ten minutes, which let any session idle longer than that carry on.
       */
      maxAge: STAFF_SEEN_MAX_AGE_S,
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
