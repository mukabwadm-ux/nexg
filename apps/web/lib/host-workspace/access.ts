import 'server-only';

import { createClient } from '@/lib/supabase/server';

export { localHostWorkspaceEnabled } from './routes';

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

export async function hostWorkspaceAccess(): Promise<HostWorkspaceAccess> {
  const db = createClient();
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();
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
  const url = new URL(request.url);
  const expectedOrigin = url.protocol + '//' + (request.headers.get('host') ?? url.host);
  if (
    request.headers.get('origin') !== expectedOrigin ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  ) {
    throw new HostWorkspaceError(403, 'Open your workspace to make this change.');
  }
}
