import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  GoogleCalendarAdapter, GOOGLE_FREE_BUSY_SCOPE, GOOGLE_PORTAL_SCOPE,
  decryptGoogleTokens, encryptGoogleTokens, googleBookingEventId, mintOAuthState, verifyOAuthState,
} from '../src';
import type { GoogleBookingEventInput, OAuthStateClaims, PortalCalendarReference } from '../src';

const now = Date.parse('2026-10-31T09:00:00Z');
const calendar: PortalCalendarReference = { id: 'secondary@group.calendar.google.com', businessId: 'business-1', userId: 'user-1', createdByNexg: true };
const booking: GoogleBookingEventInput = {
  accessToken: 'fixture-access', calendar, businessId: 'business-1', bookingId: 'booking-1', revision: 2,
  start: '2026-11-01T09:00:00+03:00', end: '2026-11-01T10:00:00+03:00',
};
const eventId = googleBookingEventId(booking.businessId, booking.bookingId);
const owned = (revision = 1) => ({ id: eventId, etag: '"fixture-version"', extendedProperties: { private: { nexgBusinessId: booking.businessId, nexgBookingId: booking.bookingId, nexgRevision: String(revision) } } });
type Reply = { status?: number; body?: unknown; headers?: Record<string, string> } | Error;
function fixture(replies: Reply[]) {
  const requests: Array<{ url: string; method: string; headers: Headers; body: unknown }> = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? init.body : undefined;
    requests.push({ url: String(url), method: init?.method ?? 'GET', headers: new Headers(init?.headers), body });
    const reply = replies.shift();
    if (!reply) throw new Error('Unexpected fixture request');
    if (reply instanceof Error) throw reply;
    return new Response(reply.status === 204 ? null : JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200, headers: { 'Content-Type': 'application/json', ...reply.headers } });
  }) as typeof globalThis.fetch;
  const adapter = new GoogleCalendarAdapter({ clientId: 'fixture-client', clientSecret: 'fixture-secret', redirectUri: 'https://portal.nexg.test/google/callback', fetch, now: () => now });
  return { adapter, requests };
}

describe('OAuth session and encrypted token boundaries', () => {
  it('binds state to the authenticated business/user, expiry and an atomically consumed nonce', async () => {
    const secret = 'fixture-state-secret-32-random-bytes-long';
    const minted = mintOAuthState({ businessId: 'business-1', userId: 'user-1', secret, now, includeFreeBusy: true });
    const nonces = new Set([minted.claims.nonce]);
    const consumeNonce = async (claims: OAuthStateClaims) => nonces.delete(claims.nonce);
    const verify = { state: minted.state, secret, expectedBusinessId: 'business-1', expectedUserId: 'user-1', now, consumeNonce };
    await expect(verifyOAuthState({ ...verify, expectedBusinessId: 'other' })).rejects.toThrow('another session');
    await expect(verifyOAuthState(verify)).resolves.toMatchObject({ includeFreeBusy: true, businessId: 'business-1' });
    await expect(verifyOAuthState(verify)).rejects.toThrow('already been used');
    await expect(verifyOAuthState({ ...verify, state: `X${minted.state.slice(1)}` })).rejects.toThrow('signature');
    await expect(verifyOAuthState({ ...verify, now: now + 601_000 })).rejects.toThrow('expired');
  });
  it('encrypts tokens with random authenticated ciphertext bound to the owner', () => {
    const key = randomBytes(32); const binding = { businessId: 'business-1', userId: 'user-1' };
    const tokens = { accessToken: 'fixture-token', refreshToken: 'fixture-refresh' };
    const sealed = encryptGoogleTokens(tokens, key, binding);
    expect(sealed).not.toContain(tokens.refreshToken);
    expect(encryptGoogleTokens(tokens, key, binding)).not.toBe(sealed);
    expect(decryptGoogleTokens(sealed, key, binding)).toEqual(tokens);
    expect(() => decryptGoogleTokens(sealed, key, { ...binding, businessId: 'other' })).toThrow('decryption failed');
    expect(() => decryptGoogleTokens(sealed, randomBytes(32), binding)).toThrow('decryption failed');
    const parts = sealed.split('.'); parts[2] = Buffer.alloc(16).toString('base64url');
    expect(() => decryptGoogleTokens(parts.join('.'), key, binding)).toThrow('decryption failed');
  });
  it('requests only app-created calendars unless free/busy was explicitly enabled', () => {
    const { adapter, requests } = fixture([]);
    const limited = new URL(adapter.authorizationUrl({ state: 'signed-fixture-state' }));
    expect(limited.searchParams.get('scope')).toBe(GOOGLE_PORTAL_SCOPE);
    expect(limited.searchParams.get('access_type')).toBe('offline');
    expect(limited.searchParams.get('redirect_uri')).toBe('https://portal.nexg.test/google/callback');
    const enabled = new URL(adapter.authorizationUrl({ state: 'signed-fixture-state', includeFreeBusy: true }));
    expect(enabled.searchParams.get('scope')?.split(' ')).toEqual([GOOGLE_PORTAL_SCOPE, GOOGLE_FREE_BUSY_SCOPE]);
    expect(requests).toHaveLength(0);
  });
  it('exchanges form-encoded codes and preserves a refresh token omitted by Google', async () => {
    const { adapter, requests } = fixture([
      { body: { access_token: 'first', token_type: 'Bearer', expires_in: 3600, refresh_token: 'refresh', scope: GOOGLE_PORTAL_SCOPE } },
      { body: { access_token: 'second', token_type: 'Bearer', expires_in: 3600 } },
    ]);
    const first = await adapter.exchangeCode({ code: 'code+with/&symbols' });
    expect(first.expiresAt).toBe('2026-10-31T10:00:00.000Z');
    const params = new URLSearchParams(String(requests[0]?.body));
    expect(params.get('code')).toBe('code+with/&symbols');
    expect(params.get('grant_type')).toBe('authorization_code');
    expect(requests[0]?.headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
    const refreshed = await adapter.refreshAccessToken({ refreshToken: first.refreshToken! });
    expect(refreshed.refreshToken).toBe('refresh');
    expect(new URLSearchParams(String(requests[1]?.body)).get('grant_type')).toBe('refresh_token');
  });
  it('classifies revoked authorization without returning Google response secrets', async () => {
    const { adapter } = fixture([{ status: 400, body: { error: 'invalid_grant', error_description: 'fixture-sensitive-detail' } }]);
    await expect(adapter.refreshAccessToken({ refreshToken: 'revoked' })).rejects.toMatchObject({ code: 'authorization_revoked', status: 400 });
  });
});

describe('optional secondary calendar projection', () => {
  it('creates a distinct Kenya calendar owned by the authorized Google user', async () => {
    const { adapter, requests } = fixture([{ body: { id: calendar.id } }]);
    await expect(adapter.createPortalCalendar({ accessToken: 'fixture-access', businessId: 'business-1', userId: 'user-1', name: 'NEXG · My business' })).resolves.toEqual(calendar);
    expect(requests[0]?.method).toBe('POST');
    expect(JSON.parse(String(requests[0]?.body))).toMatchObject({ summary: 'NEXG · My business', timeZone: 'Africa/Nairobi' });
    expect(requests[0]?.headers.get('Authorization')).toBe('Bearer fixture-access');
  });
  it('uses a stable valid Google ID and no customer details in its default projection', async () => {
    expect(eventId).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(googleBookingEventId('business-2', booking.bookingId)).not.toBe(eventId);
    const { adapter, requests } = fixture([{ status: 404 }, { body: { id: eventId } }]);
    await expect(adapter.upsertBookingEvent(booking)).resolves.toMatchObject({ eventId, outcome: 'created' });
    const body = JSON.parse(String(requests[1]?.body));
    expect(body).toMatchObject({ id: eventId, summary: 'NEXG booking', start: { dateTime: booking.start, timeZone: 'Africa/Nairobi' } });
    expect(body).not.toHaveProperty('attendees');
    expect(requests[1]?.url).toContain('sendUpdates=none');
  });
  it('retries insertion races by reading the owned event and never duplicates it', async () => {
    const { adapter, requests } = fixture([{ status: 404 }, { status: 409 }, { body: owned(2) }]);
    await expect(adapter.upsertBookingEvent(booking)).resolves.toMatchObject({ outcome: 'unchanged', revision: 2 });
    expect(requests.map(request => request.method)).toEqual(['GET', 'POST', 'GET']);
  });
  it('uses If-Match and refuses to overwrite newer revisions or unowned events', async () => {
    const { adapter, requests } = fixture([{ body: owned() }, { body: { id: eventId } }, { body: owned(3) }]);
    await expect(adapter.upsertBookingEvent(booking)).resolves.toMatchObject({ outcome: 'updated' });
    expect(requests[1]?.headers.get('If-Match')).toBe('"fixture-version"');
    await expect(adapter.upsertBookingEvent(booking)).resolves.toMatchObject({ outcome: 'superseded', revision: 3 });
    const unowned = fixture([{ body: { ...owned(), extendedProperties: { private: { nexgBusinessId: 'other' } } } }]);
    await expect(unowned.adapter.upsertBookingEvent(booking)).rejects.toMatchObject({ code: 'not_owned' });
    expect(unowned.requests).toHaveLength(1);
  });
  it('surfaces concurrent modification and never silently overwrites it', async () => {
    const { adapter } = fixture([{ body: owned() }, { status: 412 }]);
    await expect(adapter.upsertBookingEvent(booking)).rejects.toMatchObject({ code: 'conflict', status: 412 });
  });
  it('deletes idempotently and refuses primary or cross-business mutation', async () => {
    const { adapter, requests } = fixture([{ status: 404 }, { body: owned() }, { status: 204 }]);
    await expect(adapter.deleteBookingEvent(booking)).resolves.toMatchObject({ outcome: 'absent' });
    await expect(adapter.deleteBookingEvent(booking)).resolves.toMatchObject({ outcome: 'deleted' });
    expect(requests[2]?.headers.get('If-Match')).toBe('"fixture-version"');
    const count = requests.length;
    await expect(adapter.upsertBookingEvent({ ...booking, calendar: { ...calendar, id: 'primary' } })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(adapter.upsertBookingEvent({ ...booking, businessId: 'other' })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(requests).toHaveLength(count);
  });
});

describe('explicit private-calendar free/busy checking', () => {
  const busyInput = { accessToken: 'fixture-access', freeBusyEnabled: true, selectedCalendarIds: ['selected-private'], timeMin: booking.start, timeMax: booking.end };
  it('does no Google request when not enabled and requires explicit calendar selection', async () => {
    const { adapter, requests } = fixture([]);
    await expect(adapter.readBusyIntervals({ ...busyInput, freeBusyEnabled: false })).resolves.toMatchObject({ state: 'DISABLED' });
    await expect(adapter.readBusyIntervals({ ...busyInput, selectedCalendarIds: [] })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(requests).toHaveLength(0);
  });
  it('returns current empty availability only when every selected calendar succeeds', async () => {
    const { adapter, requests } = fixture([{ body: { calendars: { 'selected-private': { busy: [] } } } }]);
    await expect(adapter.readBusyIntervals(busyInput)).resolves.toEqual({ state: 'CURRENT', intervals: [], observedAt: new Date(now).toISOString() });
    expect(JSON.parse(String(requests[0]?.body))).toMatchObject({ items: [{ id: 'selected-private' }], timeZone: 'Africa/Nairobi' });
  });
  it.each([
    [{ status: 429, headers: { 'Retry-After': '60' } }, 'rate_limited'],
    [{ status: 401 }, 'authorization_revoked'],
    [{ body: { calendars: { 'selected-private': { errors: [{ reason: 'notFound' }] } } } }, 'unavailable'],
    [{ body: { calendars: {} } }, 'unavailable'],
    [new Error('network fixture'), 'unavailable'],
    [{ body: { calendars: { 'selected-private': { busy: [{ start: 'bad', end: booking.end }] } } } }, 'invalid_response'],
  ] satisfies Array<[Reply, string]>)('returns UNKNOWN rather than free on failure %j', async (reply, reason) => {
    const { adapter } = fixture([reply]);
    const result = await adapter.readBusyIntervals(busyInput);
    expect(result).toMatchObject({ state: 'UNKNOWN', reason });
    expect(result).not.toHaveProperty('intervals');
    if (reason === 'rate_limited') expect(result).toMatchObject({ retryAfterSeconds: 60 });
  });
});
