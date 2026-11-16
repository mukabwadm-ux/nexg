import { formatRange } from '@nexg/ui';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileMinus,
  FilePen,
  FileText,
  Files,
  LayoutGrid,
  ReceiptText,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Metadata } from 'next';

import { ShareDonut, TrendArea } from '@/components/charts';
import { ConsoleShell } from '@/components/console-shell';
import {
  InvoicesTable,
  TaxDocsTable,
  type InvoiceListRow,
  type TaxDoc,
} from '@/components/finance/invoice-list';
import { RangeControl } from '@/components/portal/client-kit';
import { PageHeader, PanelHead, Sheet, Stat, StatGrid, ViewTabs } from '@/components/portal/kit';
import { INVOICE_BUCKETS, invoiceBucket, share, type InvoiceBucket } from '@/lib/finance';
import { invoiceList } from '@/lib/finance-server';
import { lastMonths, previousPeriod } from '@/lib/office-finance';
import {
  change,
  hrefWith,
  kes,
  kesShort,
  periodBounds,
  periodFrom,
  periodQuery,
  todayInNairobi,
} from '@/lib/portal';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Invoices' };
export const dynamic = 'force-dynamic';

type Tab = 'overview' | 'all' | 'drafts' | 'outstanding' | 'paid' | 'overdue' | 'tax' | 'credit';

const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid },
  { key: 'all', label: 'All invoices', icon: Files },
  { key: 'drafts', label: 'Drafts', icon: FilePen },
  { key: 'outstanding', label: 'Outstanding', icon: Clock3 },
  { key: 'paid', label: 'Paid', icon: CheckCircle2 },
  { key: 'overdue', label: 'Overdue', icon: AlertTriangle },
  { key: 'tax', label: 'Tax invoices', icon: ReceiptText },
  { key: 'credit', label: 'Credit notes', icon: FileMinus },
];

/**
 * Finance → Invoices: host invoices, hotel statements and merchant
 * statements (rpc_finance_invoices, amounts in cents), and the KRA tax
 * invoices and credit notes issued per order (tax_invoice). Totals count
 * what was issued in the period; drafts are not issued and are left out.
 */
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams?: { tab?: string; from?: string; to?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  const tab: Tab = TABS.some((t) => t.key === searchParams?.tab)
    ? (searchParams!.tab as Tab)
    : 'overview';
  const period = periodFrom(searchParams);
  const pq = periodQuery(period);
  const before = previousPeriod(period.from, period.to);
  const today = todayInNairobi();
  const months = lastMonths(period.to, 6);
  const earliest = [months[0]!, before.from].sort()[0]!;
  const bounds = periodBounds(period);
  const supabase = createClient();

  const [invoices, taxRes] = await Promise.all([
    invoiceList(supabase, earliest, period.to),
    tab === 'tax' || tab === 'credit'
      ? supabase
          .from('tax_invoice')
          .select(
            'id, number, kind, purpose, party_name, party_pin, issued_at, net_cents, vat_cents, gross_cents, kra_status, kra_reference',
          )
          .eq('kind', tab === 'tax' ? 'tax_invoice' : 'credit_note')
          .gte('issued_at', bounds.start)
          .lt('issued_at', bounds.end)
          .order('issued_at', { ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const failed = invoices.error ?? taxRes.error?.message ?? null;

  const issuedDay = (r: InvoiceListRow) =>
    new Date(r.issued_at).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const issuedIn = (r: InvoiceListRow, from: string, to: string) =>
    issuedDay(r) >= from && issuedDay(r) <= to;
  const all = invoices.rows as InvoiceListRow[];
  const bucket = (r: InvoiceListRow) => invoiceBucket(r, today);
  const inPeriod = all.filter((r) => issuedIn(r, period.from, period.to));
  const issued = inPeriod.filter((r) => bucket(r) !== 'draft');
  const issuedBefore = all.filter(
    (r) => issuedIn(r, before.from, before.to) && bucket(r) !== 'draft',
  );
  const sum = (rows: InvoiceListRow[]) => rows.reduce((s, r) => s + r.total_cents, 0);
  const total = sum(issued);
  const delta = change(total, sum(issuedBefore));
  const by = (b: InvoiceBucket) => sum(issued.filter((r) => bucket(r) === b));
  const overdueAll = all.filter((r) => bucket(r) === 'overdue');
  const pct = (part: number) => {
    const s = share(part, total);
    return s == null ? undefined : `${s.toLocaleString('en-KE', { maximumFractionDigits: 1 })}%`;
  };

  const trend = months.map((m) => ({
    day: m,
    invoiced: Math.round(
      sum(all.filter((r) => issuedDay(r).slice(0, 7) === m.slice(0, 7) && bucket(r) !== 'draft')) /
        100,
    ),
  }));
  const slices = (['paid', 'outstanding', 'overdue', 'credited'] as const)
    .map((b) => ({
      key: b,
      label: INVOICE_BUCKETS[b].label,
      value: Math.round(by(b) / 100),
      color: INVOICE_BUCKETS[b].color,
    }))
    .filter((s) => s.value > 0);

  const listFor = (t: Tab): InvoiceListRow[] => {
    switch (t) {
      case 'drafts':
        return inPeriod.filter((r) => bucket(r) === 'draft');
      case 'outstanding':
        return all.filter(
          (r) => bucket(r) === 'outstanding' && issuedIn(r, period.from, period.to),
        );
      case 'paid':
        return inPeriod.filter((r) => bucket(r) === 'paid');
      case 'overdue':
        return overdueAll;
      default:
        return inPeriod;
    }
  };

  const href = (key: Tab) =>
    hrefWith('/finance/invoices', {
      tab: key === 'overview' ? null : key,
      ...(pq ? { from: period.from, to: period.to } : {}),
    });

  return (
    <ConsoleShell staff={staff}>
      <PageHeader
        icon={FileText}
        title="Invoices"
        subtitle="Track invoices and statements for merchants, hosts and hotels, and the tax invoices sent to KRA."
        actions={<RangeControl from={period.from} to={period.to} />}
      />

      <main className="space-y-5 px-3 py-5 sm:px-6 sm:py-6">
        <ViewTabs
          active={tab}
          tabs={TABS.map((x) => ({
            key: x.key,
            label: x.label,
            icon: x.icon,
            href: href(x.key),
            alert: x.key === 'overdue' ? overdueAll.length || null : null,
          }))}
        />

        {failed && (
          <p
            role="alert"
            className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
          >
            Invoices could not be loaded in full: {failed}
          </p>
        )}

        {tab === 'overview' && (
          <>
            <StatGrid>
              <Stat
                icon={Wallet}
                value={kes(total)}
                label="Total invoiced"
                delta={delta == null ? null : { value: delta }}
                note={delta == null ? 'Issued in this period' : undefined}
              />
              <Stat
                icon={CheckCircle2}
                tone="green"
                value={kes(by('paid'))}
                label="Paid invoices"
                note={pct(by('paid'))}
                noteTone="good"
                href={href('paid')}
              />
              <Stat
                icon={Clock3}
                tone="amber"
                value={kes(by('outstanding'))}
                label="Outstanding"
                note={pct(by('outstanding'))}
                noteTone="muted"
                href={href('outstanding')}
              />
              <Stat
                icon={AlertTriangle}
                tone="red"
                value={kes(sum(overdueAll))}
                label="Overdue"
                note={`${overdueAll.length.toLocaleString('en-KE')} unpaid past due, any period`}
                noteTone={overdueAll.length ? 'bad' : 'muted'}
                href={href('overdue')}
              />
              <Stat
                icon={Files}
                value={issued.length.toLocaleString('en-KE')}
                label="Total invoices"
                note={
                  inPeriod.length > issued.length
                    ? `${inPeriod.length - issued.length} drafts besides`
                    : undefined
                }
                href={href('all')}
              />
            </StatGrid>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <Sheet>
                <PanelHead title="Invoice value trend" aside="last six months" />
                <div className="mt-4">
                  {trend.some((t) => t.invoiced > 0) ? (
                    <TrendArea
                      data={trend}
                      unit="kes"
                      step="month"
                      series={[
                        { key: 'invoiced', label: 'Invoiced', color: '#F5B800', fill: true },
                      ]}
                    />
                  ) : (
                    <p className="text-muted-light py-12 text-center text-sm">
                      Nothing invoiced in the last six months.
                    </p>
                  )}
                </div>
              </Sheet>
              <Sheet>
                <PanelHead title="Invoices by status" aside={formatRange(period)} />
                <div className="mt-4">
                  {slices.length ? (
                    <ShareDonut unit="kes" centre={kesShort(total)} caption="Total" data={slices} />
                  ) : (
                    <p className="text-muted-light py-12 text-center text-sm">
                      Nothing issued in this period.
                    </p>
                  )}
                </div>
              </Sheet>
            </div>

            <Sheet>
              <InvoicesTable rows={inPeriod} today={today} />
            </Sheet>
          </>
        )}

        {['all', 'drafts', 'outstanding', 'paid', 'overdue'].includes(tab) && (
          <Sheet>
            <InvoicesTable
              rows={listFor(tab)}
              today={today}
              title={TABS.find((t) => t.key === tab)!.label}
              emptyTitle={
                tab === 'overdue'
                  ? 'Nothing is overdue'
                  : tab === 'drafts'
                    ? 'No drafts in this period'
                    : `No ${TABS.find((t) => t.key === tab)!.label.toLowerCase()} in this period`
              }
            />
          </Sheet>
        )}

        {tab === 'tax' && (
          <Sheet>
            <TaxDocsTable
              rows={((taxRes.data ?? []) as unknown as TaxDoc[]).map(numeric)}
              title="Tax invoices"
              noun="tax invoice"
            />
          </Sheet>
        )}
        {tab === 'credit' && (
          <Sheet>
            <TaxDocsTable
              rows={((taxRes.data ?? []) as unknown as TaxDoc[]).map(numeric)}
              title="Credit notes"
              noun="credit note"
            />
          </Sheet>
        )}
      </main>
    </ConsoleShell>
  );
}

function numeric(d: TaxDoc): TaxDoc {
  return {
    ...d,
    net_cents: Number(d.net_cents),
    vat_cents: Number(d.vat_cents),
    gross_cents: Number(d.gross_cents),
  };
}
