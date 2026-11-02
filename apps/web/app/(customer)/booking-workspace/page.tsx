import { CalendarDays } from 'lucide-react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { MerchantBookingWorkspace } from '@/components/merchant/booking/workspace';
import { MerchantShell } from '@/components/merchant/shell';
import { localBookingSandboxEnabled } from '@/lib/booking/bridge';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'NEXG calendar workspace',
  robots: { index: false, follow: false },
};

export default function BookingDevelopmentWorkspace() {
  let hostname = '';
  try {
    hostname = new URL(`http://${headers().get('host') ?? ''}`).hostname;
  } catch {
    /* Invalid host remains unavailable. */
  }
  if (!localBookingSandboxEnabled(hostname, process.env)) notFound();
  return (
    <MerchantShell
      businessName="NEXG Local Workspace"
      personName="Local workspace"
      role="Development"
      live={false}
      branchName="Local booking data"
      unreadCount={0}
      guestPreview
      stateControl={
        <span className="bg-gold-soft text-gold-text rounded-full px-3 py-1 text-xs font-bold">
          Local development
        </span>
      }
      nav={[
        {
          href: '/booking-workspace',
          label: 'Calendar',
          icon: <CalendarDays className="h-4 w-4" />,
        },
      ]}
    >
      <MerchantBookingWorkspace apiBase="/api/booking-workspace" development />
    </MerchantShell>
  );
}
