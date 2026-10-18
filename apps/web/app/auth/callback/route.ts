import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const requestedNext = request.nextUrl.searchParams.get('next');
  const next = requestedNext === '/reset-password' ? requestedNext : '/';

  if (!code) {
    return NextResponse.redirect(new URL('/forgot-password?error=invalid-link', request.url));
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL('/forgot-password?error=invalid-link', request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
