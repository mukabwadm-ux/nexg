/**
 * Sends the booking outbox to NexG.
 *
 * Every audited change writes a booking-outbox row in the same transaction
 * (BookingEngine.audit). This worker posts the pending rows to NexG's API
 * (NEXG_BOOKING_EVENTS_URL, `POST /internal/booking-events` on
 * api.nexgapp.com), which turns booking changes into the reservation.* webhook
 * events a business's own systems receive.
 *
 * - Off unless NEXG_BOOKING_EVENTS_URL is set (see server.ts).
 * - Each batch is signed with BOOKING_BRIDGE_SECRET, the secret the portal
 *   already shares with this runtime, under its own prefix
 *   (`booking-events:<t>.<body>`), so a signed context can never pass as an
 *   event batch or the other way round.
 * - A booking event carries the reservation's summary as it is when the batch
 *   is sent: no guest name, addresses or notes (see api-reservations.ts).
 *   booking.driver_assigned also carries the driver as set (first name,
 *   vehicle, plate), so NexG can tell the customer who is coming.
 *   Other events (setup, resources, offerings) carry only their type and id.
 * - NexG answers which event keys it accepted. Those become `delivered`; ones
 *   it rejected as malformed become `failed`; the rest are retried with
 *   back-off and become `failed` after MAX_ATTEMPTS. NexG ignores an event key
 *   it has already seen, so a resend after a lost answer changes nothing.
 */
import { createHmac } from 'node:crypto';
import { apiReservationSummary, type ApiReservation } from './api-reservations.js';
import { BookingError, type Identity } from './types.js';

type Doc = Record<string, any>;

export const EVENT_SIGNATURE_HEADER = 'x-nexg-booking-events-signature';
export const MAX_ATTEMPTS = 20;

/** `t=<unix seconds>,v1=<hex HMAC-SHA256 of "booking-events:<t>.<body>">`. */
export function signEvents(body: string, secret: string, now = Date.now()): string {
  const t = Math.floor(now / 1000);
  const v1 = createHmac('sha256', secret).update(`booking-events:${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

/** 5 s after the first failure, doubling, at most an hour. */
export function retryDelayMs(attempts: number): number {
  return Math.min(5_000 * 2 ** Math.max(attempts - 1, 0), 3_600_000);
}

export interface DeliveryOptions {
  url: string;
  secret: string;
  batchSize?: number;
  intervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface ReservationReader {
  platformReservation(identity: Identity, id: string): Promise<ApiReservation>;
}

const SYSTEM = { nexgSystem: true };

/** The driver an event names: a first name, a vehicle and maybe a plate, nothing else. */
function driverOf(
  value: unknown,
): { first_name: string; vehicle: string; plate: string | null } | null {
  if (!value || typeof value !== 'object') return null;
  const driver = value as Doc;
  if (typeof driver.first_name !== 'string' || typeof driver.vehicle !== 'string') return null;
  return {
    first_name: driver.first_name,
    vehicle: driver.vehicle,
    plate: typeof driver.plate === 'string' ? driver.plate : null,
  };
}

export class EventDelivery {
  private running = false;

  constructor(
    private readonly payload: any,
    private readonly engine: ReservationReader,
    private readonly options: DeliveryOptions,
  ) {
    if (!/^https?:\/\//.test(options.url))
      throw new Error('NEXG_BOOKING_EVENTS_URL must be an http(s) address.');
    if (options.secret.length < 32)
      throw new Error('BOOKING_BRIDGE_SECRET must have at least 32 characters.');
  }

  /** Runs a delivery every intervalMs; returns the function that stops it. */
  start(): () => void {
    const timer = setInterval(() => {
      this.tick().catch((error) => console.error('[booking-events]', error));
    }, this.options.intervalMs ?? 5_000);
    timer.unref?.();
    return () => clearInterval(timer);
  }

  /** One batch: the oldest pending rows that are due. */
  async tick(): Promise<{ sent: number; delivered: number; failed: number }> {
    if (this.running) return { sent: 0, delivered: 0, failed: 0 };
    this.running = true;
    try {
      const now = (this.options.now ?? Date.now)();
      const found = await this.payload.find({
        collection: 'booking-outbox',
        where: { state: { equals: 'pending' } },
        sort: 'createdAt',
        limit: 200,
        depth: 0,
        overrideAccess: true,
        context: SYSTEM,
      });
      const due = (found.docs as Doc[])
        .filter(
          (row) =>
            !row.attempts || Date.parse(row.updatedAt) + retryDelayMs(Number(row.attempts)) <= now,
        )
        .slice(0, this.options.batchSize ?? 25);
      if (!due.length) return { sent: 0, delivered: 0, failed: 0 };

      const events: Doc[] = [];
      for (const row of due) events.push(await this.event(row, now));
      const body = JSON.stringify({ events });

      const accepted = new Set<string>();
      const rejected = new Map<string, string>();
      let problem: string | null = null;
      try {
        const response = await (this.options.fetchImpl ?? fetch)(this.options.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [EVENT_SIGNATURE_HEADER]: signEvents(body, this.options.secret, now),
          },
          body,
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
        });
        if (!response.ok) problem = `NexG answered HTTP ${response.status}`;
        else {
          const answer = (await response.json()) as {
            accepted?: unknown;
            rejected?: unknown;
          };
          for (const key of Array.isArray(answer.accepted) ? answer.accepted : [])
            accepted.add(String(key));
          for (const item of Array.isArray(answer.rejected) ? answer.rejected : [])
            if (item && typeof item === 'object')
              rejected.set(
                String((item as Doc).event_key),
                String((item as Doc).reason ?? 'rejected').slice(0, 200),
              );
        }
      } catch (error) {
        problem = String((error as Error)?.message || 'NexG could not be reached').slice(0, 200);
      }

      let delivered = 0;
      let failed = 0;
      for (const row of due) {
        const attempts = Number(row.attempts ?? 0) + 1;
        const data = accepted.has(row.eventKey)
          ? { state: 'delivered', attempts, lastError: null }
          : rejected.has(row.eventKey)
            ? { state: 'failed', attempts, lastError: rejected.get(row.eventKey) }
            : {
                state: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
                attempts,
                lastError: problem ?? 'Not acknowledged by NexG.',
              };
        if (data.state === 'delivered') delivered++;
        if (data.state === 'failed') failed++;
        await this.payload.update({
          collection: 'booking-outbox',
          id: row.id,
          data,
          depth: 0,
          overrideAccess: true,
          context: SYSTEM,
        });
      }
      return { sent: due.length, delivered, failed };
    } finally {
      this.running = false;
    }
  }

  /** The event for one outbox row, with the reservation's summary when the row is about one. */
  private async event(row: Doc, now: number): Promise<Doc> {
    const businessId = String(row.businessId);
    const recordId = typeof row.payload?.recordId === 'string' ? row.payload.recordId : null;
    let reservation = null;
    if (recordId && String(row.eventType).startsWith('booking.')) {
      try {
        reservation = apiReservationSummary(
          await this.engine.platformReservation(
            {
              businessId,
              userId: 'nexg-booking-events',
              role: 'platform',
              expiresAt: now + 60_000,
            },
            recordId,
          ),
        );
      } catch (error) {
        // Setup, resource and offering events name no booking.
        if (!(error instanceof BookingError && error.status === 404)) throw error;
      }
    }
    return {
      event_key: String(row.eventKey),
      event_type: String(row.eventType),
      business_id: businessId,
      record_id: recordId,
      occurred_at: new Date(row.createdAt ?? now).toISOString(),
      reservation,
      ...(row.eventType === 'booking.driver_assigned' && driverOf(row.payload?.driver)
        ? { driver: driverOf(row.payload.driver) }
        : {}),
    };
  }
}
