import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Access from '@/lib/host-workspace/access';

const mock = vi.hoisted(() => ({ rpc: vi.fn(), access: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/host-workspace/access', async (importOriginal) => {
  const real = await importOriginal<typeof Access>();
  return { ...real, hostWorkspaceAccess: mock.access };
});

import { GET, POST } from './route';

const HOST = '11111111-1111-4111-8111-111111111111';
const THREAD = '22222222-2222-4222-8222-222222222222';
const STAY = '33333333-3333-4333-8333-333333333333';
const REQUEST = '44444444-4444-4444-8444-444444444444';
const URL_BASE = 'https://www.nexgapp.com/api/host-workspace/stay-messages';

const thread = {
  id: THREAD,
  stay_id: STAY,
  host_id: HOST,
  property_id: null,
  unit_id: '55555555-5555-4555-8555-555555555555',
  property_name: 'Block',
  unit_name: 'B',
  host_name: 'Host',
  guest_name: 'Amina',
  check_in: '2026-12-01T11:00:00+00:00',
  check_out: '2026-12-03T08:00:00+00:00',
  stay_status: 'booked',
  can_send: true,
  last_message_at: '2026-11-24T10:00:00+00:00',
  last_message: {
    body: 'Is there parking?',
    at: '2026-11-24T10:00:00+00:00',
    side: 'guest',
    mine: false,
  },
  unread: 1,
};

const get = (query = '') =>
  GET(new Request(URL_BASE + query, { headers: { authorization: 'Bearer ' + 'a'.repeat(40) } }));
const post = (
  body: unknown,
  headers: Record<string, string> = { authorization: 'Bearer ' + 'a'.repeat(40) },
) =>
  POST(
    new Request(URL_BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  mock.rpc.mockReset();
  mock.access.mockReset();
  mock.access.mockResolvedValue({
    db: { rpc: mock.rpc },
    hostId: HOST,
    userId: 'user-1',
    email: 'host@example.test',
    name: 'Host',
    role: 'Owner',
    unitScope: null,
  });
});

describe('GET /api/host-workspace/stay-messages', () => {
  it('lists the chats for the host account', async () => {
    mock.rpc.mockResolvedValue({ data: { threads: [thread] }, error: null });
    const response = await get();
    expect(response.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith('rpc_stay_chat_host_threads', { p_host_id: HOST });
    const body = await response.json();
    expect(body.threads).toHaveLength(1);
    expect(body.threads[0]).toMatchObject({
      id: THREAD,
      stayId: STAY,
      guestName: 'Amina',
      canSend: true,
      unread: 1,
      lastMessage: { body: 'Is there parking?', side: 'guest', mine: false },
    });
  });

  it('reads one chat with a page of messages', async () => {
    mock.rpc.mockResolvedValue({
      data: {
        thread,
        messages: [
          {
            id: 'm1',
            seq: 4,
            body: 'Hi',
            redacted: false,
            at: 'x',
            side: 'guest',
            mine: false,
            author: 'Amina',
          },
          {
            id: 'm2',
            seq: 5,
            body: 'gone',
            redacted: true,
            at: 'y',
            side: 'host',
            mine: true,
            author: 'Host',
          },
        ],
        earlier_before: 4,
      },
      error: null,
    });
    const response = await get(`?threadId=${THREAD}&before=9`);
    expect(mock.rpc).toHaveBeenCalledWith('rpc_stay_chat_host_messages', {
      p_thread_id: THREAD,
      p_before: 9,
    });
    const body = await response.json();
    expect(body.earlierBefore).toBe(4);
    expect(body.messages.map((m: { body: string | null }) => m.body)).toEqual(['Hi', null]);
    expect(body.thread.id).toBe(THREAD);
  });

  it('refuses a bad thread id before calling the database', async () => {
    const response = await get('?threadId=nope');
    expect(response.status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('hides a chat the member cannot see', async () => {
    mock.rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'This chat is unavailable.' },
    });
    const response = await get(`?threadId=${THREAD}`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'This chat is unavailable.' });
  });
});

describe('POST /api/host-workspace/stay-messages', () => {
  it('sends with the request id as the idempotency key', async () => {
    mock.rpc.mockResolvedValue({
      data: { ok: true, message_id: 'm9', seq: 7, repeat: false },
      error: null,
    });
    const response = await post({
      action: 'send',
      threadId: THREAD,
      requestId: REQUEST,
      body: ' Yes, bay 4. ',
    });
    expect(response.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith('rpc_stay_chat_host_send', {
      p_thread_id: THREAD,
      p_body: 'Yes, bay 4.',
      p_idempotency_key: REQUEST,
    });
    expect(await response.json()).toEqual({ ok: true, messageId: 'm9', seq: 7, repeat: false });
  });

  it('marks a chat read', async () => {
    mock.rpc.mockResolvedValue({ data: { ok: true, read_to: 7 }, error: null });
    const response = await post({ action: 'read', threadId: THREAD });
    expect(mock.rpc).toHaveBeenCalledWith('rpc_stay_chat_host_read', { p_thread_id: THREAD });
    expect(await response.json()).toEqual({ ok: true, readTo: 7 });
  });

  it('opens a stay chat and says when it was new', async () => {
    mock.rpc.mockResolvedValue({
      data: { ok: true, thread_id: THREAD, created: true, thread },
      error: null,
    });
    const response = await post({ action: 'open', stayId: STAY });
    expect(response.status).toBe(201);
    expect(mock.rpc).toHaveBeenCalledWith('rpc_stay_chat_host_open', { p_stay_id: STAY });
    expect((await response.json()).threadId).toBe(THREAD);
  });

  it('passes on the plain reason a chat is closed', async () => {
    mock.rpc.mockResolvedValue({
      data: null,
      error: {
        code: '55000',
        message: 'This chat is closed. Chats close 30 days after check-out.',
      },
    });
    const response = await post({
      action: 'send',
      threadId: THREAD,
      requestId: REQUEST,
      body: 'Hello',
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'This chat is closed. Chats close 30 days after check-out.',
    });
  });

  it('does not pass on database wording it does not know', async () => {
    mock.rpc.mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'internal detail' },
    });
    const response = await post({ action: 'open', stayId: STAY });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Check the message and try again.' });
  });

  it('refuses an empty or unknown action', async () => {
    expect(
      (await post({ action: 'send', threadId: THREAD, requestId: REQUEST, body: '  ' })).status,
    ).toBe(400);
    expect((await post({ action: 'delete', threadId: THREAD })).status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('refuses a cookie request from another website', async () => {
    const response = await post(
      { action: 'read', threadId: THREAD },
      { origin: 'https://evil.example', host: 'www.nexgapp.com' },
    );
    expect(response.status).toBe(403);
    expect(mock.access).not.toHaveBeenCalled();
  });
});
