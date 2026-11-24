import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ rpc: vi.fn(), access: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/host-workspace/access', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/host-workspace/access')>();
  return { ...real, hostWorkspaceAccess: mock.access };
});

import { GET, POST } from './route';

const HOST = '11111111-1111-4111-8111-111111111111';
const THREAD = '22222222-2222-4222-8222-222222222222';
const STAY = '33333333-3333-4333-8333-333333333333';
const REQUEST = '44444444-4444-4444-8444-444444444444';
const URL_BASE = 'https://www.nexgapp.com/api/host-workspace/stay-messages';

const thread = {
  nexg: {
    present: true,
    requested_at: '2026-11-24T10:05:00+00:00',
    requested_side: 'guest',
    waiting: false,
  },
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

// NexG in stay chats (20270314001000): what the host workspace passes on, and "Get NexG's help".
describe('NexG in a stay chat', () => {
  it('passes on NexG lines, system lines and whether NexG is in the chat', async () => {
    mock.rpc.mockResolvedValueOnce({
      data: {
        thread,
        messages: [
          {
            id: 'm1',
            seq: 1,
            body: 'Amina asked NexG to help.',
            redacted: false,
            at: '2026-11-24T10:05:00+00:00',
            side: 'system',
            mine: false,
            author: 'Amina',
          },
          {
            id: 'm2',
            seq: 2,
            body: 'NexG here, on it.',
            redacted: false,
            at: '2026-11-24T10:06:00+00:00',
            side: 'nexg',
            mine: false,
            author: 'NexG',
          },
        ],
        earlier_before: null,
      },
      error: null,
    });
    const response = await get('?threadId=' + THREAD);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.thread.nexg).toEqual({
      present: true,
      requestedAt: '2026-11-24T10:05:00+00:00',
      requestedSide: 'guest',
      waiting: false,
    });
    expect(body.messages.map((m: { side: string; author: string }) => [m.side, m.author])).toEqual([
      ['system', 'Amina'],
      ['nexg', 'NexG'],
    ]);
  });

  it('reads an older thread with no nexg key as NexG not in it', async () => {
    const { nexg: _drop, ...old } = thread;
    void _drop;
    mock.rpc.mockResolvedValueOnce({ data: { threads: [old] }, error: null });
    const body = await (await get()).json();
    expect(body.threads[0].nexg).toEqual({
      present: false,
      requestedAt: null,
      requestedSide: null,
      waiting: false,
    });
  });

  it('asks NexG to help, once', async () => {
    mock.rpc.mockResolvedValueOnce({ data: { ok: true, already: false }, error: null });
    const response = await post({ action: 'ask-nexg', threadId: THREAD });
    expect(response.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith('rpc_stay_chat_host_ask_nexg', { p_thread_id: THREAD });
    expect((await response.json()).message).toBe(
      'NexG has been asked to help. They will reply in this chat.',
    );

    mock.rpc.mockResolvedValueOnce({ data: { ok: true, already: true }, error: null });
    expect((await (await post({ action: 'ask-nexg', threadId: THREAD })).json()).already).toBe(
      true,
    );
  });

  it('hides a chat the member cannot see when asking NexG', async () => {
    mock.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'This chat is unavailable.' },
    });
    expect((await post({ action: 'ask-nexg', threadId: THREAD })).status).toBe(404);
  });
});
