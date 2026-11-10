'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { requestFeatured, withdrawFeatured, type Outcome } from '@/app/merchant/actions';

import { DASH, Panel, Pill, day, kesWhole } from './bits';

export interface Placement {
  id: string;
  kind: string;
  category: string | null;
  position: number;
  label: string;
  description: string | null;
  city_id: string;
  price_kes?: number | null;
  priceUnavailable?: boolean;
}

/** A product the merchant can promote in a Best sellers slot. */
export interface PromotableProduct {
  id: string;
  name: string;
  price_kes: number;
}

export interface Booking {
  id: string;
  placement_kind: string;
  status: string;
  wanted_start: string | null;
  weeks: number | null;
  quoted_price: number | null;
  requested_at: string;
  start_date: string | null;
  end_date: string | null;
}

const KIND: Record<string, string> = {
  homepage: 'Top of the homepage',
  category_top: 'Top of your category',
  popular_request: 'Best sellers on the homepage',
};

export function featuredPlacementLabel(kind: string) {
  return KIND[kind] ?? kind.replaceAll('_', ' ');
}

const TONE: Record<string, string> = {
  live: 'bg-success-bg text-success',
  booked: 'bg-success-bg text-success',
  quoted: 'bg-gold-soft text-gold-text',
  requested: 'bg-info-bg text-info',
  waitlisted: 'bg-info-bg text-info',
  declined: 'bg-danger-bg text-danger',
  cancelled: 'bg-bg text-muted-light',
  ended: 'bg-bg text-muted-light',
  expired: 'bg-bg text-muted-light',
};

export function Featured({
  merchantId,
  status,
  eligibility,
  placements,
  bookings,
  nextMonday,
  products = [],
  showHistory = true,
}: {
  merchantId: string;
  status: string;
  eligibility: Record<string, unknown> | null;
  placements: Placement[];
  bookings: Booking[];
  nextMonday: string;
  /** Available, priced products, for the Best sellers slot. */
  products?: PromotableProduct[];
  showHistory?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [said, setSaid] = React.useState<Outcome | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const [week, setWeek] = React.useState(nextMonday);
  const [weeks, setWeeks] = React.useState(1);
  const [note, setNote] = React.useState('');
  const [itemId, setItemId] = React.useState(products[0]?.id ?? '');

  const run = async (fn: () => Promise<Outcome>) => {
    setBusy(true);
    setSaid(null);
    try {
      const r = await fn();
      setSaid(r);
      if (r.ok) {
        setOpen(null);
        router.refresh();
      }
    } catch {
      setSaid({
        ok: false,
        message:
          'The featured placement request could not be updated. Reload Promotions and try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const openBooking = bookings.find((b) =>
    ['requested', 'quoted', 'waitlisted', 'booked', 'live'].includes(b.status),
  );
  const eligible = Boolean(eligibility?.passed);
  const why = (eligibility?.remedy ?? eligibility?.reason) as string | undefined;

  return (
    <div className="space-y-5">
      {said && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-[0.8125rem] font-bold ${
            said.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
          }`}
        >
          {said.message}
        </p>
      )}

      {status !== 'live' ? (
        <Panel title="Not yet">
          <p className="text-muted text-[0.8125rem] font-semibold">
            Featured slots are for businesses that are live and trading. Yours is {status}. Finish
            that first and this opens by itself.
          </p>
        </Panel>
      ) : openBooking ? (
        <Panel title="You have a request with us">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[0.9375rem] font-extrabold">
              {featuredPlacementLabel(openBooking.placement_kind)}
            </p>
            <Pill tone={TONE[openBooking.status]}>{openBooking.status.toUpperCase()}</Pill>
          </div>
          <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
            Week of {day(openBooking.wanted_start)} · {openBooking.weeks}{' '}
            {openBooking.weeks === 1 ? 'week' : 'weeks'} ·{' '}
            {openBooking.quoted_price === null
              ? `${DASH} a week, somebody will call you with the price`
              : `${kesWhole(openBooking.quoted_price)} a week`}
          </p>
          <p className="text-muted-light mt-1 text-[0.75rem] font-semibold">
            Nothing is charged until somebody has spoken to you and you have paid. We do not take
            card details on this page.
          </p>
          {['requested', 'quoted', 'waitlisted'].includes(openBooking.status) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => withdrawFeatured(openBooking.id))}
              className="mt-3 text-[0.75rem] font-extrabold underline underline-offset-4 disabled:opacity-40"
            >
              {busy ? 'Withdrawing…' : 'Withdraw this request'}
            </button>
          )}
        </Panel>
      ) : !eligible ? (
        <Panel title="Not eligible yet">
          <p className="text-muted text-[0.8125rem] font-semibold">
            {why ??
              'Your account does not meet the bar for a paid placement at the moment. A green health band for a run of weeks is the usual way in.'}
          </p>
          <p className="text-muted-light mt-2 text-[0.75rem] font-semibold">
            A guest has to be able to trust a sponsored card.
          </p>
        </Panel>
      ) : (
        <Panel title="Slots in your city" note={`${placements.length} available`}>
          {placements.length === 0 ? (
            <p className="text-muted text-[0.8125rem] font-semibold">
              No placements are set up in your city yet.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {placements.map((p) => (
                <li key={p.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[0.9375rem] font-extrabold">
                        {p.label || featuredPlacementLabel(p.kind)}
                      </p>
                      {p.description && (
                        <p className="text-muted text-[0.8125rem] font-semibold">{p.description}</p>
                      )}
                      <p className="text-muted-light mt-0.5 text-[0.8125rem] font-semibold">
                        {p.priceUnavailable ? (
                          'Price could not be checked. NexG will confirm your quote.'
                        ) : p.price_kes === null || p.price_kes === undefined ? (
                          <>
                            <strong className="text-ink">{DASH}</strong> a week · no rate published
                            for your city yet, so somebody will quote you
                          </>
                        ) : (
                          <>
                            <strong className="text-ink">{kesWhole(p.price_kes)}</strong> a week
                          </>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpen(open === p.id ? null : p.id)}
                      className="bg-ink shrink-0 rounded-lg px-3 py-2 text-[0.75rem] font-extrabold text-white"
                    >
                      Ask for it
                    </button>
                  </div>

                  {open === p.id && (
                    <div className="bg-bg mt-3 space-y-2 rounded-xl p-3">
                      <div className="flex flex-wrap gap-2">
                        <label className="block">
                          <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.06em]">
                            Starting the week of
                          </span>
                          <input
                            type="date"
                            value={week}
                            min={nextMonday}
                            onChange={(e) => setWeek(e.target.value)}
                            className="border-border-strong mt-1 block rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.06em]">
                            For how long
                          </span>
                          <select
                            value={weeks}
                            onChange={(e) => setWeeks(Number(e.target.value))}
                            className="border-border-strong mt-1 block rounded-lg border px-3 py-2 text-[0.8125rem] font-bold"
                          >
                            {[1, 2, 4, 8, 12].map((w) => (
                              <option key={w} value={w}>
                                {w} {w === 1 ? 'week' : 'weeks'}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <p className="text-muted text-[0.75rem] font-semibold">
                        Slots run Monday to Sunday, so the date has to be a Monday.
                        {p.price_kes != null && (
                          <>
                            {' '}
                            That would be{' '}
                            <strong className="text-ink">{kesWhole(p.price_kes * weeks)}</strong> in
                            all.
                          </>
                        )}
                      </p>
                      {p.kind === 'popular_request' && (
                        <label className="block">
                          <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.06em]">
                            Product to promote
                          </span>
                          {products.length === 0 ? (
                            <span className="text-muted mt-1 block text-[0.75rem] font-semibold">
                              Add a priced, available product to your catalogue first.
                            </span>
                          ) : (
                            <select
                              value={itemId}
                              onChange={(e) => setItemId(e.target.value)}
                              className="border-border-strong mt-1 block w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-bold"
                            >
                              {products.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name} · {kesWhole(product.price_kes)}
                                </option>
                              ))}
                            </select>
                          )}
                          <span className="text-muted-light mt-1 block text-[0.6875rem] font-semibold">
                            It leads the Best sellers row on the homepage, marked Sponsored, and
                            opens straight to the product so guests can add it and check out.
                          </span>
                        </label>
                      )}
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Anything we should know (optional)"
                        className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
                      />
                      <button
                        type="button"
                        disabled={busy || (p.kind === 'popular_request' && !itemId)}
                        onClick={() =>
                          run(() =>
                            requestFeatured({
                              merchantId,
                              placementId: p.id,
                              weekStart: week,
                              weeks,
                              note,
                              itemId: p.kind === 'popular_request' ? itemId : undefined,
                            }),
                          )
                        }
                        className="bg-ink rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold text-white disabled:opacity-40"
                      >
                        {busy ? 'Asking…' : 'Ask for this slot'}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {showHistory && bookings.length > 0 && (
        <Panel title="Everything you have asked for">
          <ul className="divide-border divide-y">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-baseline justify-between gap-2 py-2">
                <span className="text-[0.8125rem] font-semibold">
                  {featuredPlacementLabel(b.placement_kind)} · week of{' '}
                  {day(b.wanted_start ?? b.start_date)}
                </span>
                <Pill tone={TONE[b.status]}>{b.status.toUpperCase()}</Pill>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
