import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import type { MerchantHome } from '@/app/merchant/layout';
import { DashboardSetup } from '@/components/merchant/dashboard-setup';
import type { AttentionRow, BranchCard, SetupProgress } from '@/components/merchant/types';

export const metadata = { title: 'Merchant preview' };

const merchant: MerchantHome = {
  merchant_id: 'preview-kijani-kitchen',
  name: 'Kijani Kitchen',
  status: 'documents_pending',
  city: 'Nairobi',
  accepting_orders: false,
  busy_mode_until: null,
  readiness_pct: 57,
  readiness: {},
  stores: 1,
  items_available: 12,
  unread_messages: 2,
  documents_missing: 1,
  documents_to_fix: 0,
  documents_expiring: 0,
  documents_asked_for: 0,
  orders_today: 0,
  orders_open: 0,
  earned_today_cents: 0,
  terms_to_accept: false,
  featured_state: null,
  health_band: null,
  health_score: null,
  prep_minutes: 25,
  pay_on_delivery: false,
  pay_on_delivery_cap_kes: null,
  contact_name: 'Amina Kamau',
  contact_phone: '+254 700 123 456',
  contact_email: 'amina@example.test',
  payout_rail: null,
  went_live_at: null,
  status_reason: 'documents_pending',
};

const progress: SetupProgress = {
  merchant_id: merchant.merchant_id,
  trading_name: merchant.name,
  status: merchant.status,
  submitted_at: '2026-10-20T09:00:00+03:00',
  went_live_at: null,
  step_profile: true,
  step_hours: true,
  step_team: true,
  step_catalogue: true,
  step_documents: false,
  step_payout: false,
  step_live: false,
  done_count: 4,
  of_count: 7,
  next_step: 5,
  can_go_live: false,
  is_live: false,
};

const branches: BranchCard[] = [
  {
    branch_id: 'preview-westlands',
    merchant_id: merchant.merchant_id,
    name: 'Westlands Kitchen',
    address_text: 'Mwanzi Road, Westlands · Nairobi',
    is_primary: true,
    pin_confirmed: true,
    state: 'setting_up',
    orders_today: 0,
    prep_avg_minutes: 25,
    catalogue_items: 12,
  },
];

const attention: AttentionRow[] = [];

const sections: Record<
  string,
  {
    title: string;
    lead: string;
    metrics: Array<{ label: string; value: string; note: string }>;
    rows: Array<{ title: string; detail: string; state: string }>;
  }
> = {
  orders: {
    title: 'Orders',
    lead: 'A preview of the order queue merchants use to accept and prepare new orders.',
    metrics: [
      { label: 'Needs accepting', value: '2', note: 'sample orders' },
      { label: 'Preparing', value: '1', note: 'sample order' },
      { label: 'Ready for rider', value: '1', note: 'sample order' },
    ],
    rows: [
      { title: 'NX-2048 · 2 items', detail: 'Kilimani · M-Pesa · KES 1,860', state: 'New' },
      { title: 'NX-2045 · 3 items', detail: 'Westlands · Card · KES 2,450', state: 'Preparing' },
      { title: 'NX-2041 · 1 item', detail: 'Kileleshwa · Folio · KES 950', state: 'Ready' },
    ],
  },
  menu: {
    title: 'Catalogue',
    lead: 'Manage the dishes and prices guests see when they discover your business.',
    metrics: [
      { label: 'Available items', value: '12', note: 'sample catalogue' },
      { label: 'Categories', value: '3', note: 'sample groups' },
      { label: 'Sold out', value: '1', note: 'sample item' },
    ],
    rows: [
      { title: 'Coconut chicken biryani', detail: 'Mains · KES 1,250', state: 'Available' },
      { title: 'Pilau bowl', detail: 'Mains · KES 950', state: 'Available' },
      { title: 'Mango passion juice', detail: 'Drinks · KES 380', state: 'Sold out' },
    ],
  },
  hours: {
    title: 'Hours',
    lead: 'Set when each branch accepts orders and how much time the kitchen needs to prepare them.',
    metrics: [
      { label: 'Today', value: '08:00–21:00', note: 'sample hours' },
      { label: 'Prep time', value: '25 min', note: 'sample estimate' },
      { label: 'Busy mode', value: 'Off', note: 'preview state' },
    ],
    rows: [
      { title: 'Monday–Friday', detail: '8:00 AM to 9:00 PM', state: 'Open' },
      { title: 'Saturday', detail: '9:00 AM to 10:00 PM', state: 'Open' },
      { title: 'Sunday', detail: '9:00 AM to 6:00 PM', state: 'Open' },
    ],
  },
  stores: {
    title: 'Branches',
    lead: 'Keep each storefront address, hours, menu and setup status together.',
    metrics: [
      { label: 'Branches', value: '1', note: 'sample branch' },
      { label: 'Catalogue items', value: '12', note: 'sample items' },
      { label: 'Setup', value: 'In progress', note: 'sample status' },
    ],
    rows: [
      { title: 'Westlands Kitchen', detail: 'Mwanzi Road · Nairobi', state: 'Setup in progress' },
    ],
  },
  money: {
    title: 'Money',
    lead: 'Review the payout breakdown. Figures below are sample values for this preview.',
    metrics: [
      { label: 'Gross sales', value: 'KES 18,420', note: 'sample week' },
      { label: 'NexG fees', value: 'KES 2,763', note: 'sample week' },
      { label: 'Net payable', value: 'KES 15,657', note: 'sample week' },
    ],
    rows: [
      { title: 'Next payout', detail: 'Friday · M-Pesa till ending 2048', state: 'Preview' },
      { title: 'Payout method', detail: 'Set this up before going live', state: 'Not set' },
    ],
  },
  transactions: {
    title: 'Transactions',
    lead: 'A sample ledger of order payments, fees, refunds and payouts.',
    metrics: [
      { label: 'This week', value: '8', note: 'sample transactions' },
      { label: 'Refunds', value: '1', note: 'sample transaction' },
      { label: 'Pending payout', value: 'KES 15,657', note: 'sample amount' },
    ],
    rows: [
      { title: 'NX-2048 · Order payment', detail: 'KES 1,860 · Today, 10:42 AM', state: 'Paid' },
      { title: 'NexG service fee', detail: 'KES 279 · Today, 10:42 AM', state: 'Deducted' },
      { title: 'Weekly payout', detail: 'KES 15,657 · Friday', state: 'Pending' },
    ],
  },
  analytics: {
    title: 'Analytics',
    lead: 'See how your catalogue and branch are performing. All figures are sample data.',
    metrics: [
      { label: 'Profile visits', value: '326', note: 'sample week' },
      { label: 'Orders', value: '18', note: 'sample week' },
      { label: 'Repeat guests', value: '6', note: 'sample week' },
    ],
    rows: [
      { title: 'Most ordered', detail: 'Coconut chicken biryani · 8 orders', state: 'Sample' },
      { title: 'Busiest period', detail: 'Friday · 6:00 PM–8:00 PM', state: 'Sample' },
    ],
  },
  featured: {
    title: 'Featured',
    lead: 'Featured placements can put your business near the top of Explore.',
    metrics: [
      { label: 'Eligibility', value: 'After go-live', note: 'sample guidance' },
      { label: 'Placement', value: 'Nairobi West', note: 'sample zone' },
      { label: 'Duration', value: '7 days', note: 'sample slot' },
    ],
    rows: [
      {
        title: 'Nairobi West · Explore',
        detail: 'A week-long placement for local guests.',
        state: 'Preview',
      },
    ],
  },
  messages: {
    title: 'Messages',
    lead: 'Keep setup questions and order conversations in one place.',
    metrics: [
      { label: 'Unread', value: '2', note: 'sample messages' },
      { label: 'Open threads', value: '1', note: 'sample thread' },
      { label: 'Merchant ops', value: 'Online', note: 'sample status' },
    ],
    rows: [
      {
        title: 'Merchant ops',
        detail: 'Welcome. We can help finish your documents and payout setup.',
        state: '2 new',
      },
      { title: 'Order NX-2048', detail: 'Guest asked for no coriander.', state: 'Sample' },
    ],
  },
  disputes: {
    title: 'Disputes',
    lead: 'Review order issues and respond with the context your team has.',
    metrics: [
      { label: 'Open', value: '1', note: 'sample case' },
      { label: 'Needs reply', value: '1', note: 'sample case' },
      { label: 'Resolved this week', value: '2', note: 'sample cases' },
    ],
    rows: [
      {
        title: 'NX-2032 · Missing item',
        detail: 'Guest reported one drink missing.',
        state: 'Needs reply',
      },
    ],
  },
  reviews: {
    title: 'Reviews',
    lead: 'Read guest feedback and see the public replies attached to your business.',
    metrics: [
      { label: 'Rating', value: '4.8', note: 'sample average' },
      { label: 'Reviews', value: '24', note: 'sample total' },
      { label: 'Reply needed', value: '2', note: 'sample reviews' },
    ],
    rows: [
      { title: '“Fresh, generous portions.”', detail: 'Guest review · Yesterday', state: 'Reply' },
      { title: '“Delivery was quick.”', detail: 'Guest review · Monday', state: 'Replied' },
    ],
  },
  team: {
    title: 'Team',
    lead: 'Invite people who help run your branches and set their access level.',
    metrics: [
      { label: 'Members', value: '3', note: 'sample team' },
      { label: 'Owners', value: '1', note: 'sample role' },
      { label: 'Invites', value: '1', note: 'sample invite' },
    ],
    rows: [
      { title: 'Amina Kamau', detail: 'Owner · Westlands Kitchen', state: 'Active' },
      { title: 'Brian Otieno', detail: 'Manager · Westlands Kitchen', state: 'Active' },
      { title: 'Wanjiku Njeri', detail: 'Counter staff · Invite sent', state: 'Invited' },
    ],
  },
  documents: {
    title: 'Documents',
    lead: 'Upload permits and certificates so merchant operations can verify your business.',
    metrics: [
      { label: 'Verified', value: '2', note: 'sample files' },
      { label: 'Needed', value: '1', note: 'sample file' },
      { label: 'Under review', value: '1', note: 'sample file' },
    ],
    rows: [
      { title: 'Business registration', detail: 'Uploaded 20 Oct', state: 'Verified' },
      {
        title: 'Food handling certificate',
        detail: 'Upload a clear photo or PDF',
        state: 'Needed',
      },
      { title: 'KRA PIN certificate', detail: 'Uploaded 21 Oct', state: 'Under review' },
    ],
  },
  settings: {
    title: 'Settings',
    lead: 'Update the business details guests see and the defaults your team works with.',
    metrics: [
      { label: 'Business', value: 'Kijani Kitchen', note: 'sample profile' },
      { label: 'Contact', value: 'Amina Kamau', note: 'sample owner' },
      { label: 'Prep estimate', value: '25 min', note: 'sample default' },
    ],
    rows: [
      { title: 'Guest-facing name', detail: 'Kijani Kitchen', state: 'Preview' },
      { title: 'Service area', detail: 'Westlands · Nairobi', state: 'Preview' },
    ],
  },
  support: {
    title: 'Support',
    lead: 'Send a question to merchant operations and follow up on open tickets.',
    metrics: [
      { label: 'Open tickets', value: '1', note: 'sample ticket' },
      { label: 'Typical reply', value: 'Same day', note: 'sample estimate' },
      { label: 'Setup guide', value: 'Available', note: 'sample resource' },
    ],
    rows: [
      {
        title: 'Help finishing setup',
        detail: 'Merchant ops can walk through documents and payouts.',
        state: 'Open',
      },
    ],
  },
};

export default function MerchantPreviewSectionPage({
  params,
}: {
  params: { section: string };
}): ReactNode {
  if (process.env.NODE_ENV !== 'development') notFound();

  if (params.section === 'dashboard') {
    return (
      <DashboardSetup
        m={merchant}
        progress={progress}
        branches={branches}
        attention={attention}
        personName="Amina"
        guestPreview
      />
    );
  }

  const section = sections[params.section];
  if (!section) notFound();

  return (
    <main className="space-y-6 px-4 py-7 sm:px-6 lg:px-8">
      <header>
        <p className="text-gold-text text-[0.6875rem] font-extrabold uppercase tracking-[0.12em]">
          Merchant portal preview
        </p>
        <h1 className="mt-1 font-serif text-[1.875rem] font-extrabold tracking-tight">
          {section.title}
        </h1>
        <p className="text-muted mt-2 max-w-3xl text-[0.9375rem] font-semibold leading-[1.7]">
          {section.lead}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {section.metrics.map((metric) => (
          <section key={metric.label} className="border-border bg-surface rounded-xl border p-4">
            <p className="text-muted text-[0.75rem] font-bold">{metric.label}</p>
            <p className="text-ink mt-2 text-[1.25rem] font-extrabold tracking-tight">
              {metric.value}
            </p>
            <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold">{metric.note}</p>
          </section>
        ))}
      </div>

      <section className="border-border bg-surface overflow-hidden rounded-xl border">
        <div className="border-border border-b px-4 py-3">
          <h2 className="text-[0.9375rem] font-extrabold tracking-tight">
            Sample {section.title.toLowerCase()}
          </h2>
        </div>
        <ul className="divide-border divide-y">
          {section.rows.map((row) => (
            <li
              key={row.title}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
            >
              <div>
                <p className="text-[0.8125rem] font-extrabold">{row.title}</p>
                <p className="text-muted mt-1 text-[0.75rem] font-semibold">{row.detail}</p>
              </div>
              <span className="bg-gold-soft text-gold-text rounded-full px-2.5 py-1 text-[0.6875rem] font-extrabold">
                {row.state}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
