/**
 * POST /internal/booking-events
 *
 * The booking engine's outbox, arriving (apps/booking-engine/src/event-delivery.ts).
 * Not part of the public API and not in its reference: only the engine,
 * which holds the bridge secret, can sign a batch.
 *
 * - The signature is checked over the raw body before anything is parsed.
 * - Each event is checked on its own. A malformed one is answered in
 *   `rejected`, so the engine stops sending it; the others still count.
 * - The database records the rest (rpc_api_reservation_events_ingest): it
 *   ignores an event key it has seen, keeps each reservation's last status,
 *   and queues reservation.created, reservation.status_changed or
 *   reservation.updated for the merchant's enabled live webhook endpoints.
 * - Only what was recorded is answered in `accepted`. Anything else (the
 *   database not answering, say) is a 5xx, and the engine sends it again.
 */
import { NextResponse } from 'next/server';

import {
  EVENT_SIGNATURE_HEADER,
  EngineEvent,
  EngineEventBatch,
  INGEST_FUNCTION,
  eventRecorder,
  verifyEngineEvents,
} from '@/lib/booking-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 512 * 1024;

function answer(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const secret = process.env.BOOKING_BRIDGE_SECRET ?? '';
  if (secret.length < 32) return answer(503, { error: 'not_configured' });

  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) {
    return answer(413, { error: 'too_large' });
  }
  const raw = await request.text();
  if (raw.length > MAX_BYTES) return answer(413, { error: 'too_large' });

  if (!verifyEngineEvents(raw, request.headers.get(EVENT_SIGNATURE_HEADER), secret)) {
    return answer(401, { error: 'invalid_signature' });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return answer(400, { error: 'invalid_json' });
  }
  const batch = EngineEventBatch.safeParse(parsed);
  if (!batch.success) return answer(400, { error: 'invalid_batch' });

  const valid: EngineEvent[] = [];
  const rejected: { event_key: string; reason: string }[] = [];
  for (const item of batch.data.events) {
    const event = EngineEvent.safeParse(item);
    if (event.success) {
      valid.push(event.data);
      continue;
    }
    const key = (item as { event_key?: unknown } | null)?.event_key;
    if (typeof key === 'string' && key) {
      rejected.push({
        event_key: key.slice(0, 128),
        reason: 'The event did not have the expected shape.',
      });
    }
  }

  let accepted: string[] = [];
  if (valid.length) {
    const { data, error } = await eventRecorder().rpc(INGEST_FUNCTION, { p_events: valid });
    if (error) {
      console.error('[booking-events] not recorded', error);
      return answer(503, { error: 'not_recorded' });
    }
    const keys = (data as { accepted?: unknown } | null)?.accepted;
    accepted = Array.isArray(keys)
      ? keys.filter((key): key is string => typeof key === 'string')
      : [];
  }

  return answer(200, { accepted, rejected });
}
