import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';

import { merchantContext } from '@/components/merchant/frame';
import { MerchantShell, StateControl } from '@/components/merchant/shell';
import { MerchantAuthBoundary } from '@/components/merchant/auth-boundary';
import {
  MerchantWorkspaceShell,
  type MerchantWorkspaceNavItem,
} from '@/components/merchant/workspace/merchant-workspace-shell';
import { SignOut } from '@/components/partner/sign-out';

export const metadata: Metadata = {
  title: { default: 'Your business', template: '%s · NexG' },
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export interface MerchantHome {
  merchant_id: string;
  name: string;
  status: string;
  city: string;
  accepting_orders: boolean;
  busy_mode_until: string | null;
  readiness_pct: number;
  readiness: Record<string, boolean | number>;
  stores: number;
  items_available: number;
  unread_messages: number;
  documents_missing: number;
  documents_to_fix: number;
  documents_expiring: number;
  documents_asked_for: number;
  orders_today: number;
  orders_open: number;
  earned_today_cents: number;
  terms_to_accept: boolean;
  featured_state: string | null;
  health_band: string | null;
  health_score: number | null;
  prep_minutes: number | null;
  pay_on_delivery: boolean;
  pay_on_delivery_cap_kes: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  payout_rail: string | null;
  went_live_at: string | null;
  status_reason: string | null;
}

/**
 * The merchant side of the account.
 *
 * The shell is drawn here, once.
 *
 * It used to be each page's job, on the reasoning that the
 * dashboard's hero differs between the two states and a layout
 * could not know which to draw. That was true of the hero and
 * not of the sidebar — and the cost was that seven of the
 * fifteen boards simply forgot: Orders, Catalogue, Branches,
 * Money, Featured, Messages and Documents rendered as bare
 * content on an empty page, with no navigation and no way to
 * sign out. Nothing failed, nothing was logged, and every one
 * of them returned HTTP 200.
 *
 * A frame that each page has to remember is a frame some page
 * will forget. The hero still belongs to the dashboard; it is
 * just page content now, like everything else.
 *
 * `MerchantHome` stays exported from here because every board
 * reads it and one declaration beats fifteen.
 */
export default async function MerchantLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactNode> {
  const { m, live, nav, me } = await merchantContext({ setup: true });

  /* `merchantContext` has already established who is asking. A
     session with no merchant row has nothing to frame. */
  if (!m) redirect('/merchants/apply');

  if (me.access.state !== 'legacy') {
    const destinations: MerchantWorkspaceNavItem[] = [
      { label: 'Home', href: '/merchant' },
      { label: 'Work', href: '/merchant/orders' },
      { label: 'Offerings', href: '/merchant/menu' },
      { label: 'Availability', href: '/merchant/hours' },
      { label: 'Business', href: '/merchant/stores' },
      { label: 'Money', href: '/merchant/money' },
      { label: 'Promotions', href: '/merchant/promotions' },
      { label: 'Insights', href: '/merchant/insights' },
      { label: 'Settings', href: '/merchant/settings' },
    ];
    const approvalLabel = me.access.needs_resubmission
      ? 'Resubmit your changes'
      : me.access.state === 'approved'
        ? 'Workspace approved'
        : me.access.state === 'changes_requested'
          ? 'Changes requested'
          : 'Waiting for admin approval';
    return (
      <MerchantAuthBoundary
        merchantId={me.id}
        actorId={me.userId}
        access={me.access}
        isAnonymous={me.isAnonymous}
      >
        <MerchantWorkspaceShell
          businessName={m.name}
          approvalLabel={approvalLabel}
          setupDestinations={
            me.access.setup
              ? ['/merchant/menu', '/merchant/stores', '/merchant/hours', '/merchant/documents']
              : []
          }
          nav={destinations.map((item) => ({
            ...item,
            locked: item.label !== 'Home' && !me.access.operations,
          }))}
          headerEnd={
            me.isAnonymous ? (
              <Link
                href={
                  process.env.MERCHANT_EMAIL_OTP_ENABLED !== 'false'
                    ? '/merchants/verify-email'
                    : '/sign-in?tab=create&role=merchant&next=%2Fmerchant'
                }
                className="bg-gold text-ink rounded-lg px-3 py-2 text-sm font-bold"
              >
                {process.env.MERCHANT_EMAIL_OTP_ENABLED !== 'false'
                  ? 'Verify email'
                  : 'Create account'}
              </Link>
            ) : (
              <span className="bg-ink inline-flex rounded-lg px-1 py-0.5">
                <SignOut />
              </span>
            )
          }
        >
          {children}
        </MerchantWorkspaceShell>
      </MerchantAuthBoundary>
    );
  }

  return (
    <MerchantAuthBoundary
      merchantId={me.id}
      actorId={me.userId}
      access={me.access}
      isAnonymous={me.isAnonymous}
    >
      <MerchantShell
        businessName={m.name}
        personName={firstName(m.contact_name, m.name)}
        role="Owner"
        live={live}
        branchName={null}
        unreadCount={m.unread_messages ?? 0}
        nav={nav}
        operationsAllowed={me.access.operations}
        stateControl={
          <StateControl
            live={live}
            accepting={m.accepting_orders ?? false}
            busyUntil={m.busy_mode_until}
          />
        }
      >
        {children}
      </MerchantShell>
    </MerchantAuthBoundary>
  );
}

/** "Amina Kamau" greets as Amina; a business name never does. */
function firstName(contact: string | null, fallback: string): string {
  const first = (contact ?? '').trim().split(/\s+/)[0];
  return first && first.length > 1 ? first : fallback;
}
