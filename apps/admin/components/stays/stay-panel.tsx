import {
  BedDouble,
  CalendarCheck,
  CalendarX2,
  CreditCard,
  Hash,
  Moon,
  Percent,
  Phone,
  Smartphone,
  Users,
  Wallet,
} from 'lucide-react';

import { StayMoves } from '@/components/stays/client';
import { Chip, Fact, Footnote, photoUrl, SidePanel } from '@/components/stays/module';
import {
  asNumber,
  asObject,
  clock,
  kesFull,
  label,
  ORDER_CATEGORY_LABEL,
  shortDate,
  SOURCE_LABEL,
  type StayRow,
} from '@/lib/stays-module';

/**
 * One stay's side panel: the stay, the payment and NexG's commission, the
 * guest's orders while they stayed, and the check-in / check-out buttons.
 * Shared by Reservations, Check-ins & Check-outs and Guest Spending.
 */
export function StayPanel({ detail, closeHref }: { detail: unknown; closeHref: string }) {
  const d = asObject(detail) as unknown as StayRow & {
    orders?: { reference: string; at: string; kes: number; category: string; merchant: string }[];
    cases?: { id: string; ref: string; title: string; status: string }[];
    photo?: unknown;
  };
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
  return (
    <SidePanel title={d.ref} closeHref={closeHref} badge={<Chip status={d.status} />}>
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="mb-3 h-36 w-full rounded-xl object-cover" />
      )}
      <p className="font-bold">
        {d.unit_label ?? 'Unit'}
        {d.property_name ? `, ${d.property_name}` : ''}
      </p>
      <p className="text-muted mb-3 text-[0.8125rem] font-semibold">
        {d.area ?? 'No area'} · Host: {d.host_name}
      </p>

      <h3 className="mt-2 text-[0.9375rem] font-extrabold">Stay Information</h3>
      <div className="mt-1">
        <Fact icon={Users} label="Guest">
          {d.guest_name}
        </Fact>
        {d.guest_phone && (
          <Fact icon={Phone} label="Phone">
            {d.guest_phone}
          </Fact>
        )}
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
        <Fact icon={Smartphone} label="Source">
          {label(SOURCE_LABEL, d.source)}
        </Fact>
      </div>

      <h3 className="mt-4 text-[0.9375rem] font-extrabold">Payment & Commission</h3>
      <div className="mt-1">
        <Fact icon={CreditCard} label="Payment">
          {d.paid ? 'Paid through NexG' : d.source === 'nexg' ? 'Not paid' : 'Paid to the host'}
        </Fact>
        <Fact icon={Wallet} label="Total Amount">
          {kesFull(d.value_kes)}
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
      </div>

      <h3 className="mt-4 text-[0.9375rem] font-extrabold">Additional Services (Concierge)</h3>
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

      {(d.cases ?? []).length > 0 && (
        <>
          <h3 className="mt-4 text-[0.9375rem] font-extrabold">Cases</h3>
          <ul className="mt-1 space-y-1 text-[0.875rem]">
            {(d.cases ?? []).map((c) => (
              <li key={c.id} className="flex justify-between gap-2">
                <span className="font-semibold">
                  {c.ref} · {c.title}
                </span>
                <Chip status={c.status} />
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4">
        <StayMoves stayId={d.stay_id} status={d.status} />
      </div>
      <Footnote>
        Check-in works on a confirmed stay that has not ended; check-out on a stay that is checked
        in. Both are recorded against you.
      </Footnote>
    </SidePanel>
  );
}
