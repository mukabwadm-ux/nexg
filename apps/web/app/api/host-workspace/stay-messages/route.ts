import { z } from 'zod';

import {
  HostWorkspaceError,
  hostWorkspaceEnabled,
  hostWorkspaceAccess,
  hostWorkspaceError,
  hostWorkspaceJson,
  requireWorkspaceOrigin,
} from '@/lib/host-workspace/access';
import {
  readStayConversation,
  readStayThreads,
  stayChatError,
  threadOf,
} from '@/lib/host-workspace/stay-messages';

export const dynamic = 'force-dynamic';

/*
 * Chats between a stay's guest and the host. GET lists the chats the caller can see (or one chat's messages with
 * ?threadId=), POST opens a stay's chat, sends a message or marks a chat read. The website uses the cookie; the
 * NEXG Stays phone app sends the host's token as `Authorization: Bearer`.
 */

const uuid = z.string().uuid();
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('open'), stayId: uuid }).strict(),
  z
    .object({
      action: z.literal('send'),
      threadId: uuid,
      requestId: uuid,
      body: z.string().trim().min(1).max(4000),
    })
    .strict(),
  z.object({ action: z.literal('read'), threadId: uuid }).strict(),
  /* "Get NexG's help": NexG support is asked to join the chat (20270314000500). */
  z.object({ action: z.literal('ask-nexg'), threadId: uuid }).strict(),
]);

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export async function GET(request: Request) {
  if (!hostWorkspaceEnabled()) return hostWorkspaceJson({ error: 'Workspace unavailable.' }, 404);
  try {
    const params = new URL(request.url).searchParams;
    const access = await hostWorkspaceAccess(request);
    const threadId = params.get('threadId');
    if (threadId === null) return hostWorkspaceJson(await readStayThreads(access));
    const beforeParam = params.get('before');
    const before = beforeParam === null ? null : Number(beforeParam);
    if (
      !uuid.safeParse(threadId).success ||
      (before !== null && (!Number.isSafeInteger(before) || before <= 0))
    ) {
      throw new HostWorkspaceError(400, 'Choose a valid chat.');
    }
    return hostWorkspaceJson(await readStayConversation(access, threadId, before));
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
    const access = await hostWorkspaceAccess(request);
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HostWorkspaceError(400, 'Check the message and try again.');
    const action = parsed.data;

    if (action.action === 'open') {
      const { data, error } = await access.db.rpc('rpc_stay_chat_host_open', {
        p_stay_id: action.stayId,
      });
      if (error)
        throw stayChatError(
          error,
          'This stay is outside your workspace access.',
          'The chat could not be opened. Try again.',
        );
      if (!isObject(data) || typeof data.thread_id !== 'string') {
        throw new HostWorkspaceError(503, 'The chat could not be opened. Try again.');
      }
      const created = data.created === true;
      return hostWorkspaceJson(
        { threadId: data.thread_id, created, thread: threadOf(data.thread) },
        created ? 201 : 200,
      );
    }

    if (action.action === 'read') {
      const { data, error } = await access.db.rpc('rpc_stay_chat_host_read', {
        p_thread_id: action.threadId,
      });
      if (error)
        throw stayChatError(
          error,
          'This chat is unavailable.',
          'The chat could not be marked as read.',
        );
      const readTo = isObject(data) && typeof data.read_to === 'number' ? data.read_to : 0;
      return hostWorkspaceJson({ ok: true, readTo });
    }

    if (action.action === 'ask-nexg') {
      const { data, error } = await access.db.rpc('rpc_stay_chat_host_ask_nexg', {
        p_thread_id: action.threadId,
      });
      if (error)
        throw stayChatError(
          error,
          'This chat is unavailable.',
          'NexG could not be asked. Try again.',
        );
      if (!isObject(data) || data.ok !== true)
        throw new HostWorkspaceError(503, 'NexG could not be asked. Try again.');
      return hostWorkspaceJson({
        ok: true,
        already: data.already === true,
        message:
          data.already === true
            ? 'NexG has been asked and will reply here.'
            : 'NexG has been asked to help. They will reply in this chat.',
      });
    }

    const { data, error } = await access.db.rpc('rpc_stay_chat_host_send', {
      p_thread_id: action.threadId,
      p_body: action.body,
      p_idempotency_key: action.requestId,
    });
    if (error)
      throw stayChatError(
        error,
        'This chat is unavailable.',
        'Sending could not be confirmed. Refresh this chat or retry the same message.',
      );
    if (!isObject(data) || typeof data.message_id !== 'string' || typeof data.seq !== 'number') {
      throw new HostWorkspaceError(
        503,
        'Sending could not be confirmed. Refresh this chat or retry the same message.',
      );
    }
    return hostWorkspaceJson({
      ok: true,
      messageId: data.message_id,
      seq: data.seq,
      repeat: data.repeat === true,
    });
  } catch (error) {
    return hostWorkspaceError(error);
  }
}
