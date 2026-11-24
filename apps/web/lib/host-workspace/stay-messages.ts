import 'server-only';

import { HostWorkspaceError, type HostWorkspaceAccess } from './access';

/*
 * Chats between a stay's guest and the host (migration 20270314000700). The RPCs check access themselves: the host
 * side is any member who can see the stay's unit. This file only turns their JSON into the workspace's shape and
 * their refusals into plain HTTP errors.
 */

/* 'nexg' is a NexG staff line, shown as "NexG"; 'system' is a "NexG joined" or "asked NexG" line (20270314001000). */
export type StaySide = 'guest' | 'host' | 'nexg' | 'system';

/** NexG's part in a chat: in it now, and whether someone asked and is still waiting for a NexG reply. */
export interface StayNexg {
  present: boolean;
  requestedAt: string | null;
  requestedSide: 'guest' | 'host' | null;
  waiting: boolean;
}

export interface StayThreadMessagePreview {
  body: string | null;
  at: string;
  side: StaySide;
  mine: boolean;
}

export interface StayThread {
  id: string;
  stayId: string;
  hostId: string;
  propertyId: string | null;
  unitId: string | null;
  propertyName: string | null;
  unitName: string | null;
  hostName: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  stayStatus: string;
  canSend: boolean;
  lastMessageAt: string | null;
  lastMessage: StayThreadMessagePreview | null;
  unread: number;
  nexg: StayNexg;
}

export interface StayMessage {
  id: string;
  seq: number;
  body: string | null;
  redacted: boolean;
  at: string;
  side: StaySide;
  mine: boolean;
  author: string | null;
}

export interface StayConversation {
  thread: StayThread;
  messages: StayMessage[];
  earlierBefore: number | null;
}

/* The refusals the RPCs raise on purpose. Anything else is not shown as it is. */
const PLAIN_REFUSALS = new Set([
  'Write a message first.',
  'Keep a message under 4,000 characters.',
  'Send the message again.',
  'This guest did not book through NexG, so this stay has no chat.',
  'The chat opens once the stay is booked.',
  'This chat is closed. Chats close 30 days after check-out.',
  'This stay is unavailable.',
]);

type RpcError = { code?: string; message?: string } | null;

export function stayChatError(error: RpcError, unavailable: string, fallback: string) {
  const message = error?.message ?? '';
  if (error?.code === '42501') return new HostWorkspaceError(404, unavailable);
  if (error?.code === '22023')
    return new HostWorkspaceError(
      400,
      PLAIN_REFUSALS.has(message) ? message : 'Check the message and try again.',
    );
  if (error?.code === '55000')
    return new HostWorkspaceError(
      409,
      PLAIN_REFUSALS.has(message) ? message : 'This chat is closed.',
    );
  return new HostWorkspaceError(503, fallback);
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const text = (value: unknown) => (typeof value === 'string' ? value : null);
const side = (value: unknown): StaySide =>
  value === 'guest' || value === 'nexg' || value === 'system' ? value : 'host';

function nexgOf(value: unknown): StayNexg {
  const nexg = isObject(value) ? value : {};
  return {
    present: nexg.present === true,
    requestedAt: text(nexg.requested_at),
    requestedSide:
      nexg.requested_side === 'guest' || nexg.requested_side === 'host'
        ? nexg.requested_side
        : null,
    waiting: nexg.waiting === true,
  };
}

export function threadOf(value: unknown): StayThread {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.stay_id !== 'string') {
    throw new HostWorkspaceError(503, 'The chat could not be loaded.');
  }
  const last = isObject(value.last_message) ? value.last_message : null;
  return {
    id: value.id,
    stayId: value.stay_id,
    hostId: text(value.host_id) ?? '',
    propertyId: text(value.property_id),
    unitId: text(value.unit_id),
    propertyName: text(value.property_name),
    unitName: text(value.unit_name),
    hostName: text(value.host_name) ?? 'Host',
    guestName: text(value.guest_name) ?? 'Guest',
    checkIn: text(value.check_in) ?? '',
    checkOut: text(value.check_out) ?? '',
    stayStatus: text(value.stay_status) ?? '',
    canSend: value.can_send === true,
    lastMessageAt: text(value.last_message_at),
    lastMessage: last
      ? {
          body: text(last.body),
          at: text(last.at) ?? '',
          side: side(last.side),
          mine: last.mine === true,
        }
      : null,
    unread:
      typeof value.unread === 'number' && Number.isSafeInteger(value.unread) ? value.unread : 0,
    nexg: nexgOf(value.nexg),
  };
}

function messageOf(value: unknown): StayMessage[] {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.seq !== 'number') return [];
  return [
    {
      id: value.id,
      seq: value.seq,
      body: value.redacted === true ? null : text(value.body),
      redacted: value.redacted === true,
      at: text(value.at) ?? '',
      side: side(value.side),
      mine: value.mine === true,
      author: text(value.author),
    },
  ];
}

export async function readStayThreads(
  access: HostWorkspaceAccess,
): Promise<{ threads: StayThread[] }> {
  const { data, error } = await access.db.rpc('rpc_stay_chat_host_threads', {
    p_host_id: access.hostId,
  });
  if (error)
    throw stayChatError(
      error,
      'Your guest chats are unavailable.',
      'Your guest chats could not be loaded.',
    );
  const rows = isObject(data) && Array.isArray(data.threads) ? data.threads : null;
  if (!rows) throw new HostWorkspaceError(503, 'Your guest chats could not be loaded.');
  return { threads: rows.map(threadOf) };
}

export async function readStayConversation(
  access: HostWorkspaceAccess,
  threadId: string,
  before: number | null,
): Promise<StayConversation> {
  const { data, error } = await access.db.rpc('rpc_stay_chat_host_messages', {
    p_thread_id: threadId,
    ...(before === null ? {} : { p_before: before }),
  });
  if (error)
    throw stayChatError(error, 'This chat is unavailable.', 'Messages could not be loaded.');
  if (!isObject(data) || !Array.isArray(data.messages)) {
    throw new HostWorkspaceError(503, 'Messages could not be loaded.');
  }
  const earlier = data.earlier_before;
  return {
    thread: threadOf(data.thread),
    messages: data.messages.flatMap(messageOf),
    earlierBefore: typeof earlier === 'number' && Number.isSafeInteger(earlier) ? earlier : null,
  };
}
