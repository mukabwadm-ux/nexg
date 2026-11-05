import { redirect } from 'next/navigation';

import { MerchantBookingWorkspace } from '@/components/merchant/booking/workspace';
import { bookingEngineConfigured } from '@/lib/booking/bridge';
import { requireMerchant } from '@/lib/partner';

export const metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

export default async function MerchantCalendarPage() {
  await requireMerchant();
  // Until the booking runtime is deployed, send merchants to the working
  // Bookings board rather than a "connection has not been configured" error.
  if (!bookingEngineConfigured(process.env)) redirect('/merchant/bookings');
  return <MerchantBookingWorkspace />;
}
