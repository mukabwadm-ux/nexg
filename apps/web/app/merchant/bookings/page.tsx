import type { SupabaseClient } from '@supabase/supabase-js';

import {
  BookingsBoard,
  type Booking,
  type Resource,
  type Slot,
} from '@/components/merchant/bookings-board';
import { PageHead } from '@/components/merchant/frame';
import { requireMerchant } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Bookings' };
export const dynamic = 'force-dynamic';

export default async function MerchantBookings() {
  const me = await requireMerchant();
  // The booking tables are newer than the generated database types.
  const db = createClient() as unknown as SupabaseClient;

  const [{ data: resources }, { data: bookings }, { data: slots }] = await Promise.all([
    db.from('bookable_resource').select('*').eq('merchant_id', me.id).order('created_at'),
    db
      .from('booking')
      .select(
        'id, reference, resource_id, starts_at, ends_at, quantity, status, guest_name, guest_phone, notes, total_cents, source',
      )
      .eq('merchant_id', me.id)
      .gte('ends_at', new Date(Date.now() - 7 * 864e5).toISOString())
      .order('starts_at')
      .limit(200),
    db
      .from('booking_slot')
      .select('id, resource_id, starts_at, ends_at, capacity, status')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at')
      .limit(200),
  ]);

  return (
    <div className="space-y-6 px-4 py-7 sm:px-6 lg:px-8">
      <PageHead
        title="Bookings"
        lead="Set up what people can book, then confirm requests, add walk-ins and block time. A time that is taken can never be booked twice."
      />
      <BookingsBoard
        resources={(resources as Resource[] | null) ?? []}
        bookings={(bookings as Booking[] | null) ?? []}
        slots={(slots as Slot[] | null) ?? []}
        merchantId={me.id}
      />
    </div>
  );
}
