import {
  ArrowLeft,
  BedDouble,
  CalendarCheck,
  CircleAlert,
  CreditCard,
  Gift,
  History,
  LayoutDashboard,
  LifeBuoy,
  MapPin,
  Receipt,
  ShoppingBag,
  Star,
  Undo2,
  Wallet,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ShareDonut, TrendArea } from '@/components/charts';
import { ConsoleShell } from '@/components/console-shell';
import { CustomerActions } from '@/components/customers/customer-actions';
import { CustomerAvatar, EmptyNote, Fact, WaitingForDatabase } from '@/components/customers/shared';
import {
  CategoryChip,
  DashCanvas,
  DashCard,
  DashHeader,
  DashKpi,
  DashKpiGrid,
  GoldTabs,
  StatusChip,
} from '@/components/portal/dash';
import {
  actionLabel,
  ago,
  day,
  dayTime,
  displayName,
  isMissingFunction,
  kes,
  oneOf,
  parseProfile,
  toneOf,
  words,
  type CustomerProfile,
} from '@/lib/customers';
import { hrefWith } from '@/lib/portal';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Customer' };
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'orders', label: 'Orders', icon: ShoppingBag },
  { key: 'bookings', label: 'Bookings & Stays', icon: CalendarCheck },
  { key: 'payments', label: 'Transactions', icon: CreditCard },
  { key: 'reviews', label: 'Reviews', icon: Star },
  { key: 'support', label: 'Support', icon: LifeBuoy },
  { key: 'notes', label: 'Notes & History', icon: History },
] as const;
type Tab = (typeof TABS)[number]['key'];

/**
 * One customer: who they are, everything they bought, booked and paid for,
 * refunds and failed payments, what they like, what they told support, and
 * what staff did on their account. Opening it is recorded in the audit log
 * because contact details show in full.
 */
export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { tab?: string };
}) {
  const staff = await requireStaff();
  if (!staff.isSuperAdmin) requireModule(staff, 'customers');
  if (!UUID.test(params.id)) notFound();

  const tab: Tab = oneOf(
    TABS.map((t) => t.key),
    searchParams?.tab,
    'overview',
  );

  const { data, error } = await createClient().rpc('rpc_customer_profile', { p_id: params.id });
  const waiting = isMissingFunction(error);
  const p = parseProfile(error ? null : data);
  if (!error && !p.found) notFound();

  const c = p.customer;
  const name = displayName(c.name, c.phone, c.email);
  const net = p.stats.gross - p.stats.refunded;
  const average = p.stats.purchases > 0 ? Math.round(p.stats.gross / p.stats.purchases) : null;
  const canAct = p.level === 'full' || p.level === 'limited';
  const counts: Partial<Record<Tab, number>> = {
    orders: p.orders.length,
    bookings: p.bookings.length + p.stays.length,
    payments: p.transactions.length,
    reviews: p.reviews.length,
    support: p.tickets.length,
    notes: p.notes.length,
  };

  return (
    <ConsoleShell staff={staff}>
      <DashHeader
        title={error ? 'Customer' : name}
        subtitle={
          error
            ? 'A customer of NexG.'
            : `${c.hasAccount ? 'Customer account' : 'Guest without an account, known by their phone number'} · joined ${day(c.joinedAt)}`
        }
        actions={
          !error && canAct ? (
            <CustomerActions
              id={c.id}
              blocked={c.blocked}
              vip={c.vip}
              canResend={c.hasAccount && Boolean(c.email) && !c.emailConfirmedAt}
            />
          ) : undefined
        }
      />

      <DashCanvas>
        <Link
          href="/customers"
          className="inline-flex items-center gap-1.5 px-1 text-sm font-bold text-white/85 hover:text-white"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> All customers
        </Link>

        {waiting ? (
          <WaitingForDatabase />
        ) : error ? (
          <p
            role="alert"
            className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
          >
            This customer could not be loaded: {error.message}
          </p>
        ) : (
          <>
            {c.blocked && (
              <p
                role="status"
                className="bg-danger-bg text-danger flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold"
              >
                <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                Suspended{c.blockReason ? `: ${c.blockReason}` : ''}. They cannot place orders.
              </p>
            )}

            <ProfileCard p={p} name={name} />

            <DashKpiGrid>
              <DashKpi
                featured
                icon={Wallet}
                label="Lifetime Value"
                value={kes(net)}
                explain="Everything this customer paid for orders, bookings and stays, less refunds issued."
              />
              <DashKpi
                icon={Receipt}
                label="Purchases"
                value={p.stats.purchases.toLocaleString('en-KE')}
                explain="Paid orders, bookings and stays."
              >
                <span className="text-muted mt-1.5 block text-[0.8125rem] font-semibold">
                  {p.stats.cancelled > 0 ? `${p.stats.cancelled} cancelled` : 'None cancelled'}
                </span>
              </DashKpi>
              <DashKpi
                icon={ShoppingBag}
                label="Average Order"
                value={average == null ? null : kes(average)}
                explain="What they paid, before refunds, divided by the number of purchases."
              >
                {average == null && (
                  <span className="text-muted mt-1 block text-[0.8125rem] font-semibold">
                    Nothing bought yet
                  </span>
                )}
              </DashKpi>
              <DashKpi
                icon={Undo2}
                label="Refunded"
                value={kes(p.stats.refunded)}
                explain="Refunds issued to this customer for orders and stays."
              />
              <DashKpi
                icon={CircleAlert}
                iconTone={p.stats.failedPayments > 0 ? 'red' : 'gold'}
                label="Failed Payments"
                value={p.stats.failedPayments.toLocaleString('en-KE')}
                explain="Payment attempts that failed: M-Pesa prompts declined or timed out, cards refused."
                href={hrefWith(`/customers/${c.id}`, { tab: 'payments' })}
              />
            </DashKpiGrid>

            <GoldTabs
              label="Customer"
              active={tab}
              tabs={TABS.map((t) => ({
                key: t.key,
                label: t.label,
                icon: t.icon,
                href: hrefWith(`/customers/${c.id}`, { tab: t.key === 'overview' ? null : t.key }),
                count: counts[t.key] ?? null,
              }))}
            />

            {tab === 'overview' && <Overview p={p} />}
            {tab === 'orders' && <Orders p={p} />}
            {tab === 'bookings' && <Bookings p={p} />}
            {tab === 'payments' && <Transactions p={p} />}
            {tab === 'reviews' && <Reviews p={p} />}
            {tab === 'support' && <Support p={p} />}
            {tab === 'notes' && <Notes p={p} />}
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}

/* ───────────────────────────────────────────────────────── the profile */

function ProfileCard({ p, name }: { p: CustomerProfile; name: string }) {
  const c = p.customer;
  return (
    <DashCard>
      <div className="flex flex-wrap items-start gap-4">
        <CustomerAvatar name={name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[1.25rem] font-extrabold">{name}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {c.blocked ? (
              <StatusChip tone="red">Suspended</StatusChip>
            ) : (
              <StatusChip tone="green">Active</StatusChip>
            )}
            <StatusChip tone={c.hasAccount ? 'blue' : 'grey'}>
              {c.hasAccount ? 'Account' : 'Guest · no account'}
            </StatusChip>
            {c.vip && <StatusChip tone="gold">VIP</StatusChip>}
            {c.hasAccount && c.email && (
              <StatusChip tone={c.emailConfirmedAt ? 'green' : 'amber'}>
                {c.emailConfirmedAt ? 'Email verified' : 'Email not verified'}
              </StatusChip>
            )}
            {c.isPartner && <StatusChip tone="grey">Also a partner or staff</StatusChip>}
          </div>
        </div>
      </div>
      <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Phone">
          {c.phone ?? '—'}
          {c.phone && c.phoneConfirmedAt && (
            <span className="text-success ml-1.5 text-xs font-bold">confirmed</span>
          )}
        </Fact>
        <Fact label="Email">{c.email ?? '—'}</Fact>
        <Fact label="Joined">{day(c.joinedAt)}</Fact>
        <Fact label="Last signed in">{c.hasAccount ? dayTime(c.lastSignInAt) : 'No account'}</Fact>
        <Fact label="First purchase">{day(p.stats.firstPurchaseAt)}</Fact>
        <Fact label="Last purchase">
          {p.stats.lastPurchaseAt ? ago(p.stats.lastPurchaseAt) : 'Never'}
        </Fact>
        <Fact label="App notifications">
          {c.pushDevices > 0
            ? `${c.pushDevices} device${c.pushDevices === 1 ? '' : 's'}, seen ${ago(c.pushLastSeenAt).toLowerCase()}`
            : 'None'}
        </Fact>
        <Fact label="Marketing messages">
          {c.marketingConsent == null ? 'Not asked' : c.marketingConsent ? 'Agreed' : 'Declined'}
        </Fact>
      </dl>
    </DashCard>
  );
}

/* ─────────────────────────────────────────────────────────── overview */

function Overview({ p }: { p: CustomerProfile }) {
  const monthly = p.monthly.map((m) => ({
    day: `${m.month}-01`,
    spend: Math.round(m.cents / 100),
  }));
  const anySpend = p.monthly.some((m) => m.cents > 0);
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <DashCard title="Spend by Month" titleNote="(last 12 months)">
          {anySpend ? (
            <TrendArea
              data={monthly}
              unit="kes"
              step="month"
              series={[{ key: 'spend', label: 'Spend', fill: true }]}
            />
          ) : (
            <EmptyNote>Nothing paid in the last 12 months.</EmptyNote>
          )}
        </DashCard>
        <DashCard title="Favourite Categories">
          {p.categories.length > 0 ? (
            <ShareDonut
              stacked
              unit="kes"
              centre={Math.round(
                p.categories.reduce((sum, x) => sum + x.cents, 0) / 100,
              ).toLocaleString('en-KE')}
              caption="Spent"
              data={p.categories.map((x) => ({
                key: x.key.replace(/[^a-z0-9]/gi, '_'),
                label: x.label,
                value: Math.round(x.cents / 100),
              }))}
            />
          ) : (
            <EmptyNote>No paid purchases yet, so no favourites.</EmptyNote>
          )}
        </DashCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <DashCard title="Favourite Merchants">
          {p.merchants.length > 0 ? (
            <ol className="space-y-2.5">
              {p.merchants.map((m, i) => (
                <li key={m.id ?? i} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-bold">
                    {m.id ? (
                      <Link href={`/merchants/${m.id}`} className="hover:underline">
                        {m.name ?? 'Merchant'}
                      </Link>
                    ) : (
                      (m.name ?? 'Merchant')
                    )}
                  </span>
                  <span className="text-muted shrink-0 text-sm font-semibold tabular-nums">
                    {m.count} × · {kes(m.cents)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyNote>No paid purchases from a merchant yet.</EmptyNote>
          )}
        </DashCard>

        <DashCard title="Saved Places">
          {p.addresses.length > 0 ? (
            <ul className="space-y-3">
              {p.addresses.map((a) => (
                <li key={a.id} className="flex gap-2.5">
                  <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#E5A800]" />
                  <span className="min-w-0">
                    <span className="block font-bold">{a.label ?? 'Place'}</span>
                    <span className="text-muted block text-sm font-semibold">
                      {[a.address, a.landmark].filter(Boolean).join(' · ') || '—'}
                    </span>
                    <span className="text-muted-light block text-xs font-semibold">
                      {a.lastUsedAt
                        ? `Last used ${ago(a.lastUsedAt).toLowerCase()}`
                        : 'Not used yet'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote>No saved delivery places.</EmptyNote>
          )}
        </DashCard>

        <DashCard title="Saved Shops & Rewards">
          {p.saved.length > 0 ? (
            <ul className="space-y-2">
              {p.saved.map((s, i) => (
                <li key={s.merchantId ?? i} className="flex justify-between gap-3 text-sm">
                  <span className="truncate font-bold">{s.merchant ?? 'Merchant'}</span>
                  <span className="text-muted shrink-0 font-semibold">
                    {s.items > 0 ? `${s.items} item${s.items === 1 ? '' : 's'}` : 'Shop'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted text-sm font-semibold">Nothing saved.</p>
          )}
          <p className="border-border text-muted mt-4 flex items-start gap-2 border-t pt-3 text-sm font-semibold">
            <Gift aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#E5A800]" />
            NexG has no customer points or rewards programme yet, so there is no balance to show.
          </p>
        </DashCard>
      </div>
    </>
  );
}

/* ──────────────────────────────────────────────────────────── tables */

function Table({
  caption,
  head,
  children,
}: {
  caption: string;
  head: { label: string; right?: boolean }[];
  children: React.ReactNode;
}) {
  return (
    <div className="relative -mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[48rem] text-left text-[0.875rem]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-ink font-bold">
            {head.map((h, i) => (
              <th
                key={h.label}
                scope="col"
                className={`bg-bg px-3 py-2.5 ${h.right ? 'text-right' : ''} ${
                  i === 0 ? 'rounded-l-lg' : ''
                } ${i === head.length - 1 ? 'rounded-r-lg' : ''}`}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const td = 'px-3 py-3 font-semibold';
const tr = 'border-border border-b last:border-0';

function Orders({ p }: { p: CustomerProfile }) {
  return (
    <DashCard title="Orders" titleNote={`(${p.orders.length})`}>
      {p.orders.length === 0 ? (
        <EmptyNote>
          No orders. Orders placed signed out with this phone number show here too.
        </EmptyNote>
      ) : (
        <Table
          caption="Orders"
          head={[
            { label: 'Order' },
            { label: 'Merchant' },
            { label: 'Placed' },
            { label: 'Stage' },
            { label: 'Payment' },
            { label: 'Total', right: true },
          ]}
        >
          {p.orders.map((o) => (
            <tr key={o.id} className={tr}>
              <td className={`${td} whitespace-nowrap font-bold`}>
                <Link
                  href={`/orders?q=${encodeURIComponent(o.reference ?? o.id)}`}
                  className="hover:underline"
                >
                  {o.reference ?? '—'}
                </Link>
              </td>
              <td className={td}>
                <span className="block truncate font-bold">{o.merchant ?? '—'}</span>
                {o.category && <span className="text-muted text-[0.8125rem]">{o.category}</span>}
              </td>
              <td className={`${td} whitespace-nowrap`}>{dayTime(o.at)}</td>
              <td className={td}>
                <StatusChip tone={toneOf(o.stage)}>{words(o.stage)}</StatusChip>
              </td>
              <td className={td}>
                <StatusChip tone={toneOf(o.paymentStatus)}>{words(o.paymentStatus)}</StatusChip>
                {o.paymentMethod && (
                  <span className="text-muted ml-1.5 text-[0.8125rem]">
                    {words(o.paymentMethod)}
                  </span>
                )}
              </td>
              <td className={`${td} whitespace-nowrap text-right font-bold tabular-nums`}>
                {kes(o.totalCents)}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </DashCard>
  );
}

function Bookings({ p }: { p: CustomerProfile }) {
  return (
    <>
      <DashCard title="Bookings" titleNote={`(${p.bookings.length})`}>
        {p.bookings.length === 0 ? (
          <EmptyNote>No table, appointment or experience bookings.</EmptyNote>
        ) : (
          <Table
            caption="Bookings"
            head={[
              { label: 'Booking' },
              { label: 'Merchant' },
              { label: 'For' },
              { label: 'Status' },
              { label: 'Total', right: true },
              { label: 'Paid', right: true },
            ]}
          >
            {p.bookings.map((b) => (
              <tr key={`${b.source}-${b.id}`} className={tr}>
                <td className={`${td} font-bold`}>
                  {b.reference ?? '—'}
                  <span className="text-muted block text-[0.8125rem] font-semibold">
                    {b.source === 'engine' ? 'Booked in the app' : 'Booked on NexG'}
                    {b.byPhone && ' · matched by phone'}
                  </span>
                </td>
                <td className={td}>
                  <span className="block truncate font-bold">{b.merchant ?? '—'}</span>
                  {b.category && <span className="text-muted text-[0.8125rem]">{b.category}</span>}
                </td>
                <td className={`${td} whitespace-nowrap`}>{dayTime(b.startsAt)}</td>
                <td className={td}>
                  <StatusChip tone={toneOf(b.status)}>{words(b.status)}</StatusChip>
                </td>
                <td className={`${td} text-right tabular-nums`}>{kes(b.totalCents)}</td>
                <td className={`${td} text-right font-bold tabular-nums`}>
                  {b.paidCents == null ? (
                    <span className="text-muted-light">—</span>
                  ) : (
                    kes(b.paidCents)
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </DashCard>

      <DashCard title="Stays" titleNote={`(${p.stays.length})`}>
        {p.stays.length === 0 ? (
          <EmptyNote>No stays booked through NexG.</EmptyNote>
        ) : (
          <Table
            caption="Stays"
            head={[
              { label: 'Place' },
              { label: 'Dates' },
              { label: 'Status' },
              { label: 'Quoted', right: true },
              { label: 'Paid', right: true },
            ]}
          >
            {p.stays.map((s) => (
              <tr key={s.id} className={tr}>
                <td className={td}>
                  <span className="flex items-center gap-2 font-bold">
                    <BedDouble aria-hidden="true" className="h-4 w-4 shrink-0 text-[#E5A800]" />
                    {s.place ?? 'Stay'}
                  </span>
                  {s.host && <span className="text-muted text-[0.8125rem]">Host: {s.host}</span>}
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  {day(s.checkIn)} – {day(s.checkOut)}
                </td>
                <td className={td}>
                  <span className="flex flex-wrap gap-1.5">
                    <StatusChip tone={toneOf(s.status)}>{words(s.status)}</StatusChip>
                    {s.refundedAt && <StatusChip tone="blue">Refunded</StatusChip>}
                  </span>
                </td>
                <td className={`${td} text-right tabular-nums`}>{kes(s.quoteCents)}</td>
                <td className={`${td} text-right font-bold tabular-nums`}>
                  {s.paidCents ? kes(s.paidCents) : <span className="text-muted-light">—</span>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </DashCard>
    </>
  );
}

function Transactions({ p }: { p: CustomerProfile }) {
  return (
    <DashCard title="Transactions" titleNote="(payments, failures and refunds, newest first)">
      {p.transactions.length === 0 ? (
        <EmptyNote>No payments or refunds yet. Cash on delivery shows on the order only.</EmptyNote>
      ) : (
        <Table
          caption="Transactions"
          head={[
            { label: 'When' },
            { label: 'Type' },
            { label: 'Reference' },
            { label: 'How' },
            { label: 'State' },
            { label: 'Amount', right: true },
          ]}
        >
          {p.transactions.map((t) => (
            <tr key={`${t.kind}-${t.id}`} className={tr}>
              <td className={`${td} whitespace-nowrap`}>{dayTime(t.at)}</td>
              <td className={td}>
                {t.kind === 'refund'
                  ? 'Refund'
                  : `Payment${t.intent ? ` · ${words(t.intent)}` : ''}`}
              </td>
              <td className={`${td} font-bold`}>{t.reference ?? '—'}</td>
              <td className={td}>
                {[t.provider, t.channel].filter(Boolean).map(words).join(' · ') || '—'}
              </td>
              <td className={td}>
                <StatusChip tone={toneOf(t.state)}>{words(t.state)}</StatusChip>
                {t.note && (
                  <span className="text-muted mt-1 block max-w-[22rem] text-[0.8125rem]">
                    {t.note}
                  </span>
                )}
              </td>
              <td
                className={`${td} whitespace-nowrap text-right font-bold tabular-nums ${
                  t.kind === 'refund' ? 'text-[#1F5FAD]' : ''
                }`}
              >
                {t.kind === 'refund' ? '−' : ''}
                {kes(t.cents)}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </DashCard>
  );
}

function Stars({ n }: { n: number | null }) {
  if (n == null) return <span className="text-muted-light">—</span>;
  return (
    <span className="whitespace-nowrap font-bold text-[#E5A800]" aria-label={`${n} of 5 stars`}>
      {'★'.repeat(n)}
      <span className="text-border-strong">{'★'.repeat(Math.max(0, 5 - n))}</span>
    </span>
  );
}

function Reviews({ p }: { p: CustomerProfile }) {
  return (
    <DashCard title="Reviews" titleNote={`(${p.reviews.length})`}>
      {p.reviews.length === 0 ? (
        <EmptyNote>This customer has not rated an order, stay or experience.</EmptyNote>
      ) : (
        <ul className="divide-border divide-y">
          {p.reviews.map((r, i) => (
            <li key={i} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  <Stars n={r.stars} />
                  {r.subject ?? '—'}
                  <CategoryChip label={words(r.kind)} tone="grey" />
                </p>
                {r.comment && (
                  <p className="text-muted mt-1 text-sm font-semibold">“{r.comment}”</p>
                )}
              </div>
              <span className="text-muted shrink-0 text-sm font-semibold">
                {r.reference ? `${r.reference} · ` : ''}
                {day(r.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </DashCard>
  );
}

function Support({ p }: { p: CustomerProfile }) {
  return (
    <DashCard title="Support History" titleNote={`(${p.tickets.length})`}>
      {p.tickets.length === 0 ? (
        <EmptyNote>No support tickets from this account or phone number.</EmptyNote>
      ) : (
        <ul className="divide-border divide-y">
          {p.tickets.map((t) => (
            <li key={t.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  <Link href={`/support?ticket=${t.id}`} className="hover:underline">
                    {t.reference ?? 'Ticket'}
                  </Link>
                  <span className="text-muted font-semibold">{words(t.topic)}</span>
                  <StatusChip tone={toneOf(t.status)}>{words(t.status)}</StatusChip>
                </p>
                <span className="text-muted text-sm font-semibold">{dayTime(t.createdAt)}</span>
              </div>
              {t.body && <p className="text-muted mt-1 text-sm font-semibold">{t.body}</p>}
              {t.orderReference && (
                <p className="text-muted-light mt-1 text-xs font-semibold">
                  About order {t.orderReference}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </DashCard>
  );
}

function Notes({ p }: { p: CustomerProfile }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <DashCard title="Staff Notes" titleNote={`(${p.notes.length})`}>
        {p.notes.length === 0 && !p.legacyNote ? (
          <EmptyNote>No notes yet. Add one from the top of the page.</EmptyNote>
        ) : (
          <ul className="divide-border divide-y">
            {p.notes.map((n) => (
              <li key={n.id} className="py-3">
                <p className="whitespace-pre-wrap text-[0.9375rem] font-semibold">{n.body}</p>
                <p className="text-muted mt-1 text-xs font-semibold">
                  {n.author ?? 'Staff'} · {dayTime(n.at)}
                </p>
              </li>
            ))}
            {p.legacyNote && (
              <li className="py-3">
                <p className="whitespace-pre-wrap text-[0.9375rem] font-semibold">{p.legacyNote}</p>
                <p className="text-muted mt-1 text-xs font-semibold">Older guest note</p>
              </li>
            )}
          </ul>
        )}
        {p.blocks.length > 0 && (
          <div className="border-border mt-4 border-t pt-4">
            <p className="font-extrabold">Suspensions</p>
            <ul className="mt-2 space-y-2">
              {p.blocks.map((b, i) => (
                <li key={i} className="text-sm font-semibold">
                  <span className="text-danger">Suspended {day(b.at)}</span>
                  {b.by ? ` by ${b.by}` : ''}: {b.reason ?? '—'}
                  {b.liftedAt && (
                    <span className="text-success">
                      {' '}
                      · lifted {day(b.liftedAt)}
                      {b.liftedBy ? ` by ${b.liftedBy}` : ''}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </DashCard>

      <DashCard title="Who Did What" titleNote="(staff, newest first)">
        {p.history.length === 0 ? (
          <EmptyNote>No staff activity on this customer yet.</EmptyNote>
        ) : (
          <ul className="divide-border divide-y">
            {p.history.map((h, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-bold">{h.by ?? 'Staff'}</span>{' '}
                  <span className="font-semibold">{actionLabel(h.action).toLowerCase()}</span>
                  {h.reason && <span className="text-muted block font-semibold">“{h.reason}”</span>}
                </span>
                <span className="text-muted shrink-0 font-semibold">{dayTime(h.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </DashCard>
    </div>
  );
}
