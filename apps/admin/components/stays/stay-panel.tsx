import {
  BedDouble,
  CalendarCheck,
  CalendarX2,
  CreditCard,
  Hash,
  MessageSquare,
  Moon,
  MoreHorizontal,
  Percent,
  Phone,
  Smartphone,
  Users,
  Wallet,
} from 'lucide-react';

import { ShareDonut } from '@/components/charts';
import { LogCaseButton, StayMoves } from '@/components/stays/client';
import { PanelLinks, PanelTabs, Timeline } from '@/components/stays/extras';
import { Chip, Fact, Footnote, photoUrl, SidePanel } from '@/components/stays/module';
import {
  asNumber,
  asObject,
  clock,
  kesCompact,
  kesFull,
  label,
  ORDER_CATEGORY_LABEL,
  shortDate,
  SOURCE_LABEL,
  type StayRow,
} from '@/lib/stays-module';

export const STAY_PANEL_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'guest', label: 'Guest' },
  { key: 'payment', label: 'Payment' },
  { key: 'services', label: 'Services' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'notes', label: 'Notes' },
] as const;

const DONUT = ['#F5A623', '#F5C842', '#C58BF2', '#2F80ED', '#9EC5F8', '#1E9E45'];

type Detail = StayRow & {
  orders?: { reference: string; at: string; kes: number; category: string; merchant: string }[];
  cases?: { id: string; ref: string; title: string; status: string }[];
  photo?: unknown;
};

/** A stay's steps for the timeline: confirmed, checked in, staying, checked out. */
export function stayTimeline(d: StayRow) {
  const now = Date.now();
  const inStay = d.status === 'in_stay';
  const departed = d.status === 'departed';
  return [
    {
      label: d.status === 'cancelled' ? 'Booking Cancelled' : 'Booking Confirmed',
      when: `${shortDate(d.created_at)}, ${clock(d.created_at)}`,
      done: true,
    },
    {
      label: 'Check-in',
      when: d.checked_in_at
        ? `${shortDate(d.checked_in_at)}, ${clock(d.checked_in_at)}`
        : `${shortDate(d.check_in)} (booked)`,
      done: !!d.checked_in_at || inStay || departed,
      current: inStay,
    },
    {
      label: 'Stay in Progress',
      when: `${shortDate(d.check_in)} – ${shortDate(d.check_out)} (${d.nights} nights)`,
      done: departed || (inStay && Date.parse(d.check_out) < now),
    },
    {
      label: departed ? 'Check-out' : 'Check-out (Scheduled)',
      when: d.checked_out_at
        ? `${shortDate(d.checked_out_at)}, ${clock(d.checked_out_at)}`
        : `${shortDate(d.check_out)}, ${clock(d.check_out)}`,
      done: departed,
    },
  ];
}

/**
 * One stay's side panel, tabbed as the Reservations design: the stay, the
 * guest, the payment and NexG's commission, the guest's orders while they
 * stayed, the timeline and the cases. Shared by Reservations, Check-ins &
 * Check-outs and Guest Spending; `variant` picks which the panel opens on.
 */
export function StayPanel({
  detail,
  closeHref,
  tab = 'overview',
  tabHref,
  variant = 'reservation',
  concierge,
}: {
  detail: unknown;
  closeHref: string;
  tab?: string;
  tabHref?: (key: string) => string;
  variant?: 'reservation' | 'checkin' | 'spending';
  /** Orders staff placed for the guest (Guest Spending's Services tab). */
  concierge?: React.ReactNode;
}) {
  const d = asObject(detail) as unknown as Detail;
  if (!d.stay_id) {
    return (
      <SidePanel title="Reservation" closeHref={closeHref}>
        <p className="text-muted text-sm font-semibold">That stay is not there any more.</p>
      </SidePanel>
    );
  }
  const photo = photoUrl(d.photo);
  const orders = d.orders ?? [];
  const ordersKes = orders.reduce((s, o) => s + asNumber(o.kes), 0);
  const phoneHref =
    d.guest_phone && !d.guest_phone.includes('•')
      ? `tel:${d.guest_phone.replace(/\s/g, '')}`
      : null;
  const links = (
    <PanelLinks
      links={[
        { label: 'Call Guest', icon: Phone, href: phoneHref },
        { label: 'Message', icon: MessageSquare, href: '/messaging/stays' },
        { label: 'Cancel / Refund', icon: MoreHorizontal, href: '/hotels?tab=refunds' },
      ]}
    />
  );

  const services = (
    <>
      <h3 className="text-[0.9375rem] font-extrabold">Additional Services (Concierge)</h3>
      {orders.length === 0 ? (
        <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
          No guest orders through this unit&rsquo;s QR during the stay.
        </p>
      ) : (
        <ul className="mt-1">
          {orders.map((o) => (
            <li
              key={o.reference}
              className="border-border flex justify-between gap-3 border-b py-1.5 text-[0.875rem] last:border-b-0"
            >
              <span className="font-semibold">
                {o.merchant ?? label(ORDER_CATEGORY_LABEL, o.category)}{' '}
                <span className="text-muted">({shortDate(o.at)})</span>
              </span>
              <span className="font-bold tabular-nums">{kesFull(o.kes)}</span>
            </li>
          ))}
          <li className="flex justify-between pt-2 text-[0.875rem] font-extrabold">
            <span>Total Services</span>
            <span className="tabular-nums">{kesFull(ordersKes)}</span>
          </li>
        </ul>
      )}
      {concierge}
    </>
  );

  const stayInfo = (
    <>
      <h3 className="text-[0.9375rem] font-extrabold">Stay Information</h3>
      <Fact icon={CalendarCheck} label="Check-in">
        {shortDate(d.check_in)} · {clock(d.check_in)}
      </Fact>
      <Fact icon={CalendarX2} label="Check-out">
        {shortDate(d.check_out)} · {clock(d.check_out)}
      </Fact>
      <Fact icon={Moon} label="Nights">
        {d.nights}
      </Fact>
      <Fact icon={Users} label="Guests">
        {d.party > 0 ? d.party : '—'}
      </Fact>
      <Fact icon={BedDouble} label="Rate (per night)">
        {kesFull(d.rate_kes)}
      </Fact>
      <Fact icon={Wallet} label="Total Amount">
        {kesFull(d.value_kes)}
      </Fact>
    </>
  );

  const payment = (
    <>
      <h3 className="text-[0.9375rem] font-extrabold">Payment & Commission</h3>
      <Fact icon={CreditCard} label="Payment Status">
        <Chip
          status={d.paid ? 'resolved' : 'pending'}
          text={d.paid ? 'Paid' : d.source === 'nexg' ? 'Not paid' : 'Paid to the host'}
        />
      </Fact>
      <Fact icon={Smartphone} label="Payment Method">
        {d.paid ? 'Through NexG' : label(SOURCE_LABEL, d.source)}
      </Fact>
      <Fact icon={Percent} label="NexG Commission">
        {kesFull(d.commission_kes)}
      </Fact>
      <Fact icon={Wallet} label="Host Payout">
        {kesFull(d.host_share_kes)}
      </Fact>
      {d.payment_reference && (
        <Fact icon={Hash} label="Reference">
          {d.payment_reference}
        </Fact>
      )}
      {d.refunded_kes != null && d.refunded_kes > 0 && (
        <Fact icon={Wallet} label="Refunded">
          {kesFull(d.refunded_kes)}
        </Fact>
      )}
    </>
  );

  const source = (
    <>
      <h3 className="text-[0.9375rem] font-extrabold">Booking Source & Channel</h3>
      <Fact label="Source">{label(SOURCE_LABEL, d.source)}</Fact>
      <Fact label="Booking Date">{shortDate(d.created_at)}</Fact>
      <Fact label="Channel">
        {d.source === 'nexg' ? 'NexG app / website' : 'Entered by host or staff'}
      </Fact>
    </>
  );

  const byCategory = Object.entries(
    orders.reduce<Record<string, number>>((m, o) => {
      m[o.category] = (m[o.category] ?? 0) + asNumber(o.kes);
      return m;
    }, {}),
  );
  const spendTotal = asNumber(d.value_kes) + ordersKes;

  let body: React.ReactNode;
  if (tab === 'guest') {
    body = (
      <>
        <h3 className="text-[0.9375rem] font-extrabold">Guest</h3>
        <Fact icon={Users} label="Name">
          {d.guest_name}
        </Fact>
        <Fact icon={Phone} label="Phone">
          {d.guest_phone ?? '—'}
        </Fact>
        <Fact icon={Users} label="Party">
          {d.party > 0 ? `${d.party} guest${d.party === 1 ? '' : 's'}` : '—'}
        </Fact>
        <Footnote>
          Phone numbers show in full only to the data protection officer and the concierge team.
        </Footnote>
      </>
    );
  } else if (tab === 'payment') {
    body = payment;
  } else if (tab === 'services') {
    body = services;
  } else if (tab === 'timeline') {
    body = <Timeline steps={stayTimeline(d)} />;
  } else if (tab === 'notes') {
    body = (
      <>
        <h3 className="text-[0.9375rem] font-extrabold">Cases & Notes</h3>
        {(d.cases ?? []).length === 0 ? (
          <p className="text-muted my-1 text-[0.8125rem] font-semibold">
            No incident or dispute on this stay.
          </p>
        ) : (
          <ul className="my-1 space-y-1 text-[0.875rem]">
            {(d.cases ?? []).map((c) => (
              <li key={c.id} className="flex justify-between gap-2">
                <span className="font-semibold">
                  {c.ref} · {c.title}
                </span>
                <Chip status={c.status} />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 max-w-[14rem]">
          <LogCaseButton variant="tile" label="Log a case" stayRef={d.ref} />
        </div>
      </>
    );
  } else if (variant === 'spending') {
    body = (
      <>
        <h3 className="text-[0.9375rem] font-extrabold">Guest Spend Summary</h3>
        {spendTotal > 0 ? (
          <ShareDonut
            stacked
            centre={kesCompact(spendTotal)}
            unit="kes"
            data={[
              {
                key: 'accommodation',
                label: 'Accommodation',
                value: asNumber(d.value_kes),
                color: DONUT[0],
              },
              ...byCategory.map(([c, v], i) => ({
                key: c,
                label: label(ORDER_CATEGORY_LABEL, c),
                value: v,
                color: DONUT[(i + 1) % DONUT.length],
              })),
            ]}
          />
        ) : (
          <p className="text-muted text-[0.8125rem] font-semibold">Nothing spent yet.</p>
        )}
        <div className="mt-3">{services}</div>
      </>
    );
  } else if (variant === 'checkin') {
    body = (
      <>
        <h3 className="mb-2 text-[0.9375rem] font-extrabold">Stay Timeline</h3>
        <Timeline steps={stayTimeline(d)} />
      </>
    );
  } else {
    body = (
      <div className="grid gap-x-5 2xl:grid-cols-2">
        <div>
          {stayInfo}
          <div className="mt-3">{source}</div>
        </div>
        <div>
          {payment}
          <div className="mt-3">{services}</div>
        </div>
      </div>
    );
  }

  return (
    <SidePanel
      title={
        variant === 'checkin' ? 'Stay Details' : variant === 'spending' ? 'Guest Profile' : d.ref
      }
      closeHref={closeHref}
      badge={<Chip status={d.status} />}
    >
      {variant === 'reservation' && photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="mb-3 h-40 w-full rounded-xl object-cover" />
      )}
      <p className="font-bold">
        {variant === 'reservation' ? '' : `${d.guest_name} · ${d.ref} · `}
        {d.unit_label ?? 'Unit'}
        {d.property_name ? `, ${d.property_name}` : ''}
      </p>
      <p className="text-muted mb-3 text-[0.8125rem] font-semibold">
        {d.area ?? 'No area'} · Host: {d.host_name}
      </p>
      {links}
      {tabHref && (
        <PanelTabs
          tabs={[...STAY_PANEL_TABS]}
          active={STAY_PANEL_TABS.some((t) => t.key === tab) ? tab : 'overview'}
          href={tabHref}
        />
      )}
      {body}
      <div className="mt-4">
        <StayMoves stayId={d.stay_id} status={d.status} />
      </div>
      <Footnote>
        Check-in works from the check-in day on a confirmed stay, one guest per unit at a time;
        check-out on a stay that is checked in. Both are recorded against you.
      </Footnote>
    </SidePanel>
  );
}
