import { formatRange } from '@nexg/ui';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  FileWarning,
  Landmark,
  Layers,
  LayoutGrid,
  ReceiptText,
  Scale,
  Send,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ShareDonut, TrendArea } from '@/components/charts';
import { ConsoleShell } from '@/components/console-shell';
import { MovementsTable } from '@/components/finance/movements';
import { ReconDetailsTable, type ReconDay } from '@/components/finance/recon';
import {
  Reconciliation,
  type ClearingRow,
  type ReconRow,
  type WebhookRow,
} from '@/components/finance/reconciliation';
import {
  NewReconciliation,
  StatementDetail,
  StatementImports,
  type StatementDetailData,
  type StatementImportRow,
} from '@/components/finance/statement-import';
import { RangeControl } from '@/components/portal/client-kit';
import {
  PageHeader,
  PanelHead,
  Pill,
  Sheet,
  Stat,
  StatGrid,
  ViewTabs,
} from '@/components/portal/kit';
import { daysBetween, LINE_STATES, RUN_STATES, share, totalsBy } from '@/lib/finance';
import { movementList, movementSummary } from '@/lib/finance-server';
import {
  dateTime,
  day,
  hrefWith,
  kes,
  kesShort,
  periodFrom,
  periodQuery,
  shillings,
} from '@/lib/portal';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Reconciliations' };
export const dynamic = 'force-dynamic';

type Tab = 'overview' | 'settlement' | 'payouts' | 'provider' | 'discrepancies';

const SOURCES: Record<string, { label: string; color: string }> = {
  sales: { label: 'Merchants (Sales)', color: '#F5B800' },
  stays: { label: 'NexG Stays (Bookings)', color: '#141414' },
  featured: { label: 'Featured Placements', color: '#F9DC7A' },
  rider: { label: 'Riders (Float)', color: '#8C8678' },
};

interface MismatchLine {
  id: string;
  run_id: string;
  run_reference: string;
  pay_date: string;
  party_label: string;
  gross_cents: number;
  recomputed_cents: number;
  state: string;
}

interface Invariant {
  key: string;
  label: string;
  question: string | null;
  severity: string | null;
  breaches: number | null;
  ran_at: string | null;
}

/**
 * Finance → Reconciliations: what the payment providers recorded beside
 * what the ledger booked, settlement lines that no longer re-sum to their
 * ledger entries, payouts not yet confirmed, callbacks that did nothing,
 * and the books' own invariants. Two independently written records of the
 * same money side by side; the gap is the output.
 */
export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams?: { tab?: string; from?: string; to?: string; import?: string };
}) {
  const staff = await requireStaff();
  const finance = requireModule(staff, 'finance');
  const canWrite = staff.isSuperAdmin || finance.level === 'full';
  const period = periodFrom(searchParams);
  const pq = periodQuery(period);
  const supabase = createClient();
  /* Statement imports: started with the reads below; an error there stays in its own tab. */
  const statementsQuery = Promise.resolve(
    supabase.rpc('rpc_fin_statement_imports', { p_from: period.from, p_to: period.to }),
  );

  const [reconRes, clearingRes, webhookRes, invariantRes, mismatchRes, runsRes, summary] =
    await Promise.all([
      supabase
        .from('fin_provider_recon_v')
        .select('*')
        .gte('day', period.from)
        .lte('day', period.to)
        .limit(1000),
      supabase.from('fin_clearing_aging_v').select('*'),
      supabase
        .from('fin_webhook_gap_v')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(200),
      supabase.from('fin_invariant_v').select('key, label, question, severity, breaches, ran_at'),
      supabase
        .from('fin_run_line_v')
        .select(
          'id, run_id, run_reference, pay_date, party_label, gross_cents, recomputed_cents, state',
        )
        .eq('verifies', false)
        .gte('pay_date', period.from)
        .lte('pay_date', period.to)
        .limit(500),
      supabase
        .from('fin_run_v')
        .select('id, reference, state, pay_date, line_count, checks_pass')
        .gte('pay_date', period.from)
        .lte('pay_date', period.to)
        .order('pay_date', { ascending: false }),
      movementSummary(supabase, period.from, period.to),
    ]);

  const statementsRes = await statementsQuery;
  const statements = (statementsRes.data ?? []) as unknown as StatementImportRow[];
  const statementsOpen = statements
    .filter((s) => s.status === 'open')
    .reduce((n, s) => n + Number(s.open_count), 0);
  const importId = /^[0-9a-f-]{36}$/i.test(searchParams?.import ?? '')
    ? searchParams!.import!
    : null;

  const recon = ((reconRes.data ?? []) as unknown as ReconRow[]).map((r) => ({
    ...r,
    payment_count: Number(r.payment_count),
    provider_cents: Number(r.provider_cents),
    ledger_cents: Number(r.ledger_cents),
    difference_cents: Number(r.difference_cents),
  }));
  const webhooks = (webhookRes.data ?? []) as unknown as WebhookRow[];
  const invariants = ((invariantRes.data ?? []) as unknown as Invariant[]).filter(
    (i) => (i.breaches ?? 0) > 0,
  );
  const mismatches = ((mismatchRes.data ?? []) as unknown as MismatchLine[]).map((l) => ({
    ...l,
    gross_cents: Number(l.gross_cents),
    recomputed_cents: Number(l.recomputed_cents),
  }));
  const runs = (runsRes.data ?? []) as unknown as {
    id: string;
    reference: string;
    state: string;
    pay_date: string;
    line_count: number;
    checks_pass: boolean;
  }[];
  const failed =
    reconRes.error?.message ??
    webhookRes.error?.message ??
    mismatchRes.error?.message ??
    summary.error;

  /*
   * The view joins the ledger by day only, so a day with two providers
   * repeats the ledger's figure on each row. Add up by day first: the
   * providers together against the ledger once.
   */
  const byDay = new Map<string, { provider: number; ledger: number; payments: number }>();
  for (const r of recon) {
    const d = byDay.get(r.day) ?? { provider: 0, ledger: 0, payments: 0 };
    d.provider += r.provider_cents;
    d.ledger = Math.max(d.ledger, r.ledger_cents);
    d.payments += r.payment_count;
    byDay.set(r.day, d);
  }
  let toReconcile = 0;
  let reconciled = 0;
  let unreconciled = 0;
  let payments = 0;
  const trendMap = new Map<string, { reconciled: number; unreconciled: number }>();
  /*
   * Per day, the larger of the two records is what has to be reconciled,
   * the part both agree on is reconciled, and the difference is not. The
   * two shares add up to the whole, whichever side is short.
   */
  for (const [d, v] of byDay) {
    const matched = Math.min(v.provider, v.ledger);
    const gap = Math.abs(v.provider - v.ledger);
    toReconcile += Math.max(v.provider, v.ledger);
    reconciled += matched;
    unreconciled += gap;
    payments += v.payments;
    trendMap.set(d, {
      reconciled: Math.round(matched / 100),
      unreconciled: Math.round(gap / 100),
    });
  }
  const varianceDays = [...byDay.values()].filter((v) => v.provider !== v.ledger).length;
  const days = daysBetween(period.from, period.to);
  const trend = days.map((d) => ({
    day: d,
    ...(trendMap.get(d) ?? { reconciled: 0, unreconciled: 0 }),
  }));

  const details: ReconDay[] = recon
    .map((r) => ({
      key: `${r.day}-${r.provider}`,
      reference: `REC-${r.day.replace(/-/g, '')}-${r.provider.toUpperCase().replace(/[^A-Z0-9]+/g, '')}`,
      day: r.day,
      provider: r.provider,
      payments: r.payment_count,
      expected_cents: r.provider_cents,
      ledger_cents: r.ledger_cents,
      variance_cents: r.difference_cents,
    }))
    .sort((a, b) =>
      a.day < b.day ? 1 : a.day > b.day ? -1 : a.provider.localeCompare(b.provider),
    );

  const sources = totalsBy(summary.rows, (r) =>
    r.source !== 'payment' || r.status !== 'successful'
      ? null
      : r.kind === 'rider'
        ? 'rider'
        : r.kind === 'merchant'
          ? 'featured'
          : r.category === 'stays'
            ? 'stays'
            : 'sales',
  );

  /* Payouts not yet confirmed: lines sent or failed, M-Pesa payouts in doubt. */
  /* Imported statements live on the Bank/M-PESA tab, as the design groups them;
     the old ?tab=statements links land there. */
  const tab: Tab =
    searchParams?.tab === 'statements'
      ? 'provider'
      : (['overview', 'settlement', 'payouts', 'provider', 'discrepancies'] as const).includes(
            searchParams?.tab as Tab,
          )
        ? (searchParams!.tab as Tab)
        : 'overview';
  const detailRes =
    tab === 'provider' && importId
      ? await supabase.rpc('rpc_fin_statement_detail', { p_import_id: importId })
      : null;
  let payoutRows: Awaited<ReturnType<typeof movementList>>['rows'] = [];
  let payoutsTruncated = false;
  let uncertain = 0;
  {
    const lists = await Promise.all(
      (['merchant', 'rider', 'refund'] as const).map((k) =>
        movementList(supabase, period.from, period.to, k),
      ),
    );
    payoutRows = lists
      .flatMap((l) => l.rows)
      .filter(
        (m) =>
          (m.source === 'payout' || m.source === 'b2c') &&
          (m.status === 'failed' ||
            (m.status === 'pending' &&
              ['sent', 'queued', 'accepted', 'sending', 'uncertain'].includes(m.state))),
      )
      .sort((a, b) => (a.happened_at < b.happened_at ? 1 : -1));
    payoutsTruncated = lists.some((l) => l.truncated);
    uncertain = payoutRows.filter((m) => m.state === 'uncertain' || m.status === 'failed').length;
  }

  const discrepancies =
    varianceDays + webhooks.length + invariants.length + mismatches.length + uncertain;

  const href = (key: Tab) =>
    hrefWith('/finance/reconciliation', {
      tab: key === 'overview' ? null : key,
      ...(pq ? { from: period.from, to: period.to } : {}),
    });
  const tabs: { key: Tab | 'reports'; label: string; icon: LucideIcon; alert?: number | null }[] = [
    { key: 'overview', label: 'Overview', icon: LayoutGrid },
    {
      key: 'settlement',
      label: 'Settlement Reconciliation',
      icon: Layers,
      alert: mismatches.length || null,
    },
    { key: 'payouts', label: 'Payout Reconciliation', icon: Send, alert: uncertain || null },
    {
      key: 'provider',
      label: 'Bank/M-PESA Reconciliation',
      icon: Landmark,
      alert: statementsOpen || null,
    },
    {
      key: 'discrepancies',
      label: 'Discrepancies',
      icon: AlertTriangle,
      alert: discrepancies || null,
    },
    /* The designs end the bar with Reports: the reconciliation exports on Finance → Reports. */
    { key: 'reports', label: 'Reports', icon: FileText },
  ];
  const pct = (part: number) => {
    const s = share(part, toReconcile);
    return s == null ? undefined : `${s.toLocaleString('en-KE', { maximumFractionDigits: 1 })}%`;
  };

  return (
    <ConsoleShell staff={staff}>
      <PageHeader
        icon={Scale}
        title="Reconciliations"
        subtitle="Match payments, settlements, payouts and M-Pesa records against the ledger."
        actions={
          <>
            <RangeControl from={period.from} to={period.to} />
            {canWrite && <NewReconciliation from={period.from} to={period.to} />}
          </>
        }
      />

      <main className="space-y-5 px-3 py-5 sm:px-6 sm:py-6">
        <ViewTabs
          active={tab}
          tabs={tabs.map((t) => ({
            key: t.key,
            label: t.label,
            icon: t.icon,
            href:
              t.key === 'reports'
                ? hrefWith('/finance/reports', {
                    tab: 'exports',
                    ...(pq ? { from: period.from, to: period.to } : {}),
                  })
                : href(t.key),
            alert: t.alert,
          }))}
        />

        {failed && (
          <p
            role="alert"
            className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
          >
            Reconciliations could not be loaded in full: {failed}
          </p>
        )}

        {tab === 'overview' && (
          <>
            <StatGrid dense>
              <Stat
                icon={Wallet}
                value={kes(toReconcile)}
                label="Total to Reconcile"
                note="Payments or ledger cash, whichever is larger each day"
              />
              <Stat
                icon={CheckCircle2}
                tone="green"
                value={kes(reconciled)}
                label="Reconciled"
                note={pct(reconciled)}
                noteTone="good"
              />
              <Stat
                icon={AlertTriangle}
                tone={unreconciled ? 'red' : 'gold'}
                value={kes(unreconciled)}
                label="Unreconciled"
                note={pct(unreconciled)}
                noteTone={unreconciled ? 'bad' : 'muted'}
                href={unreconciled ? href('provider') : undefined}
              />
              <Stat
                icon={ReceiptText}
                value={payments.toLocaleString('en-KE')}
                label="Transactions"
              />
              <Stat
                icon={FileWarning}
                tone={discrepancies ? 'red' : 'gold'}
                value={discrepancies.toLocaleString('en-KE')}
                label="Discrepancies"
                note={discrepancies ? 'Open the list' : 'Nothing open'}
                noteTone={discrepancies ? 'bad' : 'good'}
                href={href('discrepancies')}
              />
            </StatGrid>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <Sheet>
                <PanelHead title="Reconciliation Trend" aside={formatRange(period)} />
                <div className="mt-4">
                  {trend.some((t) => t.reconciled || t.unreconciled) ? (
                    <TrendArea
                      data={trend}
                      unit="kes"
                      series={[
                        { key: 'reconciled', label: 'Reconciled', color: '#F5B800', fill: true },
                        { key: 'unreconciled', label: 'Unreconciled', color: '#A8A296' },
                      ]}
                    />
                  ) : (
                    <p className="text-muted-light py-12 text-center text-sm">
                      No paid payments or cash entries in this period.
                    </p>
                  )}
                </div>
              </Sheet>
              <Sheet>
                <PanelHead title="Payments by Source" aside={formatRange(period)} />
                <div className="mt-4">
                  {sources.length ? (
                    <ShareDonut
                      unit="kes"
                      centre={kesShort(sources.reduce((s, x) => s + x.cents, 0))}
                      caption="Paid"
                      data={sources.map((s) => ({
                        key: s.key,
                        label: SOURCES[s.key]!.label,
                        value: Math.round(s.cents / 100),
                        color: SOURCES[s.key]!.color,
                      }))}
                    />
                  ) : (
                    <p className="text-muted-light py-12 text-center text-sm">
                      No paid payments in this period.
                    </p>
                  )}
                </div>
              </Sheet>
            </div>

            <Sheet>
              <ReconDetailsTable rows={details} />
            </Sheet>
          </>
        )}

        {tab === 'settlement' && (
          <>
            <Sheet>
              <PanelHead
                title="Runs in This Period"
                aside="every line re-summed against the ledger entries it claims"
              />
              {runs.length === 0 ? (
                <p className="text-muted-light py-10 text-center text-sm">
                  No payout runs pay in this period.
                </p>
              ) : (
                <ul className="divide-border mt-3 divide-y">
                  {runs.map((r) => {
                    const bad = mismatches.filter((m) => m.run_id === r.id).length;
                    const st = RUN_STATES[r.state] ?? { label: r.state, tone: 'grey' as const };
                    return (
                      <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                        <Link
                          href={`/finance/settlements?tab=batches&run=${r.id}`}
                          className="hover:text-gold-text min-w-0 flex-1 font-bold"
                        >
                          {r.reference}
                          <span className="text-muted-light block text-xs font-semibold">
                            Pays {day(r.pay_date)} · {Number(r.line_count).toLocaleString('en-KE')}{' '}
                            lines
                          </span>
                        </Link>
                        <Pill tone={st.tone}>{st.label}</Pill>
                        {bad ? (
                          <Pill tone="red" dot>
                            {bad} Line{bad === 1 ? '' : 's'} Do Not Re-Sum
                          </Pill>
                        ) : (
                          <Pill tone="green" dot>
                            Every Line Re-Sums
                          </Pill>
                        )}
                        {!r.checks_pass && <Pill tone="amber">Checks Failing</Pill>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Sheet>
            {mismatches.length > 0 && (
              <Sheet>
                <PanelHead
                  title="Lines That Do Not Re-Sum"
                  aside="hold these before anything is sent"
                />
                <div className="border-border mt-4 overflow-x-auto rounded-2xl border">
                  <table className="w-full min-w-[40rem] text-left text-sm">
                    <caption className="sr-only">
                      Settlement lines whose amount differs from their ledger entries
                    </caption>
                    <thead className="bg-bg text-muted text-xs font-bold">
                      <tr>
                        <th scope="col" className="px-4 py-2.5">
                          Payee
                        </th>
                        <th scope="col" className="px-4 py-2.5">
                          Run
                        </th>
                        <th scope="col" className="px-4 py-2.5 text-right">
                          On the Line (KES)
                        </th>
                        <th scope="col" className="px-4 py-2.5 text-right">
                          Ledger Now (KES)
                        </th>
                        <th scope="col" className="px-4 py-2.5 text-right">
                          Gap (KES)
                        </th>
                        <th scope="col" className="px-4 py-2.5">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-border divide-y tabular-nums">
                      {mismatches.map((m) => (
                        <tr key={m.id}>
                          <td className="px-4 py-2.5 font-semibold">{m.party_label}</td>
                          <td className="px-4 py-2.5">{m.run_reference}</td>
                          <td className="px-4 py-2.5 text-right">{shillings(m.gross_cents)}</td>
                          <td className="px-4 py-2.5 text-right">
                            {shillings(m.recomputed_cents)}
                          </td>
                          <td className="text-danger px-4 py-2.5 text-right font-bold">
                            {shillings(m.gross_cents - m.recomputed_cents)}
                          </td>
                          <td className="px-4 py-2.5">
                            <Pill tone={LINE_STATES[m.state]?.tone ?? 'grey'}>
                              {LINE_STATES[m.state]?.label ?? m.state}
                            </Pill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Sheet>
            )}
          </>
        )}

        {tab === 'payouts' && (
          <Sheet>
            <MovementsTable
              rows={payoutRows}
              truncated={payoutsTruncated}
              title="Payouts Not Yet Confirmed"
              filename={`nexg-unconfirmed-payouts-${period.from}-to-${period.to}.csv`}
              emptyTitle="Every payout in this period is confirmed"
              emptyText="Settlement lines sent but not confirmed paid, failed payouts, and M-Pesa payouts whose result is uncertain appear here until they are resolved."
            />
          </Sheet>
        )}

        {tab === 'provider' &&
          (detailRes ? (
            detailRes.error || !detailRes.data ? (
              <p
                role="alert"
                className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
              >
                This statement import could not be loaded:{' '}
                {detailRes.error?.message ?? 'it does not exist.'}
              </p>
            ) : (
              <StatementDetail
                data={detailRes.data as unknown as StatementDetailData}
                canWrite={canWrite}
                listHref={href('provider')}
              />
            )
          ) : (
            <>
              <Sheet>
                <StatementImports
                  rows={statements}
                  error={statementsRes.error?.message ?? null}
                  listHref={href('provider')}
                />
              </Sheet>
              <Sheet>
                <Reconciliation
                  clearing={(clearingRes.data as ClearingRow[] | null) ?? []}
                  recon={recon}
                  webhooks={webhooks}
                />
              </Sheet>
            </>
          ))}

        {tab === 'discrepancies' && (
          <Sheet>
            <PanelHead title="Discrepancies" aside={formatRange(period)} />
            {discrepancies === 0 ? (
              <p className="text-muted-light py-10 text-center text-sm">
                Nothing disagrees: providers match the ledger, every line re-sums, no callback went
                unhandled and no check is failing.
              </p>
            ) : (
              <ul className="divide-border mt-3 divide-y">
                {[...byDay.entries()]
                  .filter(([, v]) => v.provider !== v.ledger)
                  .sort(([a], [b]) => (a < b ? 1 : -1))
                  .map(([d, v]) => (
                    <Item
                      key={`day-${d}`}
                      tone="red"
                      kind="Variance"
                      title={`Payments and ledger cash differ on ${day(d)}`}
                      detail={`Providers recorded ${kes(v.provider)}; the ledger booked ${kes(v.ledger)} to cash.`}
                      amount={kes(v.provider - v.ledger)}
                      href={href('provider')}
                    />
                  ))}
                {invariants.map((i) => (
                  <Item
                    key={`inv-${i.key}`}
                    tone={i.severity === 'critical' ? 'red' : 'amber'}
                    kind="Check Failing"
                    title={i.label}
                    detail={`${i.question ?? ''} ${Number(i.breaches)} breach${Number(i.breaches) === 1 ? '' : 'es'}${i.ran_at ? `, checked ${dateTime(i.ran_at)}` : ''}.`}
                  />
                ))}
                {mismatches.map((m) => (
                  <Item
                    key={`line-${m.id}`}
                    tone="red"
                    kind="Settlement"
                    title={`${m.party_label} in ${m.run_reference} does not re-sum`}
                    detail={`The line says ${kes(m.gross_cents)}; its ledger entries now total ${kes(m.recomputed_cents)}.`}
                    amount={kes(m.gross_cents - m.recomputed_cents)}
                    href={`/finance/settlements?tab=batches&run=${m.run_id}`}
                  />
                ))}
                {payoutRows
                  .filter((p) => p.state === 'uncertain' || p.status === 'failed')
                  .map((p) => (
                    <Item
                      key={`pay-${p.source}-${p.id}`}
                      tone="red"
                      kind="Payout"
                      title={`${p.description} to ${p.party ?? 'a payee'} ${p.state === 'uncertain' ? 'has an uncertain result' : 'failed'}`}
                      detail={p.note ?? `Reference ${p.reference}.`}
                      amount={kes(p.amount_cents)}
                      href={href('payouts')}
                    />
                  ))}
                {webhooks.map((w) => (
                  <Item
                    key={`hook-${w.id}`}
                    tone={w.signature_ok ? 'amber' : 'red'}
                    kind="Callback"
                    title={`${w.provider} ${w.event} did nothing`}
                    detail={`${w.gap}${w.reference ? ` · ${w.reference}` : ''} · received ${dateTime(w.received_at)}`}
                    amount={w.amount_cents != null ? kes(Number(w.amount_cents)) : undefined}
                    href={href('provider')}
                  />
                ))}
              </ul>
            )}
          </Sheet>
        )}
      </main>
    </ConsoleShell>
  );
}

function Item({
  tone,
  kind,
  title,
  detail,
  amount,
  href,
}: {
  tone: 'red' | 'amber';
  kind: string;
  title: string;
  detail: string;
  amount?: string;
  href?: string;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <Pill tone={tone} dot>
            {kind}
          </Pill>
          <span className="text-sm font-bold">{title}</span>
        </span>
        <span className="text-muted mt-1 block text-xs leading-relaxed">{detail}</span>
      </span>
      {amount && (
        <span className="whitespace-nowrap text-sm font-extrabold tabular-nums">{amount}</span>
      )}
    </>
  );
  return (
    <li>
      {href ? (
        <Link
          href={href}
          className="hover:bg-bg -mx-2 flex items-center gap-3 rounded-xl px-2 py-3"
        >
          {body}
        </Link>
      ) : (
        <div className="flex items-center gap-3 py-3">{body}</div>
      )}
    </li>
  );
}
