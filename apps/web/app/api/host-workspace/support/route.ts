import { z } from 'zod';

import { HOST_SUPPORT_DESKS } from '@/lib/host-workspace/vocab';
import {
  HostWorkspaceError,
  hostWorkspaceEnabled,
  hostWorkspaceAccess,
  hostWorkspaceError,
  hostWorkspaceJson,
  requireWorkspaceOrigin,
} from '@/lib/host-workspace/access';
import {
  readSupportConversation,
  readSupportInbox,
  requireSupportThread,
} from '@/lib/host-workspace/support';

export const dynamic = 'force-dynamic';

const uuid = z.string().uuid();
const message = z.string().trim().min(1).max(4000);
const actionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('start'),
      subject: z.string().trim().min(1).max(160),
      topic: z.string(),
      body: message,
    })
    .strict(),
  z.object({ action: z.literal('reply'), threadId: uuid, requestId: uuid, body: message }).strict(),
  z.object({ action: z.literal('read'), threadId: uuid }).strict(),
]);

export async function GET(request: Request) {
  if (!hostWorkspaceEnabled()) return hostWorkspaceJson({ error: 'Workspace unavailable.' }, 404);
  try {
    const params = new URL(request.url).searchParams;
    const access = await hostWorkspaceAccess();
    const thread = params.get('thread');
    if (thread === null) return hostWorkspaceJson(await readSupportInbox(access));
    const beforeParam = params.get('before');
    const before = beforeParam === null ? null : Number(beforeParam);
    if (
      !uuid.safeParse(thread).success ||
      (before !== null && (!Number.isSafeInteger(before) || before <= 0))
    ) {
      throw new HostWorkspaceError(400, 'Choose a valid conversation.');
    }
    return hostWorkspaceJson(await readSupportConversation(access, thread, before));
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
      Number(request.headers.get('content-length')) > 32_000
    ) {
      throw new HostWorkspaceError(400, 'Enter a valid message.');
    }
    const access = await hostWorkspaceAccess();
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HostWorkspaceError(400, 'Check the message and try again.');
    const action = parsed.data;

    if (action.action === 'start') {
      const topic = HOST_SUPPORT_DESKS.find((desk) => desk.value === action.topic);
      if (!topic) throw new HostWorkspaceError(400, 'Choose a support topic.');
      const { data, error } = await access.db.rpc('rpc_host_message_start', {
        p_host_id: access.hostId,
        p_topic: topic.value,
        p_subject: action.subject,
        p_body: action.body,
      });
      if (
        error ||
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data) ||
        typeof data.conversation_id !== 'string'
      ) {
        throw new HostWorkspaceError(
          503,
          'Sending could not be confirmed. Check your inbox before trying again.',
        );
      }
      return hostWorkspaceJson({ threadId: data.conversation_id }, 201);
    }

    await requireSupportThread(access, action.threadId);
    if (action.action === 'read') {
      const { error } = await access.db.rpc('rpc_host_message_read', {
        p_conversation: action.threadId,
      });
      if (error) throw new HostWorkspaceError(503, 'The conversation could not be marked as read.');
    } else {
      const { error } = await access.db.rpc('rpc_host_message_reply', {
        p_conversation: action.threadId,
        p_body: action.body,
        p_idempotency_key: action.requestId,
      });
      if (error)
        throw new HostWorkspaceError(
          503,
          'Sending could not be confirmed. Refresh this conversation or retry the same reply.',
        );
    }
    return hostWorkspaceJson({ ok: true });
  } catch (error) {
    return hostWorkspaceError(error);
  }
}
