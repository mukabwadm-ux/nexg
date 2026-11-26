import { z } from 'zod';

import {
  localHostWorkspaceEnabled,
  HostWorkspaceError,
  hostWorkspaceAccess,
  hostWorkspaceError,
  hostWorkspaceJson,
  requireWorkspaceOrigin,
} from '@/lib/host-workspace/access';
import { runHostCommand } from '@/lib/host-workspace/commands';
import { readHostWorkspace } from '@/lib/host-workspace/read';

export const dynamic = 'force-dynamic';

const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('command'), command: z.unknown() }),
  z.object({ action: z.literal('sign-out') }),
]);

export async function GET() {
  if (!localHostWorkspaceEnabled()) return hostWorkspaceJson({ error: 'Workspace unavailable.' }, 404);
  try {
    return hostWorkspaceJson(await readHostWorkspace(await hostWorkspaceAccess()));
  } catch (error) {
    return hostWorkspaceError(error);
  }
}

export async function POST(request: Request) {
  if (!localHostWorkspaceEnabled()) return hostWorkspaceJson({ error: 'Workspace unavailable.' }, 404);
  try {
    requireWorkspaceOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new HostWorkspaceError(400, 'Enter valid workspace details.');
    const access = await hostWorkspaceAccess();
    const maxBytes = 370_000;
    if (Number(request.headers.get('content-length')) > maxBytes)
      throw new HostWorkspaceError(413, 'The workspace update is too large.');
    const body = await request.text();
    if (Buffer.byteLength(body) > maxBytes) throw new HostWorkspaceError(413, 'The workspace update is too large.');
    const action = requestSchema.parse(JSON.parse(body));
    if (action.action === 'sign-out') {
      const { error } = await access.db.auth.signOut({ scope: 'local' });
      if (error) throw new HostWorkspaceError(503, 'Sign-out could not be completed.');
      return hostWorkspaceJson({ ok: true });
    }
    return hostWorkspaceJson(await runHostCommand(access, action.command));
  } catch (error) {
    if (error instanceof z.ZodError) {
      const field = error.issues[0]?.path.at(-1);
      return hostWorkspaceJson({ error: field ? 'Check the ' + String(field) + ' field.' : 'Check the workspace details.' }, 400);
    }
    if (error instanceof SyntaxError) return hostWorkspaceJson({ error: 'Enter valid workspace details.' }, 400);
    return hostWorkspaceError(error);
  }
}
