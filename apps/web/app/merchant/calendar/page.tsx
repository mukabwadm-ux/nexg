import { MerchantBookingWorkspace } from '@/components/merchant/booking/workspace';
import { requireMerchant } from '@/lib/partner';

export const metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

export default async function MerchantCalendarPage() {
  await requireMerchant();
  return <MerchantBookingWorkspace />;
}
