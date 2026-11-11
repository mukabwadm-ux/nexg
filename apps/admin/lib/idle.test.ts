import { describe, expect, it } from 'vitest';

import {
  STAFF_IDLE_TIMEOUT_MS,
  STAFF_SEEN_MAX_AGE_S,
  isStaffIdle,
  isStaffSessionIdle,
  readStaffSeen,
  sessionIdOf,
  writeStaffSeen,
} from './idle';

describe('isStaffIdle', () => {
  it('is five minutes', () => {
    expect(STAFF_IDLE_TIMEOUT_MS).toBe(5 * 60 * 1000);
  });

  it('lets the first request through (no cookie yet)', () => {
    expect(isStaffIdle(0, Date.now())).toBe(false);
  });

  it('lets an active session through', () => {
    const now = Date.now();
    expect(isStaffIdle(now - 30_000, now)).toBe(false);
  });

  it('signs out exactly at the timeout', () => {
    const now = Date.now();
    expect(isStaffIdle(now - STAFF_IDLE_TIMEOUT_MS, now)).toBe(false);
    expect(isStaffIdle(now - STAFF_IDLE_TIMEOUT_MS - 1, now)).toBe(true);
  });

  it('signs out a session idle far past the timeout', () => {
    const now = Date.now();
    expect(isStaffIdle(now - 60 * 60 * 1000, now)).toBe(true);
  });

  it('refuses a garbage cookie rather than reading it as recent', () => {
    // NaN from a corrupted cookie must not sneak through as "not idle".
    expect(isStaffIdle(Number('garbage'), Date.now())).toBe(false);
    expect(isStaffIdle(Number(''), Date.now())).toBe(false);
  });
});

/** A token shaped like Supabase's: only the payload matters here. */
function token(claims: Record<string, unknown>): string {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'HS256' })}.${part(claims)}.signature`;
}

const SIGN_IN = '7a9c1e2f-3b4d-4c5e-8f60-112233445566';
const EARLIER = '0f1e2d3c-4b5a-4968-8776-665544332211';

describe('the last-seen stamp', () => {
  it('lives as long as a sign-in can, not ten minutes', () => {
    expect(STAFF_SEEN_MAX_AGE_S).toBeGreaterThanOrEqual(30 * 24 * 60 * 60);
  });

  it('names the sign-in session it was made in', () => {
    expect(readStaffSeen(writeStaffSeen(SIGN_IN, 1_700_000_000_000))).toEqual({
      session: SIGN_IN,
      seen: 1_700_000_000_000,
    });
  });

  it('reads a stamp from before sessions were named as belonging to none', () => {
    expect(readStaffSeen('1700000000000')).toEqual({ session: '', seen: 1_700_000_000_000 });
  });

  it('reads nothing from a missing or corrupted cookie', () => {
    expect(readStaffSeen(undefined)).toBeNull();
    expect(readStaffSeen('')).toBeNull();
    expect(readStaffSeen(`${SIGN_IN}.garbage`)).toBeNull();
  });
});

describe('sessionIdOf', () => {
  it('reads the session_id claim of an access token', () => {
    expect(sessionIdOf(token({ sub: 'user', session_id: SIGN_IN }))).toBe(SIGN_IN);
  });

  it('is null for a token without one, or for anything that is not a token', () => {
    expect(sessionIdOf(token({ sub: 'user' }))).toBeNull();
    expect(sessionIdOf('not-a-token')).toBeNull();
    expect(sessionIdOf(undefined)).toBeNull();
    expect(sessionIdOf(token({ session_id: 'with.a.dot' }))).toBeNull();
  });
});

describe('isStaffSessionIdle', () => {
  const now = Date.now();

  it('signs out a session idle for six minutes', () => {
    const stamp = { session: SIGN_IN, seen: now - 6 * 60 * 1000 };
    expect(isStaffSessionIdle(stamp, SIGN_IN, now)).toBe(true);
  });

  it('signs out a session idle for thirty minutes, which the ten-minute cookie let through', () => {
    const stamp = { session: SIGN_IN, seen: now - 30 * 60 * 1000 };
    expect(isStaffSessionIdle(stamp, SIGN_IN, now)).toBe(true);
  });

  it('lets an active session through', () => {
    expect(isStaffSessionIdle({ session: SIGN_IN, seen: now - 30_000 }, SIGN_IN, now)).toBe(false);
  });

  it('lets the first request after signing in through', () => {
    expect(isStaffSessionIdle(null, SIGN_IN, now)).toBe(false);
  });

  it('does not close a new sign-in because of a stale stamp from an earlier one', () => {
    const stale = { session: EARLIER, seen: now - 24 * 60 * 60 * 1000 };
    expect(isStaffSessionIdle(stale, SIGN_IN, now)).toBe(false);
  });
});
