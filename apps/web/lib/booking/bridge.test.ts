import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  allowedBookingPath,
  bookingCustomerSession,
  bookingHeaders,
  localBookingSandboxEnabled,
  sameOriginMutation,
} from './bridge';

describe('booking portal boundary', () => {
  it('signs the trusted business identity with a bounded expiry', () => {
    const secret = 'a'.repeat(40);
    const headers = bookingHeaders(
      {
        businessId: 'business-a',
        userId: 'owner-a',
        role: 'owner',
        answers: { large: 'private onboarding content' },
      },
      secret,
      1000,
    );
    const payload = JSON.parse(
      Buffer.from(headers['x-nexg-booking-context'], 'base64url').toString(),
    );
    expect(payload).toMatchObject({ businessId: 'business-a', role: 'owner', expiresAt: 61_000 });
    expect(payload.answers).toBeUndefined();
    expect(headers['x-nexg-booking-signature']).toBe(
      createHmac('sha256', secret).update(headers['x-nexg-booking-context']).digest('hex'),
    );
  });
  it('does not expose merchant commands through customer routes', () => {
    expect(allowedBookingPath(['workspace'], 'GET', 'customer')).toBe(false);
    expect(allowedBookingPath(['bookings', 'other-id', 'confirm'], 'POST', 'customer')).toBe(false);
    expect(allowedBookingPath(['bookings', 'own-id', 'cancel'], 'POST', 'customer')).toBe(true);
    // The runtime authorizes each workflow command against the booking capability.
    expect(allowedBookingPath(['bookings', 'own-id', 'workflow'], 'POST', 'customer')).toBe(true);
    expect(allowedBookingPath(['bookings', 'own-id', 'workflow'], 'POST', 'merchant')).toBe(true);
    expect(allowedBookingPath(['bookings', 'own-id', 'workflow'], 'GET', 'customer')).toBe(false);
    expect(allowedBookingPath(['..', 'configuration'], 'PUT', 'merchant')).toBe(false);
  });
  it('rejects cross-origin and missing-origin mutations', () => {
    expect(
      sameOriginMutation(
        new Request('https://nexg.test/api/booking', {
          method: 'POST',
          headers: { origin: 'https://attacker.test' },
        }),
      ),
    ).toBe(false);
    expect(
      sameOriginMutation(new Request('https://nexg.test/api/booking', { method: 'POST' })),
    ).toBe(false);
    expect(
      sameOriginMutation(
        new Request('https://nexg.test/api/booking', {
          method: 'POST',
          headers: { origin: 'https://nexg.test' },
        }),
      ),
    ).toBe(true);
  });
  it('checks the browser Host when Next reconstructs an internal localhost URL', () => {
    expect(
      sameOriginMutation(
        new Request('http://localhost:3004/api/booking', {
          method: 'POST',
          headers: { host: '127.0.0.1:3004', origin: 'http://127.0.0.1:3004' },
        }),
      ),
    ).toBe(true);
    expect(
      sameOriginMutation(
        new Request('http://localhost:3004/api/booking', {
          method: 'POST',
          headers: { host: '127.0.0.1:3004', origin: 'http://attacker.test' },
        }),
      ),
    ).toBe(false);
    expect(
      sameOriginMutation(
        new Request('http://localhost:3004/api/booking', {
          method: 'POST',
          headers: {
            host: 'calendar.nexg.test',
            origin: 'https://calendar.nexg.test',
            'x-forwarded-proto': 'https',
          },
        }),
      ),
    ).toBe(true);
  });
  it('disables local workspace in production even with the flag', () => {
    expect(
      localBookingSandboxEnabled('localhost', {
        NODE_ENV: 'production',
        NEXG_BOOKING_SANDBOX: '1',
      }),
    ).toBe(false);
    expect(
      localBookingSandboxEnabled('example.test', {
        NODE_ENV: 'development',
        NEXG_BOOKING_SANDBOX: '1',
      }),
    ).toBe(false);
    expect(
      localBookingSandboxEnabled('127.0.0.1', {
        NODE_ENV: 'development',
        NEXG_BOOKING_SANDBOX: '1',
      }),
    ).toBe(true);
  });
  it('keeps separate anonymous customers and rejects tampered or expired session identities', () => {
    const secret = 's'.repeat(40),
      now = 1_800_000_000_000;
    const first = bookingCustomerSession(null, secret, now);
    const second = bookingCustomerSession(null, secret, now);
    expect(first.userId).not.toBe(second.userId);
    expect(
      bookingCustomerSession(`nexg_booking_session=${first.cookieValue}`, secret, now + 1000),
    ).toMatchObject({ userId: first.userId, created: false });
    expect(
      bookingCustomerSession(
        `nexg_booking_session=${first.cookieValue}`,
        secret,
        now + 31 * 86400_000,
      ).userId,
    ).not.toBe(first.userId);
    const tampered = first.cookieValue.replace(/^./, first.cookieValue[0] === 'A' ? 'B' : 'A');
    expect(bookingCustomerSession(`nexg_booking_session=${tampered}`, secret, now).userId).not.toBe(
      first.userId,
    );
  });
});
