import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { BookingError, type Identity } from './types.js';

export function authenticate(
  headers: IncomingHttpHeaders,
  secret: string,
  now = Date.now(),
): Identity {
  const encoded = headers['x-nexg-booking-context'];
  const signature = headers['x-nexg-booking-signature'];
  if (
    typeof encoded !== 'string' ||
    typeof signature !== 'string' ||
    !secret ||
    encoded.length > 16000
  )
    throw new BookingError(401, 'Sign in to manage this calendar.', 'authentication_required');
  const expected = createHmac('sha256', secret).update(encoded).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, 'hex');
  } catch {
    throw new BookingError(401, 'Invalid session.', 'invalid_session');
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    throw new BookingError(401, 'Invalid session.', 'invalid_session');
  let value: Identity;
  try {
    value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new BookingError(401, 'Invalid session.', 'invalid_session');
  }
  // Accept epoch seconds or milliseconds from a trusted bridge, with a maximum five-minute lifetime.
  const expiry = value.expiresAt < 1e12 ? value.expiresAt * 1000 : value.expiresAt;
  if (
    !value.businessId ||
    !value.userId ||
    !value.role ||
    !Number.isFinite(expiry) ||
    expiry <= now ||
    expiry > now + 300_000
  )
    throw new BookingError(401, 'Your calendar session has expired.', 'session_expired');
  return value;
}

export function requireManager(identity: Identity) {
  if (!['owner', 'manager', 'admin'].includes(identity.role))
    throw new BookingError(
      403,
      'You do not have access to manage this business calendar.',
      'forbidden',
    );
}
