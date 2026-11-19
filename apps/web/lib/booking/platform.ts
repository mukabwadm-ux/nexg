import { randomUUID } from 'node:crypto';
import { bookingHeaders } from './bridge';

/*
 * Calls NexG itself makes to the booking engine, signed with the `platform`
 * role: never on behalf of a customer or a business.
 *
 *   - settleEngineBookingPayment: a customer booking was paid in full; the
 *     engine confirms it. This is where a payment provider's settlement plugs
 *     in. No provider is connected for bookings yet (payments, piece 3, are on
 *     hold), so nothing calls it today.
 *   - forgetEngineCustomer: a customer deleted their account; the engine drops
 *     the name reserved under and the customer's reference at one business.
 */

const REF = /^(account|app_guest)_[0-9a-f-]{36}$/;
const ID = /^[A-Za-z0-9_-]{1,128}$/;

export type PlatformResult =
  | { ok: true; value: unknown }
  | { ok: false; status: number; code: string };

async function platformCall(
  merchantId: string,
  path: string,
  body: unknown,
  operationKey: string,
): Promise<PlatformResult> {
  const secret = process.env.BOOKING_BRIDGE_SECRET;
  const service = process.env.BOOKING_ENGINE_URL;
  if (!secret || secret.length < 32 || !service)
    return { ok: false, status: 503, code: 'connection_setup_required' };
  const base = new URL(service);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password)
    return { ok: false, status: 503, code: 'connection_invalid' };
  try {
    const response = await fetch(new URL(path, base), {
      method: 'POST',
      headers: {
        ...bookingHeaders(
          { businessId: merchantId, userId: 'nexg-platform', role: 'platform' },
          secret,
        ),
        'content-type': 'application/json',
        accept: 'application/json',
        'idempotency-key': operationKey,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
    const value = await response.json().catch(() => null);
    if (response.ok) return { ok: true, value };
    const type = (value as { type?: unknown } | null)?.type;
    return {
      ok: false,
      status: response.status,
      code: typeof type === 'string' ? type.replace('urn:nexg:booking:', '') : 'engine_error',
    };
  } catch {
    return { ok: false, status: 503, code: 'service_unavailable' };
  }
}

export function forgetEngineCustomer(merchantId: string, customerRef: string) {
  if (!ID.test(merchantId) || !REF.test(customerRef))
    return Promise.resolve<PlatformResult>({ ok: false, status: 422, code: 'invalid_input' });
  // Forgetting twice is harmless, so each attempt is its own operation.
  return platformCall(
    merchantId,
    '/v1/platform/customers/forget',
    { ref: customerRef },
    randomUUID(),
  );
}

export function settleEngineBookingPayment(input: {
  merchantId: string;
  bookingId: string;
  amountMinor: number;
  provider: string;
  reference: string;
}) {
  if (
    !ID.test(input.merchantId) ||
    !ID.test(input.bookingId) ||
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor < 1
  )
    return Promise.resolve<PlatformResult>({ ok: false, status: 422, code: 'invalid_input' });
  return platformCall(
    input.merchantId,
    `/v1/platform/bookings/${encodeURIComponent(input.bookingId)}/settle`,
    { amountMinor: input.amountMinor, provider: input.provider, reference: input.reference },
    `settle:${input.provider}:${input.reference}`.slice(0, 200),
  );
}

/**
 * A test payment while no payment provider is connected (owner, 19 Nov 2026).
 * The engine confirms the booking for exactly the amount due and records it
 * as `simulated`: no money is collected. Refused unless the engine has
 * BOOKING_SIMULATED_PAYMENTS=1; the website route also needs
 * NEXG_SIMULATED_PAYMENTS=1.
 */
export function simulateEngineBookingPayment(merchantId: string, bookingId: string) {
  if (!ID.test(merchantId) || !ID.test(bookingId))
    return Promise.resolve<PlatformResult>({ ok: false, status: 422, code: 'invalid_input' });
  const reference = `SIM-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  return platformCall(
    merchantId,
    `/v1/platform/bookings/${encodeURIComponent(bookingId)}/settle`,
    { provider: 'simulated', reference },
    `settle:simulated:${reference}`,
  );
}
