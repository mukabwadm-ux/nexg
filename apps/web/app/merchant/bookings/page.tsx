import { BookingsBoard } from '@/components/merchant/bookings-board';
import { PageHead } from '@/components/merchant/frame';
import { loadBookingBoard } from '@/lib/booking/board-data';
import { requireMerchant } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Bookings' };
export const dynamic = 'force-dynamic';

export default async function MerchantBookings() {
  const me = await requireMerchant();
  const board = await loadBookingBoard(createClient(), me.id);

  return (
    <div className="space-y-6 px-4 py-7 sm:px-6 lg:px-8">
      <PageHead
        title="Bookings"
        lead="Set up what people can book, then confirm requests, add walk-ins and block time. A time that is taken can never be booked twice."
      />
      <BookingsBoard {...board} />
    </div>
  );
}
