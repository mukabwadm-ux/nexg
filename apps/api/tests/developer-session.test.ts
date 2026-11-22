import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, signOut } = vi.hoisted(() => ({ rpc: vi.fn(), signOut: vi.fn() }));
vi.mock('@/lib/session', () => ({ createClient: () => ({ rpc, auth: { signOut } }) }));

import { keepDeveloperSession } from '../app/developers/session-actions';
import { developerSession, IDLE_SIGN_IN } from '../lib/developer-session';

const client = { rpc } as unknown as Parameters<typeof developerSession>[0];
const deadline = '2026-11-22T18:07:00.000Z';

beforeEach(() => {
  vi.clearAllMocks();
  signOut.mockResolvedValue({ error: null });
});

describe("the developer's sign-in, as the console sees it", () => {
  it('reports activity when asked, and reads the deadline', async () => {
    rpc.mockResolvedValue({ data: { valid: true, expires_at: deadline }, error: null });
    expect(await developerSession(client, true)).toEqual({ state: 'current', expiresAt: deadline });
    expect(rpc).toHaveBeenCalledWith('rpc_developer_session', { p_activity: true });
  });

  it('has no deadline when nothing binds the sign-in (no merchant)', async () => {
    rpc.mockResolvedValue({ data: { valid: true, expires_at: null }, error: null });
    expect(await developerSession(client, false)).toEqual({ state: 'current', expiresAt: null });
  });

  it('knows a lapsed sign-in', async () => {
    rpc.mockResolvedValue({ data: { valid: false, reason: 'session_expired' }, error: null });
    expect(await developerSession(client, true)).toEqual({ state: 'lapsed' });
  });

  it('does not guess when the database cannot say, as before the function exists', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    expect(await developerSession(client, true)).toEqual({ state: 'unknown' });
    rpc.mockRejectedValue(new Error('network'));
    expect(await developerSession(client, true)).toEqual({ state: 'unknown' });
  });

  it('sends an idle developer to the sign-in page with the reason', () => {
    expect(IDLE_SIGN_IN).toBe('/sign-in?next=/developers&reason=idle');
  });
});

describe('the heartbeat', () => {
  it('keeps a busy developer signed in and hands back the next deadline', async () => {
    rpc.mockResolvedValue({ data: { valid: true, expires_at: deadline }, error: null });
    expect(await keepDeveloperSession(true)).toEqual({ lapsed: false, expiresAt: deadline });
    expect(rpc).toHaveBeenCalledWith('rpc_developer_session', { p_activity: true });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('only asks, without reporting activity, when the deadline passes', async () => {
    rpc.mockResolvedValue({ data: { valid: true, expires_at: null }, error: null });
    expect(await keepDeveloperSession(false)).toEqual({ lapsed: false, expiresAt: null });
    expect(rpc).toHaveBeenCalledWith('rpc_developer_session', { p_activity: false });
  });

  it('ends a lapsed sign-in, this one only', async () => {
    rpc.mockResolvedValue({ data: { valid: false, reason: 'session_expired' }, error: null });
    expect(await keepDeveloperSession(true)).toEqual({ lapsed: true, expiresAt: null });
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('carries on as before when the database cannot say', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    expect(await keepDeveloperSession(true)).toEqual({ lapsed: false, expiresAt: null });
    expect(signOut).not.toHaveBeenCalled();
  });
});
