import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Keeps the Supabase session fresh and keeps signed-out visitors out of the
 * console.
 *
 * This is chrome, not security: every table the console reads is behind RLS
 * that checks staff_user and role_grant, so a forged cookie gets an empty
 * console rather than someone else's data. The redirect exists so a signed-out
 * staff member lands on sign-in instead of a page of blanks.
 */
export async function middleware(request: NextRequest) {
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

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isSignIn = pathname.startsWith('/sign-in');

  if (!user && !isSignIn) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    // So the console returns them where they were headed.
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (user && isSignIn) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
