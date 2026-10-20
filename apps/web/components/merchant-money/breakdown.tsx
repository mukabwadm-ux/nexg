export interface Breakdown {
  scope: 'staff' | 'merchant';
  order: {
    id: string;
    reference: string;
    stage: string;
    channel: string;
    payment_method: string;
    payment_status: string;
    placed_at: string;
    confirmed_at: string | null;
    picked_up_at: string | null;
    delivered_at: string | null;
    cancelled_at: string | null;
    dropoff_label: string | null;
    merchant_id: string;
    merchant_name: string | null;
    guest_name: string | null;
    guest_phone: string | null;
    has_rider: boolean;
  };
  lines: { name: string; quantity: number; unit_price_cents: number; line_total_cents: number }[];
  charges: Record<string, number>;
  split: Record<string, number | string | boolean>;
  payments: {
    reference: string;
    state: string;
    provider: string;
    provider_ref: string | null;
    channel: string | null;
    amount_cents: number;
    paid_at: string | null;
    failure_reason: string | null;
    created_at: string;
  }[];
  refunds: {
    amount_cents: number;
    method: string;
    status: string;
    reason: string;
    requested_at: string;
    issued_at: string | null;
  }[];
  timeline: { at: string; title: string; detail: string | null; actor: string | null }[];
}

export function kes(cents: number | string | null | undefined): string {
  const n = Number(cents);
  if (cents === null || cents === undefined || !Number.isFinite(n)) return 'KES —';
  return 'KES ' + (n / 100).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function when(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Nairobi',
      })
    : '—';
}

function Row({
  label,
  value,
  note,
  strong,
  negative,
}: {
  label: string;
  value: string;
  note?: string;
  strong?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-muted text-[0.8125rem] font-semibold">
        {label}
        {note && <span className="text-muted-light ml-1.5 text-[0.6875rem]">{note}</span>}
      </dt>
      <dd
        className={`shrink-0 tabular-nums ${
          strong ? 'text-[0.9375rem] font-extrabold' : 'text-[0.8125rem] font-bold'
        }`}
      >
        {negative ? '− ' : ''}
        {value}
      </dd>
    </div>
  );
}

function Box({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-border bg-surface rounded-2xl border p-5 ${className}`}>
      <h2 className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * One transaction, followed from what the guest paid to who gets what.
 * Every figure comes from the database; nothing is computed here.
 */
export function BreakdownView({ b }: { b: Breakdown }) {
  const s = b.split;
  const c = b.charges;
  const staff = b.scope === 'staff';
  const n = (k: string) => Number(s[k] ?? 0);

  return (
    <div className="space-y-4">
      {s.plan_is_placeholder === true && (
        <p className="bg-gold-soft text-gold-text rounded-xl px-4 py-2.5 text-[0.8125rem] font-bold">
          Shares and rates are placeholder values until the agreed pricing plan is loaded.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Box title="1 · What the guest paid">
          <dl>
            {b.lines.map((l, i) => (
              <Row
                key={i}
                label={`${l.quantity} × ${l.name}`}
                note={`@ ${kes(l.unit_price_cents)}`}
                value={kes(l.line_total_cents)}
              />
            ))}
            <div className="border-border my-2 border-t" />
            <Row label="Basket subtotal" value={kes(c.subtotal_cents)} strong />
            {staff && (
              <>
                <Row label="Delivery fee" value={kes(c.delivery_fee_cents)} />
                <Row label="Service fee" value={kes(c.service_fee_cents)} />
                {(c.small_basket_fee_cents ?? 0) > 0 && (
                  <Row label="Small basket fee" value={kes(c.small_basket_fee_cents)} />
                )}
                {(c.night_surcharge_cents ?? 0) > 0 && (
                  <Row label="Night surcharge" value={kes(c.night_surcharge_cents)} />
                )}
                {(c.concierge_fee_cents ?? 0) > 0 && (
                  <Row label="Concierge fee" value={kes(c.concierge_fee_cents)} />
                )}
                {(c.cash_handling_cents ?? 0) > 0 && (
                  <Row label="Cash handling" value={kes(c.cash_handling_cents)} />
                )}
                {(c.tip_cents ?? 0) > 0 && <Row label="Tip" value={kes(c.tip_cents)} />}
                <div className="border-border my-2 border-t" />
                <Row label="Guest paid" value={kes(c.total_cents)} strong />
              </>
            )}
          </dl>
        </Box>

        <Box title={staff ? '2 · Where the money goes' : 'What you earn'}>
          <dl>
            <p className="text-muted-light pb-1 text-[0.6875rem] font-extrabold uppercase">
              Merchant
            </p>
            <Row label="Basket" value={kes(n('merchant_gross_cents'))} />
            <Row
              label="NexG commission"
              note={`${n('commission_pct')}%`}
              value={kes(n('commission_cents'))}
              negative
            />
            <Row label="Merchant receives" value={kes(n('merchant_net_cents'))} strong />

            {staff && (
              <>
                <div className="border-border my-3 border-t" />
                <p className="text-muted-light pb-1 text-[0.6875rem] font-extrabold uppercase">
                  Rider
                </p>
                <Row
                  label="Delivery share"
                  note={`${n('rider_delivery_pct')}% of delivery`}
                  value={kes(n('rider_delivery_cents'))}
                />
                <Row label="Tip" value={kes(n('rider_tip_cents'))} />
                <Row label="Rider receives" value={kes(n('rider_total_cents'))} strong />

                <div className="border-border my-3 border-t" />
                <p className="text-muted-light pb-1 text-[0.6875rem] font-extrabold uppercase">
                  NexG
                </p>
                <Row label="Platform revenue" value={kes(n('platform_gross_cents'))} />
                <Row
                  label="Payment provider fee"
                  note={`${n('processor_fee_pct')}%`}
                  value={kes(n('processor_fee_cents'))}
                  negative
                />
                <Row label="NexG keeps" value={kes(n('platform_net_cents'))} strong />
              </>
            )}
          </dl>
        </Box>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Box title="Status">
          <dl>
            <Row label="Order stage" value={b.order.stage} />
            <Row label="Payment method" value={b.order.payment_method.replace(/_/g, ' ')} />
            <Row label="Payment status" value={b.order.payment_status.replace(/_/g, ' ')} />
            <Row label="Settlement" value={String(s.settlement ?? '—')} />
            {staff && <Row label="Collected by" value={String(s.collected_by ?? '—')} />}
            <Row label="Placed" value={when(b.order.placed_at)} />
            <Row label="Delivered" value={when(b.order.delivered_at)} />
          </dl>
        </Box>

        {staff && (
          <Box title="Payment attempts">
            {b.payments.length === 0 ? (
              <p className="text-muted text-[0.8125rem] font-semibold">
                No payment attempt yet.
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {b.payments.map((p) => (
                  <li key={p.reference} className="py-2 text-[0.8125rem]">
                    <div className="flex justify-between gap-3 font-extrabold">
                      <span>{p.state}</span>
                      <span className="tabular-nums">{kes(p.amount_cents)}</span>
                    </div>
                    <p className="text-muted-light font-semibold">
                      {p.provider}
                      {p.channel ? ` · ${p.channel}` : ''} · ref {p.reference}
                      {p.provider_ref ? ` · ${p.provider_ref}` : ''}
                    </p>
                    <p className="text-muted-light font-semibold">
                      {p.paid_at ? `Paid ${when(p.paid_at)}` : `Started ${when(p.created_at)}`}
                      {p.failure_reason ? ` · ${p.failure_reason}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Box>
        )}
      </div>

      {b.refunds.length > 0 && (
        <Box title="Refunds">
          <ul className="divide-border divide-y">
            {b.refunds.map((r, i) => (
              <li key={i} className="flex justify-between gap-3 py-2 text-[0.8125rem] font-semibold">
                <span>
                  {r.status} · {r.method.replace(/_/g, ' ')} · {r.reason}
                </span>
                <span className="font-extrabold tabular-nums">{kes(r.amount_cents)}</span>
              </li>
            ))}
          </ul>
        </Box>
      )}

      <Box title="Timeline">
        {b.timeline.length === 0 ? (
          <p className="text-muted text-[0.8125rem] font-semibold">No events recorded.</p>
        ) : (
          <ol className="space-y-2">
            {b.timeline.map((e, i) => (
              <li key={i} className="flex gap-3 text-[0.8125rem]">
                <span className="text-muted-light w-28 shrink-0 font-semibold">{when(e.at)}</span>
                <span>
                  <span className="font-extrabold">{e.title}</span>
                  {e.detail && <span className="text-muted font-semibold"> — {e.detail}</span>}
                  {e.actor && <span className="text-muted-light font-semibold"> · {e.actor}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Box>
    </div>
  );
}

export interface TxnRow {
  id: string;
  reference: string;
  placed_at: string;
  merchant_name: string | null;
  stage: string;
  payment_method: string;
  payment_status: string;
  total_cents: number;
  subtotal_cents: number;
  commission_cents: number;
  merchant_net_cents: number;
  rider_total_cents: number | null;
  platform_net_cents: number | null;
  settlement: string;
}

export function dateTime(iso: string): string {
  return when(iso);
}
