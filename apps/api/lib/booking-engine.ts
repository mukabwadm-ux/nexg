/**
 * NexG's booking engine, as the API reaches it.
 *
 * Reservations (tours, transfers, rentals, appointments and requests) live in
 * the booking engine, on its own server with its own database, not in
 * Supabase (owner, 23 Nov 2026). The API reads a merchant's reservations from
 * it with the bridge secret the website already shares with the engine
 * (BOOKING_ENGINE_URL, BOOKING_BRIDGE_SECRET, server only), signing a
 * one-minute platform context for the key's merchant. The key decides the
 * business, as everywhere else in the API: a request never names one.
 *
 * The engine also posts its booking changes to POST /internal/booking-events
 * (app/internal/booking-events/route.ts), signed with the same secret under
 * its own prefix; see verifyEngineEvents.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@nexg/db';
import { ApiReservationSummary } from '@nexg/contracts/api';

import { noStoreFetch } from './no-store';

/** The engine is not set up for this deployment, or did not answer. */
export class BookingEngineUnavailable extends Error {}

export interface EngineConfig {
  url: string;
  secret: string;
}

/** The engine's address and the bridge secret, or null when either is missing. */
export function engineConfig(): EngineConfig | null {
  const url = process.env.BOOKING_ENGINE_URL?.trim();
  const secret = process.env.BOOKING_BRIDGE_SECRET ?? '';
  if (!url || !/^https?:\/\/[^\s]+$/.test(url) || secret.length < 32) return null;
  return { url: url.replace(/\/+$/, ''), secret };
}

/**
 * The signed context the engine checks (apps/booking-engine/src/auth.ts):
 * NexG itself, for one business, for one minute.
 */
export function platformHeaders(
  merchantId: string,
  keyId: string,
  secret: string,
  now = Date.now(),
): Record<string, string> {
  const context = Buffer.from(
    JSON.stringify({
      businessId: merchantId,
      userId: `api_key_${keyId}`,
      role: 'platform',
      expiresAt: now + 60_000,
    }),
  ).toString('base64url');
  return {
    'x-nexg-booking-context': context,
    'x-nexg-booking-signature': createHmac('sha256', secret).update(context).digest('hex'),
  };
}

export interface EngineAnswer {
  status: number;
  body: unknown;
}

/**
 * GET one of the engine's platform paths for a merchant.
 *
 * Throws BookingEngineUnavailable when the engine is not configured or
 * cannot be reached; any answer it gives comes back with its status.
 */
export async function engineGet(
  path: string,
  merchantId: string,
  keyId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<EngineAnswer> {
  const config = engineConfig();
  if (!config) throw new BookingEngineUnavailable('The booking engine is not configured.');
  let response: Response;
  try {
    response = await fetchImpl(`${config.url}${path}`, {
      headers: { ...platformHeaders(merchantId, keyId, config.secret), accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    throw new BookingEngineUnavailable(
      `The booking engine could not be reached: ${(error as Error)?.message ?? 'no answer'}`,
    );
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

/** The engine's problem detail, when it gave one. */
export function engineDetail(body: unknown): string | null {
  const detail = (body as { detail?: unknown } | null)?.detail;
  return typeof detail === 'string' && detail ? detail.slice(0, 300) : null;
}

/* ════════════════════════════════════════════════════════════ booking events from the engine */

export const EVENT_SIGNATURE_HEADER = 'x-nexg-booking-events-signature';
/** How far a batch's signing time may be from now, either way. */
const TOLERANCE_SECONDS = 300;

/**
 * Whether a batch of booking events was signed by the engine:
 * `t=<unix seconds>,v1=<hex HMAC-SHA256 of "booking-events:<t>.<body>">`,
 * keyed with the bridge secret, signed within five minutes of now.
 */
export function verifyEngineEvents(
  body: string,
  header: string | null,
  secret: string,
  now = Date.now(),
): boolean {
  if (!header || secret.length < 32) return false;
  const match = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/.exec(header);
  if (!match) return false;
  const t = Number(match[1]);
  if (Math.abs(now / 1000 - t) > TOLERANCE_SECONDS) return false;
  const expected = createHmac('sha256', secret).update(`booking-events:${t}.${body}`).digest();
  const given = Buffer.from(match[2]!, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** One outbox row from the engine (apps/booking-engine/src/event-delivery.ts). */
export const EngineEvent = z
  .object({
    event_key: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    event_type: z.string().min(1).max(80),
    business_id: z.string().min(1).max(128),
    record_id: z.string().max(128).nullable(),
    occurred_at: z.string().datetime({ offset: true }),
    /** For a booking event: the reservation as it is now. */
    reservation: ApiReservationSummary.nullable(),
  })
  .strict();

export type EngineEvent = z.infer<typeof EngineEvent>;

export const EngineEventBatch = z.object({ events: z.array(z.unknown()).min(1).max(100) }).strict();

export const INGEST_FUNCTION = 'rpc_api_reservation_events_ingest';

/**
 * The client that records the engine's events. Service role: the function is
 * granted to service_role only. It finds the merchant, keeps each
 * reservation's last status and queues reservation.* webhook events; this
 * client decides nothing. Server only.
 */
export function eventRecorder() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: noStoreFetch } },
  ) as unknown as {
    rpc: (
      name: typeof INGEST_FUNCTION,
      args: { p_events: EngineEvent[] },
    ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
  };
}
