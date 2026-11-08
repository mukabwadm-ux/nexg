import 'server-only';

import { HOST_SUPPORT_DESKS } from '@/lib/host-workspace/vocab';

import type {
  SupportConversation,
  SupportInbox,
  SupportThread,
} from '../../../../hosts-workspace/src/contract';
import { HostWorkspaceError, type HostWorkspaceAccess } from './access';
import { allRows } from './read';

const threadFields =
  'id, subject, topic, status, last_message, last_external_at, created_at, unread';

type ThreadRow = {
  id: string | null;
  subject: string | null;
  topic: string | null;
  status: string | null;
  last_message: string | null;
  last_external_at: string | null;
  created_at: string | null;
  unread: number | null;
};

function threadOf(row: ThreadRow): SupportThread {
  if (!row.id) throw new HostWorkspaceError(503, 'The conversation could not be loaded.');
  return {
    id: row.id,
    subject: row.subject ?? 'Conversation with NexG',
    topic: row.topic,
    status: row.status,
    lastMessage: row.last_message,
    lastAt: row.last_external_at ?? row.created_at,
    unread: row.unread ?? 0,
  };
}

function hostLinks(access: HostWorkspaceAccess) {
  return access.db
    .from('msg_object_link')
    .select('conversation_id')
    .eq('object_type', 'host')
    .eq('object_id', access.hostId);
}

export async function readSupportInbox(access: HostWorkspaceAccess): Promise<SupportInbox> {
  const links = await allRows((from, to) =>
    hostLinks(access).order('conversation_id').range(from, to),
  );
  const ids = [...new Set(links.map((link) => link.conversation_id))];
  const threads: SupportThread[] = [];
  for (let offset = 0; offset < ids.length; offset += 75) {
    const { data, error } = await access.db
      .from('host_conversation_v')
      .select(threadFields)
      .in('id', ids.slice(offset, offset + 75));
    if (error) throw new HostWorkspaceError(503, 'Your support inbox could not be loaded.');
    threads.push(...(data ?? []).map(threadOf));
  }
  threads.sort(
    (a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? '') || a.id.localeCompare(b.id),
  );
  return {
    threads,
    topics: HOST_SUPPORT_DESKS.map(({ value, label }) => ({ value, label })),
  };
}

export async function requireSupportThread(access: HostWorkspaceAccess, id: string) {
  const { data: link, error: linkError } = await hostLinks(access)
    .eq('conversation_id', id)
    .maybeSingle();
  if (linkError) throw new HostWorkspaceError(503, 'The conversation could not be opened.');
  if (!link) throw new HostWorkspaceError(404, 'This conversation is unavailable.');

  const { data, error } = await access.db
    .from('host_conversation_v')
    .select(threadFields)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new HostWorkspaceError(503, 'The conversation could not be opened.');
  if (!data) throw new HostWorkspaceError(404, 'This conversation is unavailable.');
  return threadOf(data);
}

export async function readSupportConversation(
  access: HostWorkspaceAccess,
  id: string,
  before: number | null,
): Promise<SupportConversation> {
  const thread = await requireSupportThread(access, id);
  const pageSize = 30;
  const query = access.db
    .from('host_message_v')
    .select('id, body, author, mine, redacted, created_at, seq')
    .eq('conversation_id', id);
  if (before !== null) query.lt('seq', before);
  const { data, error } = await query.order('seq', { ascending: false }).limit(pageSize + 1);
  if (error || !data) throw new HostWorkspaceError(503, 'Messages could not be loaded.');

  const page = data.slice(0, pageSize);
  return {
    thread,
    earlierBefore: data.length > pageSize ? (page.at(-1)?.seq ?? null) : null,
    messages: page.reverse().flatMap((row) =>
      row.id
        ? [
            {
              id: row.id,
              body: row.redacted ? null : row.body,
              author: row.author,
              mine: row.mine === true,
              redacted: row.redacted === true,
              at: row.created_at,
            },
          ]
        : [],
    ),
  };
}
