import { MerchantBookingWorkspace } from '@/components/merchant/booking/workspace';

export const metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

export default function MerchantCalendarPage() {
  return <MerchantBookingWorkspace />;
}
