import { Bed, Download, Printer, QrCode, UserPlus } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import type { Attention, HostHome } from '@/app/host/layout';

import {
  Attention as AttentionCard,
  DASH,
  Panel,
  QuickAction,
  Row,
  Tile,
  greeting,
  kes,
  when,
} from './bits';

/**
 * The portal for a host who is live.
 *
 * A different screen from the setup one, not the same screen
 * with the strip removed. A host who is live has a different
 * question — what is happening right now, across my units —
 * and the answer is arranged around arrivals, scans and the
 * things that need a person.
 *
 * Every number opens the record behind it. A dashboard figure
 * nobody can click is a figure nobody can check.
 */

export interface QrActivityRow {
  scan_id: string;
  unit_id: string | null;
  unit_name: string | null;
  property_name: string | null;
  scanned_at: string;
  guest_first_name: string | null;
  outcome: string;
  order_reference: string | null;
  total_cents: number | null;
  order_stage: string | null;
  merchant_name: string | null;
  handoff: string | null;
}

export interface ArrivingRow {
  order_id: string;
  unit_id: string | null;
  unit_name: string | null;
  reference: string;
  stage: string;
  eta_at: string | null;
  total_cents: number | null;
  merchant_name: string | null;
  handoff: string | null;
}

const HANDOFF_LABEL: Record<string, string> = {
  guest_meets_at_gate: 'Guest meets at gate',
  leave_with_askari: 'Askari · gate',
  lockbox: 'Lockbox',
  call_guest_first: 'Call guest first',
  reception: 'Reception',
  caretaker: 'Caretaker',
};

const OUTCOME: Record<string, { label: string; tone: string }> = {
  ordered: { label: 'Ordered', tone: 'bg-success/10 text-success' },
  browsed: { label: 'Browsed · no order', tone: 'bg-bg text-muted' },
  landed: { label: 'Scan only', tone: 'bg-bg text-muted' },
  cart: { label: 'Left a basket', tone: 'bg-warn/10 text-warn' },
  bounced: { label: 'Scan only', tone: 'bg-bg text-muted' },
  voided: { label: 'Replace card', tone: 'bg-danger/10 text-danger' },
  paused_unit: { label: 'Unit paused', tone: 'bg-warn/10 text-warn' },
  not_found: { label: 'Unknown card', tone: 'bg-danger/10 text-danger' },
  blocked: { label: 'Blocked', tone: 'bg-danger/10 text-danger' },
};

export function HomeLive({
  home,
  today,
  attention,
  activity,
  arriving,
}: {
  home: HostHome;
  today: {
    orders_today: number;
    value_today_cents: number;
    units_today: number;
    arriving: number;
    open_requests: number;
    units_without_qr: number;
  } | null;
  attention: Attention[];
  activity: QrActivityRow[];
  arriving: ArrivingRow[];
}) {
  const firstName = (home.contact_name ?? '').split(' ')[0] || 'there';
  const top = attention[0];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0 space-y-6">
        <div>
          <h1 className="font-serif text-[2rem] font-extrabold leading-tight tracking-tight">
            {greeting(true, firstName)}
          </h1>
          <p className="text-muted mt-2 max-w-2xl text-[0.9375rem] font-semibold leading-[1.7]">
            Here is what is happening across your properties today. NexG is handling guest chat,
            orders and deliveries; everything below is live and every number opens the record
            behind it.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Tile
            href="/host/properties"
            title="My Properties"
            note={`${home.units_total} unit${home.units_total === 1 ? '' : 's'} · ${home.city_name ?? 'your city'}`}
            chip={`${home.properties} propert${home.properties === 1 ? 'y' : 'ies'}`}
          />
          <Tile
            href="/host/qr"
            title="QR Cards"
            note={`${home.qr_placed} of ${home.units_total} placed · where, when and what was ordered`}
            chip={`${home.scans_7d} scans this week`}
            chipTone="gold"
          />
          <Tile
            href="/host/bookings"
            title="Bookings & Guests"
            note="Arrivals and departures · stays linked to units"
            chip={`${home.units_live} live`}
          />
          <Tile
            href="/host/deliveries"
            title="Deliveries"
            note="Hand-off rules and proof of delivery"
            chip={
              (today?.arriving ?? 0) > 0 ? `${today?.arriving} arriving` : 'nothing in flight'
            }
            chipTone={(today?.arriving ?? 0) > 0 ? 'gold' : 'plain'}
          />
          <Tile
            href="/host/requests"
            title="Requests & Issues"
            note="Late delivery, access, extra towels · each with its chat"
            chip={
              (today?.open_requests ?? 0) > 0 ? `${today?.open_requests} open` : 'none open'
            }
            chipTone={(today?.open_requests ?? 0) > 0 ? 'danger' : 'plain'}
          />
          <Tile
            href="/host/earnings"
            title="Earnings & Invoices"
            note="Attributed orders, invoices and the monthly statement"
            chip="Statement"
          />
        </div>

        {(today?.units_without_qr ?? 0) > 0 ? (
          <section className="bg-ink grid gap-0 overflow-hidden rounded-xl text-white sm:grid-cols-[14rem_1fr]">
            <div className="from-gold/20 relative hidden bg-gradient-to-br to-transparent sm:block">
              <span className="absolute bottom-3 left-3 text-[0.5rem] font-extrabold uppercase tracking-[0.12em] text-white/40">
                Photo · QR print pack
              </span>
            </div>
            <div className="p-5">
              <h2 className="font-serif text-[1.375rem] font-extrabold tracking-tight">
                {today?.units_without_qr} live unit
                {today?.units_without_qr === 1 ? ' still needs' : 's still need'} a QR card
              </h2>
              <p className="mt-2 max-w-xl text-[0.8125rem] font-semibold leading-[1.65] text-white/60">
                A guest in a room with no card cannot order from it. Generate and print, or ask us
                to send a pack.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  href="/host/qr"
                  className="bg-gold text-ink rounded-lg px-4 py-2.5 text-[0.8125rem] font-extrabold"
                >
                  Download print pack →
                </Link>
                <span className="flex gap-4 text-[0.6875rem] font-semibold text-white/50">
                  <span className="flex items-center gap-1.5">
                    <QrCode className="h-3.5 w-3.5" aria-hidden="true" /> Generate
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Printer className="h-3.5 w-3.5" aria-hidden="true" /> Print
                  </span>
                </span>
              </div>
            </div>
          </section>
        ) : null}

        {/* ───────────────────────────── recent QR activity */}
        <section>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-serif text-[1.375rem] font-extrabold tracking-tight">
                Recent QR activity
              </h2>
              <p className="text-muted-light mt-1 text-[0.8125rem] font-semibold">
                Each scan with the unit, the time, and the first order placed after it. Guests are
                shown by first name only.
              </p>
            </div>
            <Link
              href="/host/analytics"
              className="border-border-strong bg-surface rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold"
            >
              Attribution report →
            </Link>
          </div>

          <div className="border-border bg-surface mt-3 overflow-x-auto rounded-xl border">
            <table className="w-full text-left">
              <thead className="border-border bg-bg border-b">
                <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                  <th className="px-4 py-2">Unit</th>
                  <th className="px-4 py-2">Scanned</th>
                  <th className="px-4 py-2">Guest</th>
                  <th className="px-4 py-2">Ordered</th>
                  <th className="px-4 py-2 text-right">Value</th>
                  <th className="px-4 py-2">Hand-off</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {activity.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
                        No scans yet. Once a card is placed and a guest scans it, every scan lands
                        here.
                      </p>
                    </td>
                  </tr>
                ) : (
                  activity.map((r) => {
                    const o = OUTCOME[r.outcome] ?? { label: r.outcome, tone: 'bg-bg text-muted' };
                    return (
                      <tr
                        key={r.scan_id}
                        className="border-border border-b text-[0.8125rem] font-semibold last:border-0"
                      >
                        <td className="px-4 py-3">
                          <span className="font-extrabold">{r.unit_name ?? DASH}</span>
                          {r.property_name ? (
                            <span className="text-muted-light block text-[0.6875rem]">
                              {r.property_name}
                            </span>
                          ) : null}
                        </td>
                        <td className="text-muted px-4 py-3">{when(r.scanned_at)}</td>
                        <td className="text-muted px-4 py-3">{r.guest_first_name || DASH}</td>
                        <td className="text-muted px-4 py-3">
                          {r.merchant_name ?? (r.outcome === 'browsed' ? 'Browsed · no order' : DASH)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {r.total_cents === null ? DASH : kes(r.total_cents)}
                        </td>
                        <td className="text-muted px-4 py-3">
                          {r.handoff ? (HANDOFF_LABEL[r.handoff] ?? r.handoff) : DASH}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${o.tone}`}
                          >
                            {o.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ══════════════════════════════════ the right column */}
      <aside className="space-y-4">
        <Panel
          title="Today at a glance"
          action={
            <Link
              href="/host/analytics"
              className="border-border-strong rounded-lg border px-2.5 py-1 text-[0.6875rem] font-extrabold"
            >
              Full report →
            </Link>
          }
        >
          <Row
            label="Orders via QR"
            value={String(today?.orders_today ?? 0)}
            note={`${kes(today?.value_today_cents ?? 0)} · ${today?.units_today ?? 0} unit${
              (today?.units_today ?? 0) === 1 ? '' : 's'
            }`}
          />
          <Row label="Arriving now" value={String(today?.arriving ?? 0)} />
          <Row
            label="Open requests"
            value={String(today?.open_requests ?? 0)}
            tone={(today?.open_requests ?? 0) === 0 ? 'muted' : 'plain'}
          />
          <Row
            label="Units without a card"
            value={String(today?.units_without_qr ?? 0)}
            tone={(today?.units_without_qr ?? 0) === 0 ? 'muted' : 'plain'}
          />
        </Panel>

        {top ? (
          <AttentionCard
            title={top.title}
            body={top.body}
            actions={
              <Link
                href={top.unit_id ? `/host/units?unit=${top.unit_id}` : '/host/units'}
                className="bg-ink rounded-lg px-3 py-1.5 text-[0.75rem] font-extrabold text-white"
              >
                {top.unit_name ? `Open ${top.unit_name} →` : 'Open units →'}
              </Link>
            }
          />
        ) : null}

        <Panel
          title="Arriving now"
          action={
            <Link
              href="/host/deliveries"
              className="border-border-strong rounded-lg border px-2.5 py-1 text-[0.6875rem] font-extrabold"
            >
              All deliveries →
            </Link>
          }
        >
          {arriving.length === 0 ? (
            <p className="text-muted-light px-4 py-7 text-center text-[0.8125rem] font-semibold">
              Nothing in flight. When a rider picks up for one of your units, it appears here with
              its hand-off rule.
            </p>
          ) : (
            arriving.map((a) => (
              <div
                key={a.order_id}
                className="border-border flex items-start justify-between gap-3 border-b px-4 py-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-[0.8125rem] font-extrabold">
                    {a.unit_name ?? DASH} · {a.reference}
                  </p>
                  <p className="text-muted mt-0.5 text-[0.6875rem] font-semibold">
                    {a.merchant_name ?? DASH}
                    {a.handoff ? ` · ${HANDOFF_LABEL[a.handoff] ?? a.handoff}` : ''}
                  </p>
                </div>
                <span className="bg-gold-soft text-gold-text shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold">
                  {a.stage === 'arriving' ? 'Arriving' : 'Picked up'}
                </span>
              </div>
            ))
          )}
        </Panel>

        <section>
          <h2 className="mb-2 text-[0.875rem] font-extrabold tracking-tight">Quick Access</h2>
          <div className="grid grid-cols-2 gap-2.5">
            <QuickAction
              href="/host/qr"
              icon={<QrCode className="h-4 w-4" />}
              title="Generate QR card"
              note="For a unit or room"
            />
            <QuickAction
              href="/host/units"
              icon={<Bed className="h-4 w-4" />}
              title="Add a unit"
              note="Hand-off rule & access"
            />
            <QuickAction
              href="/host/team"
              icon={<UserPlus className="h-4 w-4" />}
              title="Invite a manager"
              note="Per-property access"
            />
            <QuickAction
              href="/host/earnings"
              icon={<Download className="h-4 w-4" />}
              title="Download statement"
              note="PDF or Excel"
            />
          </div>
        </section>
      </aside>
    </div>
  );
}
