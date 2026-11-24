import {
  HostWorkspaceError,
  hostWorkspaceEnabled,
  hostWorkspaceAccess,
  hostWorkspaceError,
  hostWorkspaceJson,
  requireWorkspaceOrigin,
} from '@/lib/host-workspace/access';
import {
  declareHostPayout,
  payoutInput,
  payoutInputMessage,
  readHostPayout,
  requirePayoutOwner,
} from '@/lib/host-workspace/payout';

export const dynamic = 'force-dynamic';

/* Where NexG pays this host: the owner reads it masked (GET) and declares it (POST). */
export async function GET(request: Request) {
  if (!hostWorkspaceEnabled()) return hostWorkspaceJson({ error: 'Workspace unavailable.' }, 404);
  try {
    const access = await hostWorkspaceAccess(request);
    return hostWorkspaceJson(await readHostPayout(access));
  } catch (error) {
    return hostWorkspaceError(error);
  }
}

export async function POST(request: Request) {
  if (!hostWorkspaceEnabled()) return hostWorkspaceJson({ error: 'Workspace unavailable.' }, 404);
  try {
    requireWorkspaceOrigin(request);
    if (
      !request.headers.get('content-type')?.startsWith('application/json') ||
      Number(request.headers.get('content-length')) > 4_000
    ) {
      throw new HostWorkspaceError(400, 'Enter your payout details.');
    }
    const access = await hostWorkspaceAccess(request);
    requirePayoutOwner(access);
    const parsed = payoutInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HostWorkspaceError(400, payoutInputMessage(parsed.error));
    return hostWorkspaceJson(await declareHostPayout(access, parsed.data));
  } catch (error) {
    return hostWorkspaceError(error);
  }
}
