import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/*
 * The Consumer app books through the same public booking bridge as the
 * website, but it has no website cookie. It sends its Supabase session as
 * `Authorization: Bearer <access token>` instead. This file checks that token
 * with Supabase and keeps the app's bookings (engine id + private token) in
 * `customer_engine_booking`, so the customer sees them on any device.
 */

export type AppBookingSession =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | {
      kind: 'signed_in';
      userId: string;
      anonymous: boolean;
      /** Supabase client acting as this customer (row-level security applies). */
      client: SupabaseClient;
    };

const BEARER = /^Bearer ([A-Za-z0-9._-]{20,4096})$/;

export async function appBookingSession(request: Request): Promise<AppBookingSession> {
  const header = request.headers.get('authorization');
  if (!header) return { kind: 'none' };
  const token = BEARER.exec(header.trim())?.[1];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return { kind: 'invalid' };
  try {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return { kind: 'invalid' };
    return {
      kind: 'signed_in',
      userId: data.user.id,
      anonymous: data.user.is_anonymous === true,
      client,
    };
  } catch {
    return { kind: 'invalid' };
  }
}

/**
 * The engine identity for an app customer. Accounts and temporary (guest)
 * sessions get separate prefixes, and neither can collide with the website's
 * cookie guests (`guest_<random>`).
 */
export function appBookingUserId(session: { userId: string; anonymous: boolean }) {
  return `${session.anonymous ? 'app_guest' : 'account'}_${session.userId}`;
}

/** The private token for one of this customer's own app bookings, if saved. */
export async function savedCustomerToken(
  client: SupabaseClient,
  businessId: string,
  bookingId: string,
): Promise<string | null> {
  try {
    const { data, error } = await client
      .from('customer_engine_booking')
      .select('customer_token')
      .eq('merchant_id', businessId)
      .eq('engine_booking_id', bookingId)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { customer_token: string }).customer_token;
  } catch {
    return null;
  }
}

interface EngineBooking {
  id?: unknown;
  offeringId?: unknown;
  offeringName?: unknown;
  status?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  priceMinor?: unknown;
}

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : null);
const time = (v: unknown) =>
  typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;
const status = (v: unknown) => (typeof v === 'string' && /^[a-z_]{1,40}$/.test(v) ? v : null);
const cents = (v: unknown) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;

function summary(booking: EngineBooking) {
  return {
    title: str(booking.offeringName, 200),
    status: status(booking.status),
    starts_at: time(booking.startTime),
    ends_at: time(booking.endTime),
    total_cents: cents(booking.priceMinor),
  };
}

/**
 * After the engine answers, keep the customer's list current: a new booking is
 * saved with its private token; a read or change refreshes the summary. Never
 * fails the customer's request: the engine already holds the booking.
 */
export async function recordAppBooking(
  client: SupabaseClient,
  businessId: string,
  parts: string[],
  method: string,
  body: unknown,
  catalogueItemId: string | null,
) {
  try {
    if (!body || typeof body !== 'object') return;
    const created = method === 'POST' && parts.length === 1 && parts[0] === 'bookings';
    if (created) {
      const { booking, customerToken } = body as {
        booking?: EngineBooking;
        customerToken?: unknown;
      };
      if (!booking || typeof booking.id !== 'string' || !ID.test(booking.id)) return;
      if (typeof customerToken !== 'string') return;
      await client.from('customer_engine_booking').upsert(
        {
          merchant_id: businessId,
          engine_booking_id: booking.id,
          customer_token: customerToken,
          catalogue_item_id: catalogueItemId,
          offering_id:
            typeof booking.offeringId === 'string' && ID.test(booking.offeringId)
              ? booking.offeringId
              : null,
          ...summary(booking),
        },
        { onConflict: 'user_id,engine_booking_id', ignoreDuplicates: true },
      );
      return;
    }
    if (parts[0] !== 'bookings' || !parts[1]) return;
    // A read returns the booking; a change returns it directly or under `booking`.
    const raw = body as EngineBooking & { booking?: EngineBooking };
    const booking = raw.booking && typeof raw.booking === 'object' ? raw.booking : raw;
    if (booking.id !== parts[1]) return;
    const changes = Object.fromEntries(
      Object.entries(summary(booking)).filter(([, value]) => value !== null),
    );
    if (!Object.keys(changes).length) return;
    await client
      .from('customer_engine_booking')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('merchant_id', businessId)
      .eq('engine_booking_id', parts[1]);
  } catch {
    // The list is a convenience; the engine is the record.
  }
}
