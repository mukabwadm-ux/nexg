import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Booking, Resource, Slot } from '@/components/merchant/bookings-board';

export interface BookingBoardData {
  merchantId: string;
  resources: Resource[];
  bookings: Booking[];
  slots: Slot[];
}

export async function legacyBookingState(
  client: unknown,
  merchantId: string,
): Promise<'clear' | 'legacy' | 'unavailable'> {
  const db = client as SupabaseClient;
  try {
    const [resources, bookings] = await Promise.all([
      db
        .from('bookable_resource')
        .select('id')
        .eq('merchant_id', merchantId)
        .eq('active', true)
        .limit(1),
      db
        .from('booking')
        .select('id')
        .eq('merchant_id', merchantId)
        .in('status', ['pending', 'confirmed', 'blocked'])
        .gt('ends_at', new Date().toISOString())
        .limit(1),
    ]);
    if (resources.error || bookings.error || !resources.data || !bookings.data)
      return 'unavailable';
    return resources.data.length || bookings.data.length ? 'legacy' : 'clear';
  } catch {
    return 'unavailable';
  }
}

/**
 * What the bookings board shows: the merchant's bookable resources, bookings
 * from the last week on, and upcoming slots. Read from the main database, so
 * it works without the separate booking engine. Row-level security limits
 * every read to the merchant's own rows.
 */
export async function loadBookingBoard(
  client: unknown,
  merchantId: string,
): Promise<BookingBoardData> {
  // The booking tables are newer than the generated database types.
  const db = client as SupabaseClient;
  const [{ data: resources }, { data: bookings }] = await Promise.all([
    db.from('bookable_resource').select('*').eq('merchant_id', merchantId).order('created_at'),
    db
      .from('booking')
      .select(
        'id, reference, resource_id, starts_at, ends_at, quantity, status, guest_name, guest_phone, notes, total_cents, source',
      )
      .eq('merchant_id', merchantId)
      .gte('ends_at', new Date(Date.now() - 7 * 864e5).toISOString())
      .order('starts_at')
      .limit(200),
  ]);
  const own = ((resources as Resource[] | null) ?? []).map((resource) => resource.id);
  /* Slots are publicly readable, so they are narrowed to this merchant's own
     resources rather than left to row-level security. */
  const { data: slots } = own.length
    ? await db
        .from('booking_slot')
        .select('id, resource_id, starts_at, ends_at, capacity, status')
        .in('resource_id', own)
        .gte('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(200)
    : { data: [] };
  return {
    merchantId,
    resources: (resources as Resource[] | null) ?? [],
    bookings: (bookings as Booking[] | null) ?? [],
    slots: (slots as Slot[] | null) ?? [],
  };
}
