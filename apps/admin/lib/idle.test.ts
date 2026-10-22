import { describe, expect, it } from 'vitest';

import { STAFF_IDLE_TIMEOUT_MS, isStaffIdle } from './idle';

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
