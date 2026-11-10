import { hostWorkspaceHtml } from '@/lib/host-workspace/shell';

import {
  HostWorkspaceError,
  hostWorkspaceEnabled,
  hostWorkspaceAccess,
} from '@/lib/host-workspace/access';

import { localHostWorkspace } from '@/lib/host-workspace/routes';
import { signInHref } from '@/lib/auth-portals';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!hostWorkspaceEnabled()) return new Response('Not found.', { status: 404 });
  const params = new URL(request.url).searchParams;
  const open = params.get('open');
  const location =
    open && open.length <= 100
      ? localHostWorkspace + '?' + new URLSearchParams({ open })
      : localHostWorkspace;
  if (params.get('bookmark') === '1') {
    return new Response(null, {
      status: 307,
      headers: { Location: location, 'Cache-Control': 'private, no-store' },
    });
  }
  try {
    await hostWorkspaceAccess();
  } catch (error) {
    if (error instanceof HostWorkspaceError && error.status === 401) {
      return new Response(null, {
        status: 307,
        headers: {
          Location: signInHref('host', { next: location }),
          'Cache-Control': 'private, no-store',
        },
      });
    }
    const status = error instanceof HostWorkspaceError ? error.status : 503;
    return new Response('Your host workspace could not be opened.', {
      status,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
  return hostWorkspaceHtml();
}
