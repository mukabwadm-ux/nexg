import {
  localHostWorkspaceEnabled,
  hostWorkspaceAccess,
  hostWorkspaceError,
  hostWorkspaceJson,
} from '@/lib/host-workspace/access';
import {
  analyticsHistory,
  financeHistory,
  privacyHistory,
  supportHistory,
} from '@/lib/host-workspace/history';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!localHostWorkspaceEnabled())
    return hostWorkspaceJson({ error: 'Workspace unavailable.' }, 404);
  const kind = new URL(request.url).searchParams.get('kind');
  try {
    const access = await hostWorkspaceAccess();
    if (kind === 'finance') return hostWorkspaceJson(await financeHistory(access));
    if (kind === 'analytics') return hostWorkspaceJson(await analyticsHistory(access));
    if (kind === 'support') return hostWorkspaceJson(await supportHistory(access));
    if (kind === 'privacy') return hostWorkspaceJson(await privacyHistory(access));
    return hostWorkspaceJson({ error: 'Choose a host report.' }, 400);
  } catch (error) {
    return hostWorkspaceError(error);
  }
}
