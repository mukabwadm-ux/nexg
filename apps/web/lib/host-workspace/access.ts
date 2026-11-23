import 'server-only';

import type { Database } from '@nexg/db';
import { createClient as createTokenClient, type SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

export { hostWorkspaceEnabled } from './routes';

export class HostWorkspaceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface HostWorkspaceAccess {
  db: ReturnType<typeof createClient>;
  userId: string;
  email: string;
  hostId: string;
  name: string;
  role: 'Owner' | 'Manager';
  unitScope: string[] | null;
}

const BEARER = /^Bearer ([A-Za-z0-9._-]{20,4096})$/;

/*
 * The NEXG Stays phone app has no website cookie: it sends the host's Supabase
 * session as `Authorization: Bearer <access token>`, as the Consumer app does for
 * bookings (lib/booking/app-session.ts). Same anon key, so row-level security and
 * every rule below apply exactly as they do on the web. Returns null without the
 * header; throws 401 for a malformed one.
 */
function appTokenClient(request?: Request): { db: SupabaseClient<Database>; token: string } | null {
  const header = request?.headers.get('authorization');
  if (!header) return null;
  const token = BEARER.exec(header.trim())?.[1];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key)
    throw new HostWorkspaceError(401, 'Sign in to open your host workspace.');
  const db = createTokenClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });
  return { db, token };
}

/** True when the request carries the phone app's sign-in rather than the website cookie. */
export function isAppRequest(request: Request) {
  return request.headers.has('authorization');
}

export async function hostWorkspaceAccess(request?: Request): Promise<HostWorkspaceAccess> {
  const app = appTokenClient(request);
  const db = app?.db ?? createClient();
  const {
    data: { user },
    error: authError,
  } = await (app ? db.auth.getUser(app.token) : db.auth.getUser());
  if (authError && authError.status && authError.status >= 500) {
    throw new HostWorkspaceError(503, 'Sign-in is temporarily unavailable. Try again shortly.');
  }
  if (!user || user.is_anonymous) {
    throw new HostWorkspaceError(401, 'Sign in to open your host workspace.');
  }

  const { data: home, error: homeError } = await db.rpc('fn_partner_home');
  if (homeError) throw new HostWorkspaceError(503, 'Your host account could not be loaded.');
  if (
    !home ||
    typeof home !== 'object' ||
    Array.isArray(home) ||
    home.kind !== 'host' ||
    typeof home.id !== 'string'
  ) {
    throw new HostWorkspaceError(403, 'Your account does not have access to the host workspace.');
  }

  const { data: member, error: memberError } = await db
    .from('host_user')
    .select('role, units')
    .eq('host_id', home.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (memberError) throw new HostWorkspaceError(503, 'Your host permissions could not be checked.');
  if (!member || (member.role !== 'owner' && member.role !== 'manager')) {
    throw new HostWorkspaceError(403, 'Your account does not have access to this host workspace.');
  }

  return {
    db,
    userId: user.id,
    email: user.email ?? '',
    hostId: home.id,
    name: typeof home.name === 'string' && home.name.trim() ? home.name : 'Host',
    role: member.role === 'owner' ? ('Owner' as const) : ('Manager' as const),
    unitScope: member.units,
  };
}

export function hostWorkspaceJson(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export function hostWorkspaceError(error: unknown) {
  if (error instanceof HostWorkspaceError) {
    return hostWorkspaceJson({ error: error.message }, error.status);
  }
  return hostWorkspaceJson({ error: 'The host workspace is temporarily unavailable.' }, 503);
}

export function requireWorkspaceOrigin(request: Request) {
  /* The origin check stops another website using a host's cookie. A browser never
     adds an Authorization header by itself, so a token request needs no such check. */
  if (isAppRequest(request)) return;
  const url = new URL(request.url);
  const expectedOrigin = url.protocol + '//' + (request.headers.get('host') ?? url.host);
  if (
    request.headers.get('origin') !== expectedOrigin ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  ) {
    throw new HostWorkspaceError(403, 'Open your workspace to make this change.');
  }
}
