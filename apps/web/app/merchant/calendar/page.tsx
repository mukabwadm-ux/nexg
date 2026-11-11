import { redirect } from 'next/navigation';

import { MerchantBookingWorkspace } from '@/components/merchant/booking/workspace';
import { bookingEngineEnabledForMerchant } from '@/lib/booking/bridge';
import { requireMerchant } from '@/lib/partner';

export const metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

export default async function MerchantCalendarPage() {
  const merchant = await requireMerchant();
  if (!bookingEngineEnabledForMerchant(merchant.id, process.env)) redirect('/merchant/bookings');
  return <MerchantBookingWorkspace />;
}
