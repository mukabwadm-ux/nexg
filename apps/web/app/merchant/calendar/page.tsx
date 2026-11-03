import type { ReactElement } from 'react';
import { MerchantBookingWorkspace } from '@/components/merchant/booking/workspace';
import { requireMerchant } from '@/lib/partner';

export const metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

export default async function MerchantCalendarPage(): Promise<ReactElement> {
  await requireMerchant();
  return <MerchantBookingWorkspace />;
}
