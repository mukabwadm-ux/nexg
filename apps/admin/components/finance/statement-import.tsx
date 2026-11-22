'use client';

import { Button, cn, EmptyState, useToast } from '@nexg/ui';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Lock,
  Plus,
  Receipt,
  Search,
  SearchX,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import {
  closeStatement,
  findStatementRecords,
  importStatement,
  resolveStatementItem,
  statementFileLink,
  voidStatement,
  type FoundRecord,
} from '@/app/finance/reconciliation/actions';
import {
  ConfirmAction,
  ExportButton,
  FieldRow,
  FilterSelect,
  FormPanel,
  SearchBox,
  SelectField,
  TextArea,
  TextField,
  useRunner,
  useShowMore,
} from '@/components/portal/client-kit';
import { PanelHead, Pill, Sheet, Stat, StatGrid } from '@/components/portal/kit';
import { dateTime, day, kes, shillings, todayInNairobi, type Tone } from '@/lib/portal';
import {
  BANK_FIELDS,
  decodeStatement,
  describeRowErrors,
  detectStatementFormat,
  readStatement,
  STATEMENT_BUCKET,
  STATEMENT_MAX_BYTES,
  STATEMENT_MIME_TYPES,
  STATEMENT_SOURCES,
  summariseStatement,
  type BankColumnMap,
  type LineKind,
  type StatementSource,
} from '@/lib/statement-csv';
import { createClient } from '@/lib/supabase/client';

/* ──────────────────────────────────────────────────────────── vocabulary */

export interface StatementImportRow {
  id: string;
  number: string;
  source: StatementSource;
  account_label: string;
  period_from: string;
  period_to: string;
  file_name: string;
  format: string;
  line_count: number;
  paid_in_cents: number;
  withdrawn_cents: number;
  opening_balance_cents: number | null;
  closing_balance_cents: number | null;
  status: 'open' | 'closed' | 'void';
  note: string | null;
  created_at: string;
  matched_at: string | null;
  closed_at: string | null;
  created_by_name: string | null;
  counts: Record<string, number>;
  open_count: number;
  unmatched_cents: number;
  matched_lines: number;
  countable_lines: number;
}

export interface StatementItem {
  match_id: string;
  line_id: string | null;
  line_no: number | null;
  receipt: string | null;
  completed_at: string | null;
  details: string | null;
  other_party: string | null;
  account_ref: string | null;
  reason_type: string | null;
  status_text: string | null;
  kind: LineKind | null;
  direction: 'in' | 'out';
  amount_cents: number | null;
  balance_cents: number | null;
  linked_receipt: string | null;
  result: string;
  rule: string | null;
  record_type: string | null;
  record_id: string | null;
  record_reference: string | null;
  record_label: string | null;
  record_amount_cents: number | null;
  record_state: string | null;
  record_at: string | null;
  expected_ledger: boolean | null;
  ledger_found: boolean | null;
  difference_cents: number | null;
  note: string | null;
  decided_at: string | null;
  decided_by_name: string | null;
}

export interface StatementDetailData {
  import: Omit<
    StatementImportRow,
    'counts' | 'open_count' | 'unmatched_cents' | 'matched_lines' | 'countable_lines'
  > & {
    file_path: string;
    file_sha256: string;
    closed_by_name: string | null;
  };
  totals: Record<string, { n: number; cents: number }>;
  items: StatementItem[];
}

const RESULTS: Record<string, { label: string; tone: Tone }> = {
  matched: { label: 'Matched', tone: 'green' },
  suggested: { label: 'Suggested', tone: 'blue' },
  amount_differs: { label: 'Amount Differs', tone: 'red' },
  state_differs: { label: 'State Differs', tone: 'amber' },
  not_in_nexg: { label: 'Not in NexG', tone: 'red' },
  not_on_statement: { label: 'Not on Statement', tone: 'red' },
  duplicate: { label: 'Duplicate', tone: 'amber' },
  charge: { label: 'Charge', tone: 'grey' },
  ignored: { label: 'Ignored', tone: 'grey' },
  explained: { label: 'Explained', tone: 'purple' },
};

const OPEN_RESULTS = new Set([
  'suggested',
  'amount_differs',
  'state_differs',
  'not_in_nexg',
  'not_on_statement',
  'duplicate',
]);

const RULES: Record<string, string> = {
  receipt: 'By Receipt',
  paybill_event: 'By Paybill Message',
  account_amount_time: 'By Order Number, Amount and Time',
  amount_phone_time: 'By Amount, Time and Phone',
  manual: 'By Hand',
};

const RECORD_TYPES: Record<string, string> = {
  payment: 'Payment',
  payment_prompt: 'Double Payment',
  paybill_event: 'Paybill Message',
  cash_deposit: 'Rider Deposit',
  rider_kit: 'Rider Kit',
  plan: 'Experience',
  mpesa_payout: 'M-PESA Payout',
  refund: 'Refund',
  settlement_line: 'Settlement Payout',
  office_expense: 'Office Expense',
};

const KINDS: Record<LineKind, string> = {
  collection: 'Collection',
  payout: 'Payout',
  charge: 'Charge',
  transfer: 'Transfer',
  reversal: 'Reversal',
  failed: 'Not Completed',
  other: 'Other',
};

const IMPORT_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: 'Open', tone: 'amber' },
  closed: { label: 'Closed', tone: 'green' },
  void: { label: 'Void', tone: 'grey' },
};

const humanise = (s: string | null | undefined) => (s ?? '').replace(/_/g, ' ');
const plain = (cents: number | null | undefined) => (cents == null ? '' : (cents / 100).toFixed(2));

function percent(part: number, whole: number): string {
  if (whole <= 0) return '—';
  return `${((part / whole) * 100).toLocaleString('en-KE', { maximumFractionDigits: 1 })}%`;
}

function Ledger({ item }: { item: StatementItem }) {
  if (item.expected_ledger === true)
    return item.ledger_found ? (
      <Pill tone="green">Posted</Pill>
    ) : (
      <Pill tone="red" dot>
        Not Posted
      </Pill>
    );
  if (item.expected_ledger === false) return <Pill tone="grey">Not Posted by Design</Pill>;
  return <span className="text-muted-light">—</span>;
}

/* ─────────────────────────────────────────────────────── New Reconciliation */

/** The header button: upload a statement for a period and match it. */
export function NewReconciliation({ from, to }: { from: string; to: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant="gold"
        leadingIcon={<Plus className="h-4 w-4" />}
        onClick={() => setOpen(true)}
      >
        New Reconciliation
      </Button>
      {open && <ImportPanel from={from} to={to} onClose={() => setOpen(false)} />}
    </>
  );
}

interface ChosenFile {
  file: File;
  text: string;
  sha256: string;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function ImportPanel({ from, to, onClose }: { from: string; to: string; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { toast } = useToast();
  const today = todayInNairobi();
  const [source, setSource] = React.useState<StatementSource>('mpesa_paybill');
  const [label, setLabel] = React.useState(STATEMENT_SOURCES.mpesa_paybill.account);
  const [labelTyped, setLabelTyped] = React.useState(false);
  const [period, setPeriod] = React.useState({ from, to });
  const [chosen, setChosen] = React.useState<ChosenFile | null>(null);
  const [columns, setColumns] = React.useState<BankColumnMap | null>(null);
  const [already, setAlready] = React.useState<string | null>(null);
  const [reading, setReading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const format = STATEMENT_SOURCES[source].format;

  const parsed = React.useMemo(
    () =>
      chosen
        ? readStatement(chosen.text, { format, columns: format === 'bank' ? columns : null })
        : null,
    [chosen, format, columns],
  );
  const summary = React.useMemo(
    () => (parsed ? summariseStatement(parsed.lines, period) : null),
    [parsed, period],
  );
  const looksLike = React.useMemo(
    () => (chosen ? detectStatementFormat(chosen.text) : null),
    [chosen],
  );

  /* The columns a bank file's header names, kept so they can be changed. */
  React.useEffect(() => {
    if (format === 'bank' && !columns && parsed?.columns) setColumns(parsed.columns);
  }, [format, columns, parsed]);

  /* The same file already imported for this source? */
  React.useEffect(() => {
    setAlready(null);
    if (!chosen) return;
    let live = true;
    void createClient()
      .from('fin_statement_import')
      .select('number')
      .eq('source', source)
      .eq('file_sha256', chosen.sha256)
      .neq('status', 'void')
      .limit(1)
      .then(({ data }) => {
        if (live) setAlready(data?.[0]?.number ?? null);
      });
    return () => {
      live = false;
    };
  }, [chosen, source]);

  const pickSource = (next: StatementSource) => {
    setSource(next);
    if (!labelTyped) setLabel(STATEMENT_SOURCES[next].account);
  };

  const choose = async (file: File) => {
    if (file.size > STATEMENT_MAX_BYTES) {
      toast({
        tone: 'warning',
        title: 'Keep the statement under 20 MB',
        description: 'Split it by date and import each part.',
      });
      return;
    }
    if (!/\.(csv|txt)$/i.test(file.name) && !STATEMENT_MIME_TYPES.includes(file.type)) {
      toast({
        tone: 'warning',
        title: 'Choose the CSV export',
        description: 'An Excel workbook (.xlsx) cannot be read: save the statement as CSV first.',
      });
      return;
    }
    setReading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setColumns(null);
      setChosen({ file, text: decodeStatement(bytes), sha256: await sha256Hex(bytes) });
    } catch {
      toast({ tone: 'danger', title: 'The file could not be read' });
    } finally {
      setReading(false);
    }
  };

  const submit = async (): Promise<boolean> => {
    if (!chosen || !parsed) {
      toast({ tone: 'warning', title: 'Choose the statement file' });
      return false;
    }
    if (parsed.errors.length) {
      toast({
        tone: 'warning',
        title: 'The file cannot be imported yet',
        description: describeRowErrors(parsed.errors),
      });
      return false;
    }
    if (already) {
      toast({ tone: 'warning', title: `This file was already imported as ${already}` });
      return false;
    }
    if (!period.from || !period.to || period.to < period.from) {
      toast({ tone: 'warning', title: 'Choose the period: a first day and a last day after it' });
      return false;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        toast({ tone: 'danger', title: 'Sign in again to upload the statement' });
        return false;
      }
      const name =
        chosen.file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-100) || 'statement.csv';
      const path = `${session.user.id}/${crypto.randomUUID()}/${name}`;
      const type = STATEMENT_MIME_TYPES.includes(chosen.file.type) ? chosen.file.type : 'text/csv';
      const { error } = await supabase.storage
        .from(STATEMENT_BUCKET)
        .upload(path, chosen.file, { contentType: type, upsert: false });
      if (error) {
        toast({ tone: 'danger', title: 'The file was not uploaded', description: error.message });
        return false;
      }
      const result = await importStatement({
        source,
        accountLabel: label,
        periodFrom: period.from,
        periodTo: period.to,
        path,
        fileName: chosen.file.name.slice(0, 200),
        columns: format === 'bank' ? columns : null,
      });
      if (!result.ok || !result.id) {
        toast({ tone: 'danger', title: 'Not imported', description: result.message });
        return false;
      }
      toast({ tone: 'success', title: result.message ?? 'Imported' });
      const next = new URLSearchParams(params.toString());
      next.set('tab', 'provider');
      next.set('import', result.id);
      router.push(`${pathname}?${next.toString()}`);
      return true;
    } catch {
      toast({
        tone: 'danger',
        title: 'Not imported',
        description: 'The console could not reach the server. Check the connection and try again.',
      });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const kinds = summary
    ? (Object.entries(summary.kinds) as [LineKind, number][])
        .map(([k, n]) => `${n.toLocaleString('en-KE')} ${KINDS[k].toLowerCase()}`)
        .join(' · ')
    : '';

  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title="New Reconciliation"
      subtitle="Upload an M-PESA or bank statement (CSV). Every line is matched against NexG’s records; what does not match is listed to resolve."
      submitLabel="Import and Match"
      busy={busy || reading}
      width="lg"
      onSubmit={submit}
    >
      <FieldRow>
        <SelectField
          label="Statement From"
          required
          value={source}
          onChange={(e) => pickSource(e.target.value as StatementSource)}
          options={Object.entries(STATEMENT_SOURCES).map(([k, v]) => ({
            value: k,
            label: v.label,
          }))}
          hint={STATEMENT_SOURCES[source].hint}
        />
        <TextField
          label="Account"
          required
          value={label}
          maxLength={120}
          onChange={(e) => {
            setLabel(e.target.value);
            setLabelTyped(true);
          }}
          placeholder="Paybill 600100 · Utility Account"
        />
      </FieldRow>
      <FieldRow>
        <TextField
          label="Period From"
          type="date"
          required
          max={today}
          value={period.from}
          onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))}
        />
        <TextField
          label="Period To"
          type="date"
          required
          min={period.from}
          max={today}
          value={period.to}
          onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))}
        />
      </FieldRow>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          loading={reading}
          leadingIcon={<FileSpreadsheet className="h-4 w-4" />}
          onClick={() => input.current?.click()}
        >
          {chosen ? 'Choose Another File' : 'Choose Statement (CSV)'}
        </Button>
        <span className="text-muted-light min-w-0 truncate text-xs">
          {chosen
            ? `${chosen.file.name} · ${(chosen.file.size / 1024).toLocaleString('en-KE', {
                maximumFractionDigits: 0,
              })} KB`
            : 'The CSV export from the M-PESA Org Portal or your bank, up to 20 MB'}
        </span>
        <input
          ref={input}
          type="file"
          accept=".csv,.txt,text/csv,text/plain,application/vnd.ms-excel"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void choose(file);
            e.target.value = '';
          }}
        />
      </div>

      {parsed && (
        <div className="space-y-3">
          {looksLike && looksLike !== format && (
            <p className="rounded-xl bg-[#FFF1D1] px-4 py-3 text-sm font-semibold text-[#8A5A00]">
              This file looks like {looksLike === 'mpesa' ? 'an M-PESA' : 'a bank'} statement.{' '}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => pickSource(looksLike === 'mpesa' ? 'mpesa_paybill' : 'bank')}
              >
                Read it as {looksLike === 'mpesa' ? 'M-PESA Paybill' : 'a bank statement'}
              </button>
            </p>
          )}
          {already && (
            <p
              role="alert"
              className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
            >
              This file was already imported as {already}. Void that import first to import it
              again.
            </p>
          )}
          {parsed.errors.length > 0 && (
            <div role="alert" className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm">
              <p className="font-bold">The file cannot be imported yet</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {parsed.errors.slice(0, 6).map((e) => (
                  <li key={`${e.row}-${e.message}`}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
              {parsed.errors.length > 6 && (
                <p className="mt-1 font-semibold">And {parsed.errors.length - 6} more.</p>
              )}
            </div>
          )}

          {format === 'bank' && parsed.header.length > 0 && (
            <fieldset className="border-border rounded-2xl border p-4">
              <legend className="px-1 text-sm font-bold">Bank Columns</legend>
              <p className="text-muted-light mb-3 text-xs">
                Worked out from the header on row {parsed.headerRow}. Change any that are wrong.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {BANK_FIELDS.map((f) => {
                  const current = (columns ?? parsed.columns)?.[f.key] ?? null;
                  return (
                    <SelectField
                      key={f.key}
                      label={f.label}
                      required={f.required}
                      value={current == null ? '' : String(current)}
                      placeholder="Not in the file"
                      onChange={(e) => {
                        const base = columns ?? parsed.columns;
                        if (!base) return;
                        setColumns({
                          ...base,
                          [f.key]: e.target.value === '' ? null : Number(e.target.value),
                        });
                      }}
                      options={parsed.header.map((h, i) => ({
                        value: String(i),
                        label: h.trim() || `Column ${i + 1}`,
                      }))}
                    />
                  );
                })}
              </div>
            </fieldset>
          )}

          {summary && summary.lines > 0 && (
            <dl className="divide-border border-border divide-y rounded-2xl border text-sm">
              {(
                [
                  [
                    'Lines',
                    `${summary.lines.toLocaleString('en-KE')}${kinds ? ` · ${kinds}` : ''}`,
                  ],
                  ['Paid In', kes(summary.paidInCents)],
                  ['Withdrawn', kes(summary.withdrawnCents)],
                  ['Opening Balance', kes(summary.openingCents)],
                  ['Closing Balance', kes(summary.closingCents)],
                  [
                    'Dates in the File',
                    summary.firstDay ? `${day(summary.firstDay)} – ${day(summary.lastDay)}` : '—',
                  ],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-muted shrink-0 font-semibold">{k}</dt>
                  <dd className="min-w-0 text-right font-bold tabular-nums">{v}</dd>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <dt className="text-muted font-semibold">Outside the Period</dt>
                <dd
                  className={cn(
                    'flex flex-wrap items-center justify-end gap-2 font-bold tabular-nums',
                    summary.outsidePeriod > 0 && 'text-[#8A5A00]',
                  )}
                >
                  {summary.outsidePeriod.toLocaleString('en-KE')} line
                  {summary.outsidePeriod === 1 ? '' : 's'}
                  {summary.outsidePeriod > 0 && summary.firstDay && summary.lastDay && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setPeriod({
                          from: summary.firstDay!,
                          to: summary.lastDay! > today ? today : summary.lastDay!,
                        })
                      }
                    >
                      Use the File’s Dates
                    </Button>
                  )}
                </dd>
              </div>
            </dl>
          )}
        </div>
      )}
    </FormPanel>
  );
}

/* ──────────────────────────────────────────────────────────── the list */

/** Every import overlapping the period, and every open one. */
export function StatementImports({
  rows,
  error,
  listHref,
}: {
  rows: StatementImportRow[];
  error: string | null;
  /** This tab's own address (period included); an import adds &import=. */
  listHref: string;
}) {
  const hrefFor = (id: string) =>
    `${listHref}${listHref.includes('?') ? '&' : '?'}import=${encodeURIComponent(id)}`;
  const [status, setStatus] = React.useState('all');
  const shown = rows.filter((r) => status === 'all' || r.status === status);
  const { shown: page, more } = useShowMore(shown, 25);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PanelHead title="Statement Imports" aside="M-PESA and bank statements matched line by line">
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'All Statuses' },
            ...Object.entries(IMPORT_STATUS).map(([k, v]) => ({ value: k, label: v.label })),
          ]}
        />
      </PanelHead>
      {error ? (
        <EmptyState
          tone="error"
          icon={<AlertTriangle className="h-5 w-5" />}
          title="Statement imports could not be loaded"
          description={error}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<FileSpreadsheet className="h-5 w-5" />}
          title={
            rows.length ? 'Nothing with this status' : 'No statements imported for this period'
          }
          description="Use New Reconciliation to upload an M-PESA organisation statement or a bank statement (CSV). Every line is matched against NexG’s records, and what does not match is listed to resolve."
        />
      ) : (
        <>
          <div className="border-border overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-[60rem] text-left text-sm">
              <caption className="sr-only">Statement imports</caption>
              <thead className="bg-bg text-muted text-xs font-bold">
                <tr>
                  <th scope="col" className="px-4 py-2.5">
                    Number
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    Source
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    Period
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right">
                    Lines
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right">
                    % Matched
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right">
                    Unmatched (KES)
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    Imported
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y tabular-nums">
                {page.map((r) => {
                  const st = IMPORT_STATUS[r.status] ?? { label: r.status, tone: 'grey' as const };
                  return (
                    <tr key={r.id} className="hover:bg-bg/60">
                      <td className="px-4 py-2.5">
                        <Link
                          href={hrefFor(r.id)}
                          className="hover:text-gold-text font-bold underline-offset-2 hover:underline"
                        >
                          {r.number}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="block font-semibold">
                          {STATEMENT_SOURCES[r.source]?.label ?? r.source}
                        </span>
                        <span className="text-muted-light block max-w-[14rem] truncate text-xs">
                          {r.account_label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {day(r.period_from)} – {day(r.period_to)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {Number(r.line_count).toLocaleString('en-KE')}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {percent(Number(r.matched_lines), Number(r.countable_lines))}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-2.5 text-right',
                          Number(r.unmatched_cents) > 0 && 'text-danger font-bold',
                        )}
                      >
                        {shillings(Number(r.unmatched_cents))}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Pill tone={st.tone} dot>
                            {st.label}
                          </Pill>
                          {r.status === 'open' && Number(r.open_count) > 0 && (
                            <Pill tone="red">
                              {Number(r.open_count).toLocaleString('en-KE')} Open
                            </Pill>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="block whitespace-nowrap">{dateTime(r.created_at)}</span>
                        <span className="text-muted-light block text-xs">
                          {r.created_by_name ?? '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {more}
        </>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── one import */

type Panel = { kind: 'match' | 'explain'; item: StatementItem };

/** One import: what it adds up to, every line with what it matched, and the actions. */
export function StatementDetail({
  data,
  canWrite,
  listHref,
}: {
  data: StatementDetailData;
  canWrite: boolean;
  listHref: string;
}) {
  const imp = data.import;
  const items = data.items;
  const mpesa = imp.format === 'mpesa';
  const live = canWrite && imp.status === 'open';
  const openItems = items.filter((i) => !i.decided_at && OPEN_RESULTS.has(i.result));
  const [filter, setFilter] = React.useState(openItems.length ? 'open' : 'all');
  const [q, setQ] = React.useState('');
  const [panel, setPanel] = React.useState<Panel | null>(null);
  const { run, busy } = useRunner();
  const { toast } = useToast();

  const term = q.trim().toLowerCase();
  const shown = items.filter(
    (i) =>
      (filter === 'all' ||
        (filter === 'open' ? !i.decided_at && OPEN_RESULTS.has(i.result) : i.result === filter)) &&
      (!term ||
        `${i.receipt ?? ''} ${i.details ?? ''} ${i.other_party ?? ''} ${i.record_reference ?? ''} ${
          i.record_label ?? ''
        } ${i.account_ref ?? ''} ${i.note ?? ''}`
          .toLowerCase()
          .includes(term)),
  );
  const { shown: page, more } = useShowMore(shown, 50);

  const total = (r: string) => data.totals[r] ?? { n: 0, cents: 0 };
  const lineItems = items.filter((i) => i.line_id);
  const countable = lineItems.filter((i) => !['charge', 'ignored'].includes(i.result)).length;
  const matched = lineItems.filter((i) => i.result === 'matched').length;
  const st = IMPORT_STATUS[imp.status] ?? { label: imp.status, tone: 'grey' as const };
  const source = STATEMENT_SOURCES[imp.source];

  const openFile = async () => {
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    const r = await statementFileLink(imp.file_path);
    if (!r.ok || !r.url) {
      tab?.close();
      toast({ tone: 'danger', title: 'Could not open the file', description: r.message });
      return;
    }
    if (tab) tab.location.href = r.url;
    else window.location.assign(r.url);
  };

  const exportRows = () => [
    [
      'Row',
      'Receipt',
      'Completed',
      'Details',
      'Other Party',
      'In/Out',
      'Amount (KES)',
      'NexG Record',
      'NexG Reference',
      'NexG Amount (KES)',
      'NexG State',
      'Ledger',
      'Difference (KES)',
      'Status',
      'How',
      'Note',
      'Decided By',
      'Decided At',
    ],
    ...shown.map((i) => [
      i.line_no ?? '',
      i.receipt ?? '',
      i.completed_at ?? '',
      i.details ?? '',
      i.other_party ?? '',
      i.direction === 'in' ? 'In' : 'Out',
      plain(i.amount_cents),
      i.record_label ?? '',
      i.record_reference ?? '',
      plain(i.record_amount_cents),
      humanise(i.record_state),
      i.expected_ledger === true
        ? i.ledger_found
          ? 'Posted'
          : 'Not Posted'
        : i.expected_ledger === false
          ? 'Not Posted by Design'
          : '',
      plain(i.difference_cents || null),
      RESULTS[i.result]?.label ?? i.result,
      i.rule ? (RULES[i.rule] ?? i.rule) : '',
      i.note ?? '',
      i.decided_by_name ?? '',
      i.decided_at ?? '',
    ]),
  ];

  return (
    <div className="space-y-5">
      <Sheet>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              href={listHref}
              className="text-muted hover:text-ink inline-flex items-center gap-1.5 text-xs font-bold"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              All Statement Imports
            </Link>
            <h2 className="mt-2 flex flex-wrap items-center gap-2 text-[1.25rem] font-extrabold tracking-[-0.01em]">
              {imp.number}
              <Pill tone={st.tone} dot>
                {st.label}
              </Pill>
            </h2>
            <p className="text-muted mt-1 text-sm">
              {source?.label ?? imp.source} · {imp.account_label} · {day(imp.period_from)} –{' '}
              {day(imp.period_to)}
            </p>
            <p className="text-muted-light mt-0.5 text-xs">
              {imp.file_name} · imported {dateTime(imp.created_at)}
              {imp.created_by_name ? ` by ${imp.created_by_name}` : ''}
              {imp.matched_at ? ` · matched ${dateTime(imp.matched_at)}` : ''}
              {imp.closed_at
                ? ` · ${imp.status === 'void' ? 'voided' : 'closed'} ${dateTime(imp.closed_at)}${
                    imp.closed_by_name ? ` by ${imp.closed_by_name}` : ''
                  }`
                : ''}
            </p>
            {imp.status === 'void' && imp.note && (
              <p className="bg-bg mt-2 rounded-xl px-3 py-2 text-sm">Voided: “{imp.note}”</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              leadingIcon={<Download className="h-4 w-4" />}
              onClick={() => void openFile()}
            >
              Download File
            </Button>
            {live && (
              <ConfirmAction
                trigger={
                  <Button
                    size="sm"
                    variant="black"
                    leadingIcon={<Lock className="h-4 w-4" />}
                    disabled={openItems.length > 0 || busy}
                    title={
                      openItems.length
                        ? `${openItems.length} item${openItems.length === 1 ? '' : 's'} still open`
                        : undefined
                    }
                  >
                    Close Reconciliation
                  </Button>
                }
                tone="black"
                title={`Close ${imp.number}?`}
                body="Every line is matched, explained or moves no money of NexG’s own. Closing makes the reconciliation final."
                confirmLabel="Close Reconciliation"
                onConfirm={() => run(() => closeStatement(imp.id))}
              />
            )}
            {canWrite && imp.status !== 'void' && (
              <ConfirmAction
                trigger={
                  <Button
                    size="sm"
                    variant="outline"
                    leadingIcon={<Ban className="h-4 w-4" />}
                    disabled={busy}
                  >
                    Void
                  </Button>
                }
                title={`Void ${imp.number}?`}
                body="For the wrong file, source or period. It stays on record as void, and the same file can then be imported again."
                confirmLabel="Void Import"
                reason={{ label: 'Why', required: true, placeholder: 'Wrong Paybill account' }}
                onConfirm={(reason) => run(() => voidStatement(imp.id, reason))}
              />
            )}
          </div>
        </div>
      </Sheet>

      <StatGrid dense>
        <Stat icon={Wallet} value={kes(imp.paid_in_cents)} label="Paid In" />
        <Stat icon={Receipt} value={kes(imp.withdrawn_cents)} label="Withdrawn" />
        <Stat
          icon={CheckCircle2}
          tone="green"
          value={matched.toLocaleString('en-KE')}
          label="Matched"
          note={`${percent(matched, countable)} of ${countable.toLocaleString('en-KE')} lines`}
          noteTone="good"
        />
        <Stat
          icon={AlertTriangle}
          tone={total('not_in_nexg').n ? 'red' : 'gold'}
          value={total('not_in_nexg').n.toLocaleString('en-KE')}
          label="Not in NexG"
          note={kes(total('not_in_nexg').cents)}
          noteTone={total('not_in_nexg').n ? 'bad' : 'muted'}
        />
        <Stat
          icon={SearchX}
          tone={total('not_on_statement').n ? 'red' : 'gold'}
          value={total('not_on_statement').n.toLocaleString('en-KE')}
          label="Not on Statement"
          note={kes(total('not_on_statement').cents)}
          noteTone={total('not_on_statement').n ? 'bad' : 'muted'}
        />
        <Stat
          icon={FileSpreadsheet}
          value={kes(total('charge').cents)}
          label="Charges"
          note={`${total('charge').n.toLocaleString('en-KE')} lines, not posted by design`}
        />
      </StatGrid>

      <Sheet>
        <div className="flex min-w-0 flex-col gap-4">
          <PanelHead
            title="Statement Lines"
            aside={`${openItems.length.toLocaleString('en-KE')} open · ${items.length.toLocaleString('en-KE')} items`}
          >
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder="Search receipts, details, references…"
              label="Search statement lines"
              className="w-full sm:w-64"
            />
            <FilterSelect
              label="Result"
              value={filter}
              onChange={setFilter}
              className="flex-1 sm:flex-none"
              options={[
                { value: 'open', label: 'Open Items' },
                { value: 'all', label: 'All Results' },
                ...Object.entries(RESULTS).map(([k, v]) => ({ value: k, label: v.label })),
              ]}
            />
            <ExportButton
              filename={`nexg-${imp.number.toLowerCase()}-lines.csv`}
              rows={exportRows}
              label="Export CSV"
            />
          </PanelHead>

          {shown.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-5 w-5" />}
              title={filter === 'open' && !term ? 'Nothing left open' : 'Nothing matches'}
              description={
                filter === 'open' && !term
                  ? 'Every line is matched, explained or moves no money of NexG’s own.'
                  : 'Try another search or result.'
              }
            />
          ) : (
            <>
              <div className="border-border overflow-x-auto rounded-2xl border">
                <table className="w-full min-w-[78rem] text-left text-sm">
                  <caption className="sr-only">
                    Statement lines and the NexG records they match
                  </caption>
                  <thead className="bg-bg text-muted text-xs font-bold">
                    <tr>
                      <th scope="col" className="px-3 py-2.5">
                        Receipt
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Completed
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Details
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Other Party
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        In/Out
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right">
                        Amount (KES)
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        NexG Record
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Ledger
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right">
                        Difference (KES)
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Status
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y align-top tabular-nums">
                    {page.map((i) => (
                      <Row
                        key={i.match_id}
                        item={i}
                        mpesa={mpesa}
                        live={live && !i.decided_at}
                        busy={busy}
                        onMatch={() => setPanel({ kind: 'match', item: i })}
                        onExplain={() => setPanel({ kind: 'explain', item: i })}
                        onConfirm={() =>
                          void run(() =>
                            resolveStatementItem({ matchId: i.match_id, action: 'confirm' }),
                          )
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {more}
            </>
          )}
        </div>
      </Sheet>

      {panel?.kind === 'match' && (
        <MatchPanel item={panel.item} mpesa={mpesa} onClose={() => setPanel(null)} />
      )}
      {panel?.kind === 'explain' && (
        <ExplainPanel item={panel.item} mpesa={mpesa} onClose={() => setPanel(null)} />
      )}
    </div>
  );
}

function Row({
  item: i,
  mpesa,
  live,
  busy,
  onMatch,
  onExplain,
  onConfirm,
}: {
  item: StatementItem;
  mpesa: boolean;
  live: boolean;
  busy: boolean;
  onMatch: () => void;
  onExplain: () => void;
  onConfirm: () => void;
}) {
  const result = RESULTS[i.result] ?? { label: i.result, tone: 'grey' as const };
  const missing = !i.line_id;
  const when = missing ? i.record_at : i.completed_at;
  const canMatch =
    live &&
    !missing &&
    ['not_in_nexg', 'duplicate', 'amount_differs', 'state_differs', 'suggested'].includes(i.result);
  const canExplain = live && OPEN_RESULTS.has(i.result);
  return (
    <tr className={cn(missing && 'bg-[#FFFCFB]')}>
      <td className="px-3 py-2.5">
        {missing ? (
          <span className="text-muted-light text-xs font-semibold">Not on the statement</span>
        ) : (
          <>
            <span className="block whitespace-nowrap font-mono text-[0.8125rem] font-semibold">
              {i.receipt ?? '—'}
            </span>
            <span className="text-muted-light block text-xs">Row {i.line_no}</span>
          </>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">
        {when ? (mpesa ? dateTime(when) : day(when)) : '—'}
      </td>
      <td className="px-3 py-2.5">
        <span className="line-clamp-2 block max-w-[16rem]">
          {i.details ?? (missing ? '—' : '')}
        </span>
        {(i.reason_type || i.kind) && !missing && (
          <span className="text-muted-light block max-w-[16rem] truncate text-xs">
            {[
              i.kind ? KINDS[i.kind] : null,
              i.reason_type,
              i.account_ref ? `Acc. ${i.account_ref}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className="block max-w-[11rem] truncate">{i.other_party ?? '—'}</span>
      </td>
      <td className="px-3 py-2.5">
        <Pill tone={i.direction === 'in' ? 'green' : 'grey'}>
          {i.direction === 'in' ? 'In' : 'Out'}
        </Pill>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">
        {missing ? (
          <span className="text-muted">{shillings(i.record_amount_cents)}</span>
        ) : (
          shillings(i.amount_cents)
        )}
      </td>
      <td className="px-3 py-2.5">
        {i.record_type ? (
          <>
            <span className="block max-w-[15rem] truncate font-semibold">
              {i.record_label ?? RECORD_TYPES[i.record_type] ?? i.record_type}
            </span>
            <span className="text-muted-light block max-w-[15rem] truncate text-xs">
              {RECORD_TYPES[i.record_type] ?? i.record_type}
              {i.record_reference ? ` · ${i.record_reference}` : ''}
              {i.record_state ? ` · ${humanise(i.record_state)}` : ''}
              {!missing && i.record_amount_cents != null ? ` · ${kes(i.record_amount_cents)}` : ''}
            </span>
          </>
        ) : (
          <span className="text-muted-light">—</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <Ledger item={i} />
      </td>
      <td
        className={cn(
          'whitespace-nowrap px-3 py-2.5 text-right',
          i.difference_cents ? 'text-danger font-bold' : 'text-muted-light',
        )}
      >
        {i.difference_cents ? shillings(i.difference_cents) : '—'}
      </td>
      <td className="px-3 py-2.5">
        <Pill tone={result.tone} dot>
          {result.label}
        </Pill>
        {i.rule && (
          <span className="text-muted-light mt-1 block text-xs">{RULES[i.rule] ?? i.rule}</span>
        )}
        {i.note && (
          <span className="text-muted mt-1 line-clamp-3 block max-w-[16rem] text-xs">{i.note}</span>
        )}
        {i.decided_at && (
          <span className="text-muted-light mt-1 block text-xs">
            {i.decided_by_name ?? 'Someone'} · {dateTime(i.decided_at)}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className="flex flex-col items-end gap-1.5">
          {live && i.result === 'suggested' && (
            <Button size="sm" variant="black" disabled={busy} onClick={onConfirm}>
              Confirm
            </Button>
          )}
          {canMatch && (
            <Button size="sm" variant="outline" disabled={busy} onClick={onMatch}>
              Match
            </Button>
          )}
          {canExplain && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onExplain}>
              Explain
            </Button>
          )}
        </span>
      </td>
    </tr>
  );
}

/** What the line (or the missing record) is, at the top of a panel. */
function ItemSummary({ item: i, mpesa }: { item: StatementItem; mpesa: boolean }) {
  const when = i.line_id ? i.completed_at : i.record_at;
  const rows: [string, string][] = i.line_id
    ? [
        ['Receipt', i.receipt ?? '—'],
        ['Completed', when ? (mpesa ? dateTime(when) : day(when)) : '—'],
        ['Amount', `${kes(i.amount_cents)} ${i.direction === 'in' ? 'in' : 'out'}`],
        ['Details', i.details ?? '—'],
        ['Other Party', i.other_party ?? '—'],
      ]
    : [
        ['NexG Record', i.record_label ?? '—'],
        ['Reference', i.record_reference ?? '—'],
        ['Recorded', dateTime(when)],
        ['Amount', `${kes(i.record_amount_cents)} ${i.direction === 'in' ? 'in' : 'out'}`],
      ];
  return (
    <dl className="divide-border border-border divide-y rounded-2xl border text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
          <dt className="text-muted shrink-0 font-semibold">{k}</dt>
          <dd className="min-w-0 break-words text-right font-bold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function MatchPanel({
  item,
  mpesa,
  onClose,
}: {
  item: StatementItem;
  mpesa: boolean;
  onClose: () => void;
}) {
  const [q, setQ] = React.useState('');
  const [records, setRecords] = React.useState<FoundRecord[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [picked, setPicked] = React.useState<FoundRecord | null>(null);
  const [note, setNote] = React.useState('');
  const { run, busy } = useRunner();
  const { toast } = useToast();

  React.useEffect(() => {
    let live = true;
    const timer = setTimeout(
      async () => {
        setLoading(true);
        const r = await findStatementRecords(item.match_id, q);
        if (!live) return;
        setLoading(false);
        if (r.ok) setRecords(r.records ?? []);
        else
          toast({ tone: 'danger', title: 'Records could not be searched', description: r.message });
      },
      q ? 350 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [item.match_id, q, toast]);

  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Match to a NexG Record"
      subtitle="Choose the record this statement line is, and say how you know."
      submitLabel="Match"
      busy={busy}
      width="lg"
      onSubmit={async () => {
        if (!picked) {
          toast({ tone: 'warning', title: 'Choose the NexG record' });
          return false;
        }
        return run(() =>
          resolveStatementItem({
            matchId: item.match_id,
            action: 'match',
            recordType: picked.record_type,
            recordId: picked.record_id,
            note,
          }),
        );
      }}
    >
      <ItemSummary item={item} mpesa={mpesa} />
      <div>
        <label className="border-border-strong bg-surface focus-within:ring-gold flex h-11 min-w-0 items-center gap-2 rounded-xl border px-3 focus-within:ring-2">
          <Search className="text-muted-light h-4 w-4 shrink-0" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            /* Enter searches as you type; it does not submit the match. */
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.preventDefault();
            }}
            placeholder="Order number, payment reference, receipt…"
            aria-label="Search NexG records"
            className="text-ink placeholder:text-muted-light/80 min-w-0 flex-1 bg-transparent text-base focus:outline-none md:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
        <p className="text-muted-light mt-1.5 text-xs">
          {q
            ? 'Records within 60 days of the line whose reference, receipt or description contains this.'
            : 'Records within 3 days of the line, closest amount first.'}
        </p>
      </div>
      <fieldset>
        <legend className="sr-only">NexG records</legend>
        {loading && !records ? (
          <p className="text-muted-light py-6 text-center text-sm">Looking…</p>
        ) : !records || records.length === 0 ? (
          <p className="text-muted-light py-6 text-center text-sm">
            No NexG record moving money {item.direction === 'in' ? 'in' : 'out'} fits. Search by the
            order number or reference, or explain the line instead.
          </p>
        ) : (
          <ul className="divide-border border-border max-h-[22rem] divide-y overflow-y-auto rounded-2xl border">
            {records.map((r) => {
              const on = picked?.record_id === r.record_id && picked.record_type === r.record_type;
              const same =
                r.amount_cents != null &&
                item.amount_cents != null &&
                Math.abs(r.amount_cents - item.amount_cents) < 100;
              return (
                <li key={`${r.record_type}-${r.record_id}`}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-start gap-3 px-4 py-3',
                      on ? 'bg-gold-soft' : 'hover:bg-bg',
                    )}
                  >
                    <input
                      type="radio"
                      name="record"
                      className="accent-ink mt-1"
                      checked={on}
                      onChange={() => setPicked(r)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">
                        {r.label ?? RECORD_TYPES[r.record_type] ?? r.record_type}
                      </span>
                      <span className="text-muted-light block truncate text-xs">
                        {RECORD_TYPES[r.record_type] ?? r.record_type}
                        {r.reference ? ` · ${r.reference}` : ''}
                        {r.receipt ? ` · ${r.receipt}` : ''}
                        {r.state ? ` · ${humanise(r.state)}` : ''}
                        {r.at ? ` · ${dateTime(r.at)}` : ''}
                      </span>
                      {r.matched_to_row != null && (
                        <span className="mt-0.5 block text-xs font-semibold text-[#8A5A00]">
                          Already matched to row {r.matched_to_row}
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        'whitespace-nowrap text-sm font-extrabold tabular-nums',
                        !same && 'text-muted',
                      )}
                    >
                      {kes(r.amount_cents)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>
      <TextArea
        label="Note"
        required
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={1000}
        placeholder="How you know it is the same money: the customer’s confirmation, the bank’s advice…"
      />
    </FormPanel>
  );
}

function ExplainPanel({
  item,
  mpesa,
  onClose,
}: {
  item: StatementItem;
  mpesa: boolean;
  onClose: () => void;
}) {
  const [note, setNote] = React.useState('');
  const { run, busy } = useRunner();
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Explain"
      subtitle={`${RESULTS[item.result]?.label ?? item.result}: say what this is, so the reconciliation can close.`}
      submitLabel="Explain"
      busy={busy}
      onSubmit={() =>
        run(() => resolveStatementItem({ matchId: item.match_id, action: 'explain', note }))
      }
    >
      <ItemSummary item={item} mpesa={mpesa} />
      {item.note && <p className="bg-bg rounded-xl px-4 py-3 text-sm">{item.note}</p>}
      <TextArea
        label="Explanation"
        required
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={1000}
        placeholder={
          item.line_id
            ? 'A transfer to the bank account, checked against its statement'
            : 'Paid into the till, not the Paybill'
        }
      />
    </FormPanel>
  );
}
