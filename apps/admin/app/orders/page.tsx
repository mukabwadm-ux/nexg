import { Card } from '@nexg/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { ManualOrder } from '@/components/live/manual-order';
import {
  OrderPanel,
  type ItemRow,
  type OrderDetail,
  type TimelineRow,
} from '@/components/live/order-panel';
import {
  Chip,
  DASH,
  PAYMENT_LABEL,
  PAYMENT_STATUS_LABEL,
  Pill,
  STAGE_LABEL,
  STAGE_TONE,
  clock,
  kes,
  num,
} from '@/components/live/shared';
import type { Candidate } from '@/components/live/workbench';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Orders' };
export const dynamic = 'force-dynamic';

const CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'action', label: 'Needs action' },
  { key: 'disputed', label: 'Disputed' },
  { key: 'refunds', label: 'Refunds' },
  { key: 'scheduled', label: 'Scheduled' },
] as const;

/**
 * Operate → Orders.
 *
 * The same rows as Live operations, read through a different lens:
 * Live leads with the clock and the cascade, this leads with money
 * and the timeline. They share `console_live_orders_needs_v` so a
 * queue cleared on one is cleared on the other.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams?: { city?: string; chip?: string; selected?: string; q?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'orders');
  const supabase = createClient();

  const chip = CHIPS.some((c) => c.key === searchParams?.chip) ? searchParams!.chip! : 'live';
  const q = (searchParams?.q ?? '').trim();

  const { data: cities } = await supabase
    .from('city')
    .select('id, name, slug, status')
    .order('sort');
  const cityRows =
    (cities as { id: string; name: string; slug: string; status: string }[] | null) ?? [];
  const live = cityRows.filter((c) => c.status === 'live');
  const city = live.find((c) => c.slug === searchParams?.city) ?? live[0];

  if (!city) {
    return (
      <ConsoleShell staff={staff} current="/orders">
        <ConsoleHeader title="Orders" breadcrumb="Every order, its money and its timeline" />
        <main className="px-4 py-6 sm:px-8">
          <Card className="p-6">
            <p className="text-[0.9375rem] font-extrabold">No city is live yet.</p>
          </Card>
        </main>
      </ConsoleShell>
    );
  }

  const [rowsQ, feesQ] = await Promise.all([
    supabase
      .from('console_live_orders_needs_v')
      .select('*')
      .eq('city_id', city.id)
      .order('placed_at', { ascending: false })
      .limit(300),
    supabase
      .from('dispatch_rules_v')
      .select('refund_two_person_cents')
      .eq('city_id', city.id)
      .maybeSingle(),
  ]);

  const problems = [rowsQ.error?.message].filter(Boolean) as string[];
  const all = (rowsQ.data as OrderRow[] | null) ?? [];

  const today = all.filter(
    (o) => new Date(o.placed_at).toDateString() === new Date().toDateString(),
  );
  const open = all.filter((o) => !['delivered', 'cancelled', 'refunded'].includes(o.stage));

  const counts = {
    all: all.length,
    live: open.length,
    action: all.filter((o) => o.needs_action_reasons?.length).length,
    disputed: all.filter((o) => o.stage === 'disputed').length,
    refunds: all.filter((o) => o.stage === 'refunded').length,
    scheduled: all.filter((o) => o.scheduled_for !== null).length,
  };

  let rows =
    chip === 'live'
      ? open
      : chip === 'action'
        ? all.filter((o) => o.needs_action_reasons?.length)
        : chip === 'disputed'
          ? all.filter((o) => o.stage === 'disputed')
          : chip === 'refunds'
            ? all.filter((o) => o.stage === 'refunded')
            : chip === 'scheduled'
              ? all.filter((o) => o.scheduled_for !== null)
              : all;

  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((o) =>
      [o.reference, o.guest, o.merchant, o.rider, o.dropoff_label]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(needle)),
    );
  }

  const selectedId = searchParams?.selected ?? rows[0]?.id ?? null;

  let detail: OrderDetail | null = null;
  let timeline: TimelineRow[] = [];
  let items: ItemRow[] = [];
  let candidates: Candidate[] = [];

  if (selectedId) {
    const [d, t, i, waiting] = await Promise.all([
      supabase.from('console_order_detail_v').select('*').eq('id', selectedId).maybeSingle(),
      supabase.from('console_order_timeline_v').select('*').eq('order_id', selectedId).order('at'),
      supabase.from('console_order_items_v').select('*').eq('order_id', selectedId),
      /* Approved and not yet out. Shown on the order rather than
         in a queue somewhere else, because the person asking
         "where is my refund" is looking at this order. */
      supabase
        .from('refunds_to_issue_v')
        .select('refund_id, amount_cents')
        .eq('order_id', selectedId),
    ]);
    detail = (d.data as OrderDetail | null) ?? null;
    if (detail) {
      detail.refund_waiting_to_send = (
        (waiting.data as { refund_id: string; amount_cents: number }[] | null) ?? []
      ).map((r) => ({ id: r.refund_id, amount_cents: r.amount_cents }));
    }
    timeline = (t.data as TimelineRow[] | null) ?? [];
    items = (i.data as ItemRow[] | null) ?? [];
    for (const e of [d.error, t.error, i.error]) if (e) problems.push(e.message);

    if (detail?.job_id) {
      const { data } = await supabase.rpc('rpc_dispatch_candidates', {
        p_job_id: detail.job_id,
        p_include_ineligible: false,
      });
      candidates = (data as Candidate[] | null) ?? [];
    }
  }

  const refundThreshold =
    (feesQ.data as { refund_two_person_cents: number | null } | null)?.refund_two_person_cents ??
    null;

  const { data: merchants } = await supabase
    .from('merchant')
    .select('id, trading_name, legal_name, category')
    .eq('city_id', city.id)
    .eq('status', 'live')
    .order('trading_name')
    .limit(200);

  return (
    <ConsoleShell staff={staff} current="/orders">
      <ConsoleHeader
        title="Orders"
        breadcrumb={`${num(today.length)} today · ${num(open.length)} live · ${num(counts.action)} ${
          counts.action === 1 ? 'needs' : 'need'
        } action`}
        action={
          <ManualOrder
            cityId={city.id}
            merchants={
              (merchants as
                | { id: string; trading_name: string | null; legal_name: string }[]
                | null) ?? []
            }
          />
        }
      />

      <main className="px-4 py-6 sm:px-8">
        {problems.length > 0 && (
          <Card className="border-danger mb-4 border p-4">
            <p className="text-danger text-[0.8125rem] font-extrabold">
              Part of this page could not be read, so what is below is incomplete.
            </p>
            <ul className="text-muted mt-1.5 space-y-0.5 text-[0.75rem] font-semibold">
              {problems.map((p) => (
                <li key={p}>· {p}</li>
              ))}
            </ul>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {live.map((c) => (
            <Chip key={c.id} on={city.id === c.id} href={`/orders?city=${c.slug}&chip=${chip}`}>
              {c.name}
            </Chip>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {CHIPS.map((c) => (
            <Chip
              key={c.key}
              on={chip === c.key}
              href={`/orders?city=${city.slug}&chip=${c.key}`}
              count={counts[c.key]}
              tone={c.key === 'action' || c.key === 'disputed' ? 'danger' : undefined}
            >
              {c.label}
            </Chip>
          ))}
        </div>

        <form method="get" className="mt-3 flex gap-2">
          <input type="hidden" name="city" value={city.slug} />
          <input type="hidden" name="chip" value={chip} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Order, guest, merchant, rider or address"
            className="border-border-strong w-full max-w-sm rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
          />
          <button
            type="submit"
            className="border-border-strong hover:border-ink rounded-lg border px-3 py-2 text-[0.75rem] font-extrabold"
          >
            Search
          </button>
        </form>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_410px]">
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-left">
              <thead>
                <tr className="text-muted-light border-border border-b text-[0.625rem] font-extrabold uppercase tracking-[0.06em]">
                  <th className="px-4 py-2.5">Order</th>
                  <th className="px-4 py-2.5">Guest</th>
                  <th className="px-4 py-2.5">Payment</th>
                  <th className="px-4 py-2.5">Merchant</th>
                  <th className="px-4 py-2.5">Rider</th>
                  <th className="px-4 py-2.5">Stage</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-muted px-4 py-6 text-[0.8125rem] font-semibold">
                      {q ? `Nothing matches “${q}”.` : 'Nothing here.'}
                    </td>
                  </tr>
                )}
                {rows.map((o) => (
                  <tr
                    key={o.id}
                    className={`border-border border-b ${
                      selectedId === o.id
                        ? 'bg-gold-soft border-gold border-l-4'
                        : 'border-l-4 border-l-transparent'
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <Link href={`/orders?city=${city.slug}&chip=${chip}&selected=${o.id}`}>
                        <span className="text-[0.8125rem] font-extrabold">{o.reference}</span>
                        <span className="text-muted-light block text-[0.625rem] font-semibold">
                          {clock(o.placed_at)}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-[0.75rem] font-semibold">
                      {o.guest ?? DASH}
                      {o.guest_vip && (
                        <span className="text-gold-text ml-1 text-[0.5625rem] font-extrabold">
                          VIP
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[0.75rem] font-semibold">
                      <span className="block">{o.dropoff_label ?? DASH}</span>
                      <span className="text-muted-light block text-[0.625rem]">
                        {PAYMENT_LABEL[o.payment_method] ?? o.payment_method} ·{' '}
                        {PAYMENT_STATUS_LABEL[o.payment_status] ?? o.payment_status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[0.75rem] font-semibold">
                      {o.merchant ?? DASH}
                    </td>
                    <td className="px-4 py-2.5 text-[0.75rem] font-semibold">
                      {o.rider ?? <span className="text-muted-light">— unassigned</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Pill tone={STAGE_TONE[o.stage]}>{STAGE_LABEL[o.stage] ?? o.stage}</Pill>
                      {o.needs_action_reads_as && (
                        <span className="text-danger block text-[0.625rem] font-bold">
                          {o.needs_action_reads_as}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[0.8125rem] font-extrabold tabular-nums">
                      {kes(o.total_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-muted-light px-4 py-3 text-[0.6875rem] font-semibold">
              Showing {rows.length} of {num(counts.all)} in {city.name}.
            </p>
          </Card>

          <div>
            {detail ? (
              <OrderPanel
                order={detail}
                timeline={timeline}
                items={items}
                candidates={candidates}
                refundThresholdCents={refundThreshold}
              />
            ) : (
              <Card className="p-6">
                <p className="text-[0.9375rem] font-extrabold">Pick an order.</p>
                <p className="text-muted mt-2 text-[0.8125rem] font-semibold">
                  Its money, its timeline and everything that can still be done to it appear here.
                </p>
              </Card>
            )}
          </div>
        </div>
      </main>
    </ConsoleShell>
  );
}

interface OrderRow {
  id: string;
  reference: string;
  stage: string;
  payment_method: string;
  payment_status: string;
  guest: string | null;
  guest_vip: boolean | null;
  merchant: string | null;
  rider: string | null;
  dropoff_label: string | null;
  placed_at: string;
  total_cents: number;
  scheduled_for: string | null;
  needs_action_reasons: string[] | null;
  needs_action_reads_as: string | null;
}
