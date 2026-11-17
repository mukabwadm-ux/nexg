import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  sessionRpc: vi.fn(),
  publicRpc: vi.fn(),
}));

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('next/headers', () => ({ headers: () => new Headers() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.sessionRpc }),
}));
vi.mock('@/lib/supabase/public', () => ({
  createPublicClient: () => ({ rpc: mocks.publicRpc }),
}));

import {
  confirmPlace,
  coverageFor,
  deletePlace,
  listPlaces,
  noteLocationEvent,
  resolveLocation,
} from './location-actions';

const guest = { data: { user: { id: 'guest-1', is_anonymous: false } }, error: null };
const signedOut = {
  data: { user: null },
  error: { name: 'AuthSessionMissingError', message: 'Auth session missing!' },
};
const anonymous = { data: { user: { id: 'anon-1', is_anonymous: true } }, error: null };

beforeEach(() => {
  mocks.getUser.mockReset();
  mocks.sessionRpc.mockReset();
  mocks.publicRpc.mockReset();
});

describe("saved places use the visitor's own session", () => {
  it("lists a signed-in guest's places through their session", async () => {
    mocks.getUser.mockResolvedValue(guest);
    mocks.sessionRpc.mockResolvedValue({ data: [{ id: 'p1', label: 'Home' }], error: null });

    await expect(listPlaces()).resolves.toEqual([{ id: 'p1', label: 'Home' }]);
    expect(mocks.sessionRpc).toHaveBeenCalledWith('rpc_place_list');
    expect(mocks.publicRpc).not.toHaveBeenCalled();
  });

  it.each([
    ['a signed-out visitor', signedOut],
    ['an anonymous session', anonymous],
  ])('does not ask the database for the places of %s', async (_who, user) => {
    mocks.getUser.mockResolvedValue(user);

    await expect(listPlaces()).resolves.toEqual([]);
    expect(mocks.sessionRpc).not.toHaveBeenCalled();
    expect(mocks.publicRpc).not.toHaveBeenCalled();
  });

  it("saves a Home pin to a signed-in guest's account", async () => {
    mocks.getUser.mockResolvedValue(guest);
    mocks.sessionRpc.mockResolvedValue({ data: { ok: true, stored: true, id: 'p1' }, error: null });
    const payload = { lat: -1.29, lng: 36.82, label: 'Home', save: true };

    await expect(confirmPlace(payload)).resolves.toEqual({ ok: true, stored: true, id: 'p1' });
    expect(mocks.sessionRpc).toHaveBeenCalledWith('rpc_place_confirm', { p_payload: payload });
  });

  it('keeps a "Just this once" pin off the account', async () => {
    mocks.getUser.mockResolvedValue(guest);

    await expect(confirmPlace({ lat: -1.29, lng: 36.82, save: false })).resolves.toMatchObject({
      ok: true,
      stored: false,
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.sessionRpc).not.toHaveBeenCalled();
  });

  it("keeps a signed-out visitor's pin on their device", async () => {
    mocks.getUser.mockResolvedValue(signedOut);

    await expect(confirmPlace({ lat: -1.29, lng: 36.82, save: true })).resolves.toMatchObject({
      ok: true,
      stored: false,
    });
    expect(mocks.sessionRpc).not.toHaveBeenCalled();
  });

  it('answers "not stored" when the save itself fails', async () => {
    mocks.getUser.mockResolvedValue(guest);
    mocks.sessionRpc.mockResolvedValue({ data: null, error: { message: 'refused' } });

    await expect(confirmPlace({ lat: -1.29, lng: 36.82, save: true })).resolves.toMatchObject({
      ok: true,
      stored: false,
    });
  });

  it("deletes through the guest's session and asks a signed-out visitor to sign in", async () => {
    mocks.getUser.mockResolvedValue(guest);
    mocks.sessionRpc.mockResolvedValue({ data: { ok: true, message: 'Deleted.' }, error: null });

    await expect(deletePlace('p1')).resolves.toMatchObject({ ok: true });
    expect(mocks.sessionRpc).toHaveBeenCalledWith('rpc_place_delete', { p_id: 'p1' });

    mocks.sessionRpc.mockReset();
    mocks.getUser.mockResolvedValue(signedOut);

    await expect(deletePlace('p1')).resolves.toMatchObject({ ok: false });
    expect(mocks.sessionRpc).not.toHaveBeenCalled();
  });
});

describe('calls that depend on who is asking, and ones that do not', () => {
  it("resolves through the session, so the account step can find the guest's last place", async () => {
    mocks.sessionRpc.mockResolvedValue({
      data: {
        step: 'account',
        chip_state: 'set',
        place: { label: 'Home', lat: -1.29, lng: 36.82 },
      },
      error: null,
    });

    await expect(resolveLocation({})).resolves.toMatchObject({ step: 'account' });
    expect(mocks.sessionRpc).toHaveBeenCalledWith('rpc_resolve_location', { p_context: {} });
    expect(mocks.publicRpc).not.toHaveBeenCalled();
  });

  it('records location consent through the session', async () => {
    mocks.sessionRpc.mockResolvedValue({ data: null, error: null });

    await noteLocationEvent('session-1', '/', 'shown');
    expect(mocks.sessionRpc).toHaveBeenCalledWith(
      'rpc_location_event',
      expect.objectContaining({ p_session: 'session-1', p_surface: '/', p_action: 'shown' }),
    );
  });

  it('keeps coverage on the public client, because the answer is the same for everyone', async () => {
    mocks.publicRpc.mockResolvedValue({ data: { coverage: 'covered' }, error: null });

    await expect(coverageFor(-1.29, 36.82)).resolves.toMatchObject({ coverage: 'covered' });
    expect(mocks.publicRpc).toHaveBeenCalledWith('rpc_coverage_lookup', {
      p_lat: -1.29,
      p_lng: 36.82,
    });
    expect(mocks.sessionRpc).not.toHaveBeenCalled();
  });
});
