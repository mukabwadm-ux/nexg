import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useWorkspace } from '../workspace';
import { personalAppearance, workspaceReminders } from '../settings';
import {
  EVENTS,
  FEATURES,
  ROLES,
  THEMES,
} from '../../../apps/web/lib/host-workspace/settings-vocab';
import {
  Avatar,
  Badge,
  Button,
  Icon,
  PageHeader,
  Pager,
  Panel,
  PropertyPhoto,
  Table,
  Tabs,
} from '../ui';
import {
  dateText,
  money,
  totals,
  type Collection,
  type RecordItem,
  type Settings,
  type Stay,
  type WorkspaceData,
} from '../model';
import './management.css';

type Range = '7' | '30' | '90' | 'all';
type Dictionary = Record<string, unknown>;
type LedgerRow = {
  id: string;
  collection: Collection;
  date: string;
  title: string;
  unitId: string;
  category: string;
  amount: number;
  status: string;
};
const text = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const number = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const object = (value: unknown): Dictionary =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Dictionary) : {};
const sum = <T,>(items: T[], value: (item: T) => number) =>
  items.reduce((total, item) => total + value(item), 0);
const day = (date: string) => date.slice(0, 10);
const addDays = (date: string, amount: number) => {
  const value = new Date(date + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
};
const rangeStart = (range: Range, today: string) =>
  range === 'all' ? '1900-01-01' : addDays(today, 1 - Number(range));
const inPeriod = (date: string, range: Range, today: string) =>
  range === 'all' || (!!date && day(date) >= rangeStart(range, today) && day(date) <= today);
const recordedExpense = (status: string) => ['Recorded', 'Paid', 'Settled'].includes(status);
const receiptAmount = (payment: WorkspaceData['payments'][number]) =>
  payment.status === 'Recorded'
    ? payment.type === 'Receipt'
      ? payment.amountMinor
      : payment.type === 'Refund'
        ? -payment.amountMinor
        : 0
    : 0;
const invoiceType = (invoice: RecordItem) => text(invoice.type, text(invoice.kind, 'Invoice'));
const nexgInvoice = (invoice: RecordItem) => /nexg/i.test(invoiceType(invoice));
const tone = (status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' =>
  /recorded|paid|active|fulfilled|credited|paired|read$|completed/i.test(status) &&
  !/unread|revoked/i.test(status)
    ? 'success'
    : /failed|revoked|cancelled|erased/i.test(status)
      ? 'danger'
      : /pending|due|invited|open|unread|awaiting/i.test(status)
        ? 'warning'
        : 'neutral';
const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );

export function exportCsv(filename: string, rows: unknown[][]) {
  const content = rows
    .map((row) =>
      row
        .map((value) => {
          let cell = String(value ?? '');
          if (typeof value === 'string' && /^[=+@\-\t\r]/.test(cell)) cell = "'" + cell;
          return '"' + cell.replaceAll('"', '""') + '"';
        })
        .join(','),
    )
    .join('\r\n');
  const url = URL.createObjectURL(
    new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function printRows(title: string, headers: string[], rows: unknown[][], subtitle: string) {
  const popup = window.open('', '_blank');
  if (!popup) return false;
  popup.opener = null;
  const palette = getComputedStyle(document.documentElement);
  const printInk = palette.getPropertyValue('--ink').trim(),
    printMuted = palette.getPropertyValue('--muted').trim(),
    printPaper = palette.getPropertyValue('--paper').trim(),
    printLine = palette.getPropertyValue('--line').trim();
  popup.document.write(
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font:13px/1.5 system-ui;color:${printInk};margin:36px}h1{font-size:25px;margin-bottom:5px}p{color:${printMuted}}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{text-align:left;padding:11px;border-bottom:1px solid ${printLine}}th{background:${printPaper};font-size:11px}footer{margin-top:25px;font-size:11px;color:${printMuted}}@media print{body{margin:15mm}}</style><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table><footer>Frontend preview. These are manually recorded sample records, not bank or provider confirmations.</footer></html>`,
  );
  popup.document.close();
  popup.focus();
  popup.print();
  return true;
}
function useViewport() {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return size;
}
function Status({ value }: { value: string }) {
  return <Badge tone={tone(value)}>{value || 'Not set'}</Badge>;
}
function WorkspaceLabel() {
  return (
    <span className="mg-preview">
      <span />
      Connected workspace
    </span>
  );
}
function ResponsiveTabs({
  items,
  value,
  onChange,
  label = 'View',
  icons,
}: {
  items: string[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  icons?: Record<string, string>;
}) {
  return (
    <>
      <div className="mg-desktop-tabs">
        {icons ? (
          <div className="tabs mg-settings-tabs" role="tablist" aria-label={label}>
            {items.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={item === value}
                className={item === value ? 'active' : ''}
                onClick={() => onChange(item)}
              >
                <Icon name={icons[item]} size={20} />
                {item}
              </button>
            ))}
          </div>
        ) : (
          <Tabs items={items} value={value} onChange={onChange} />
        )}
      </div>
      <label className="mg-mobile-tabs">
        <span>{label}</span>
        <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
          {items.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
    </>
  );
}
function Period({ value, onChange }: { value: Range; onChange: (value: Range) => void }) {
  return (
    <label className="mg-period">
      <Icon name="calendar" size={17} />
      <span className="mg-sr-only">Report period</span>
      <select value={value} onChange={(event) => onChange(event.target.value as Range)}>
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
        <option value="90">Last 90 days</option>
        <option value="all">All records</option>
      </select>
    </label>
  );
}
function Stat({
  label,
  value,
  note,
  icon = 'money',
}: {
  label: string;
  value: ReactNode;
  note: string;
  icon?: string;
}) {
  return (
    <Panel className="mg-stat">
      <span className="mg-stat-label">
        <Icon name={icon} size={21} />
        {label}
      </span>
      <strong>{value}</strong>
      <small>{note}</small>
    </Panel>
  );
}
function Records<T extends { id: string }>({
  rows,
  headers,
  renderRow,
  empty = 'No records in this view.',
  pageSize = 6,
  label,
}: {
  rows: T[];
  headers: string[];
  renderRow: (row: T) => ReactNode;
  empty?: string;
  pageSize?: number;
  label: string;
}) {
  const { height } = useViewport();
  const size = Math.min(pageSize, height < 720 ? 4 : height < 850 ? 5 : 6);
  const [page, setPage] = useState(1);
  const actualPage = Math.max(1, Math.min(page, Math.ceil(rows.length / size) || 1));
  useEffect(() => setPage(1), [rows.length, size]);
  return (
    <div className="mg-records">
      <Table>
        <caption className="mg-sr-only">{label}</caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.slice((actualPage - 1) * size, actualPage * size).map(renderRow)
          ) : (
            <tr>
              <td colSpan={headers.length}>
                <div className="mg-table-empty">{empty}</div>
              </td>
            </tr>
          )}
        </tbody>
      </Table>
      <Pager page={actualPage} total={rows.length} pageSize={size} onChange={setPage} />
    </div>
  );
}
function scopedData(
  data: WorkspaceData,
  units: WorkspaceData['units'],
  stays: Stay[],
  all: boolean,
): WorkspaceData {
  const unitIds = new Set(units.map((unit) => unit.id)),
    stayIds = new Set(stays.map((stay) => stay.id));
  const belongs = (record: RecordItem) =>
    record.unitId ? unitIds.has(record.unitId) : record.stayId ? stayIds.has(record.stayId) : all;
  return {
    ...data,
    units,
    stays,
    payments: data.payments.filter((payment) => stayIds.has(payment.stayId)),
    expenses: data.expenses.filter((expense) => unitIds.has(expense.unitId)),
    invoices: data.invoices.filter(belongs),
    feedback: data.feedback.filter(belongs),
    qrCards: data.qrCards.filter((card) => unitIds.has(card.unitId)),
    articles: data.articles.filter((article) => unitIds.has(article.unitId)),
  };
}

function usePlotDimensions() {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 570, height: 195 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const width = Math.max(100, node.clientWidth),
        height = Math.max(45, node.clientHeight);
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(node);
    update();
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}
function CashChart({ rows }: { rows: LedgerRow[] }) {
  const { today } = useWorkspace();
  const { ref, width, height } = usePlotDimensions();
  const dated = rows.filter((row) => row.date),
    start = dated.reduce((first, row) => (day(row.date) < first ? day(row.date) : first), today),
    span = Math.max(4, Math.round((Date.parse(today) - Date.parse(start)) / 86400000) + 1);
  const buckets = Array.from({ length: 4 }, () => ({ income: 0, expense: 0 }));
  dated.forEach((row) => {
    const index = Math.max(
      0,
      Math.min(
        3,
        Math.floor(((Date.parse(day(row.date)) - Date.parse(start)) / 86400000 / span) * 4),
      ),
    );
    if (row.collection === 'expenses' && recordedExpense(row.status))
      buckets[index].expense += Math.abs(row.amount);
    else if (
      row.collection === 'payments' &&
      row.status === 'Recorded' &&
      ['Receipt', 'Refund'].includes(row.category)
    )
      buckets[index].income += row.amount;
  });
  const max = Math.max(100, ...buckets.flatMap((bucket) => [bucket.income, bucket.expense])),
    min = Math.min(0, ...buckets.map((bucket) => bucket.income)),
    left = 43,
    right = 12,
    top = 9,
    bottom = 25,
    plotWidth = width - left - right,
    plotHeight = Math.max(15, height - top - bottom),
    y = (value: number) => top + ((max - value) / (max - min)) * plotHeight,
    zero = y(0),
    groupWidth = plotWidth / 4,
    barWidth = Math.min(36, groupWidth * 0.3);
  return (
    <div className="mg-chart">
      <svg
        ref={ref}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={buckets
          .map(
            (bucket, index) =>
              `${dateText(addDays(start, Math.floor((index * span) / 4)))}: receipts ${money(bucket.income)}, expenses ${money(bucket.expense)}`,
          )
          .join('; ')}
      >
        {[0, 0.5, 1].map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              x2={width - right}
              y1={top + tick * plotHeight}
              y2={top + tick * plotHeight}
              stroke="var(--mg-line)"
            />
            <text x={left - 8} y={top + tick * plotHeight + 3} textAnchor="end">
              {new Intl.NumberFormat('en-KE', {
                notation: 'compact',
                maximumFractionDigits: 0,
              }).format((max - (max - min) * tick) / 100)}
            </text>
          </g>
        ))}
        {buckets.map((bucket, index) => {
          const center = left + (index + 0.5) * groupWidth;
          return (
            <g key={index}>
              <rect
                x={center - barWidth - 2}
                y={Math.min(y(bucket.income), zero)}
                width={barWidth}
                height={Math.max(1, Math.abs(zero - y(bucket.income)))}
                rx="3"
                fill={bucket.income < 0 ? 'var(--ink)' : 'var(--gold)'}
              />
              <rect
                x={center + 2}
                y={y(bucket.expense)}
                width={barWidth}
                height={Math.max(1, zero - y(bucket.expense))}
                rx="3"
                fill="var(--gold-soft)"
              />
              <text x={center} y={height - 6} textAnchor="middle">
                {dateText(addDays(start, Math.floor((index * span) / 4)))}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mg-legend">
        <span>
          <i />
          Recorded receipts, net refunds
        </span>
        <span>
          <i className="expense" />
          Recorded expenses
        </span>
      </div>
    </div>
  );
}
function ExpenseChart({ expenses }: { expenses: WorkspaceData['expenses'] }) {
  const grouped = new Map<string, number>();
  expenses
    .filter((expense) => recordedExpense(expense.status))
    .forEach((expense) =>
      grouped.set(expense.category, (grouped.get(expense.category) || 0) + expense.amountMinor),
    );
  const entries = [...grouped].sort((a, b) => b[1] - a[1]);
  const total = sum(entries, (entry) => entry[1]);
  const colours = [
    'var(--accent)',
    'var(--gold)',
    'color-mix(in srgb,var(--gold) 65%,var(--surface))',
    'var(--gold-soft)',
    'color-mix(in srgb,var(--gold-soft) 55%,var(--surface))',
  ];
  let offset = 0;
  if (!total)
    return (
      <div className="mg-chart-empty">
        <Icon name="money" size={28} />
        <p>No expenses recorded in this period.</p>
      </div>
    );
  return (
    <div className="mg-expense-chart">
      <svg
        viewBox="0 0 140 140"
        role="img"
        aria-label={
          'Expense breakdown: ' +
          entries.map(([label, value]) => `${label}, ${money(value)}`).join('; ')
        }
      >
        <circle cx="70" cy="70" r="49" fill="none" stroke="var(--gold-soft)" strokeWidth="20" />
        {entries.map(([label, value], index) => {
          const length = (value / total) * 307.88;
          const element = (
            <circle
              key={label}
              cx="70"
              cy="70"
              r="49"
              fill="none"
              stroke={colours[index % colours.length]}
              strokeWidth="20"
              strokeDasharray={`${length} ${307.88 - length}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
            />
          );
          offset += length;
          return element;
        })}
        <text x="70" y="68" textAnchor="middle" className="mg-ring-value">
          {money(total)}
        </text>
        <text x="70" y="84" textAnchor="middle">
          Recorded
        </text>
      </svg>
      <div className="mg-expense-legend">
        {entries.slice(0, 5).map(([label, value], index) => (
          <div key={label}>
            <span>
              <i style={{ background: colours[index % colours.length] }} />
              {label}
            </span>
            <strong>{money(value)}</strong>
          </div>
        ))}
        {entries.length > 5 && <p>Additional categories are included in the total.</p>}
      </div>
    </div>
  );
}

export function FinancesPage() {
  const {
    data,
    actor,
    scope,
    units,
    stays,
    edit,
    inspect,
    notify,
    unitLabel,
    today,
    recordId,
    go,
  } = useWorkspace();
  const [tab, setTab] = useState(recordId === 'invoices' ? 'NexG invoices' : 'Overview'),
    [range, setRange] = useState<Range>('30'),
    [mobileView, setMobileView] = useState('Cash flow');
  const local = useMemo(
    () => scopedData(data, units, stays, scope === 'all'),
    [data, units, stays, scope],
  );
  const all = totals(local);
  const payments = local.payments.filter((payment) => inPeriod(payment.date, range, today));
  const expenses = local.expenses.filter((expense) => inPeriod(expense.date, range, today));
  const invoices = local.invoices.filter((invoice) => inPeriod(text(invoice.date), range, today));
  const receipts = sum(payments, receiptAmount),
    expenseTotal = sum(
      expenses.filter((expense) => recordedExpense(expense.status)),
      (expense) => expense.amountMinor,
    );
  const canEdit = ['Owner', 'Manager', 'Finance'].includes(actor.role);
  const firstStay = stays.find((stay) => !['Draft', 'Hold', 'Cancelled'].includes(stay.status));
  const guest = (id: string) => stays.find((stay) => stay.id === id)?.guest || 'Guest';
  const unitForStay = (id: string) => stays.find((stay) => stay.id === id)?.unitId || '';
  const paymentRows: LedgerRow[] = payments.map((payment) => ({
    id: payment.id,
    collection: 'payments',
    date: payment.date,
    title: guest(payment.stayId),
    unitId: unitForStay(payment.stayId),
    category: payment.type,
    amount: ['Refund', 'Deposit refund'].includes(payment.type)
      ? -payment.amountMinor
      : payment.amountMinor,
    status: payment.status,
  }));
  const expenseRows: LedgerRow[] = expenses.map((expense) => ({
    id: expense.id,
    collection: 'expenses',
    date: expense.date,
    title: expense.description,
    unitId: expense.unitId,
    category: expense.category,
    amount: -expense.amountMinor,
    status: expense.status,
  }));
  const invoiceRows: LedgerRow[] = invoices.map((invoice) => ({
    id: invoice.id,
    collection: 'invoices',
    date: text(invoice.date),
    title: text(invoice.title, 'Service invoice'),
    unitId: text(invoice.unitId),
    category: invoiceType(invoice),
    amount: number(invoice.amountMinor),
    status: text(invoice.status),
  }));
  const transactions = [...paymentRows, ...expenseRows].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const accommodation = paymentRows.filter((row) => ['Receipt', 'Refund'].includes(row.category));
  const deposits = stays.filter((stay) =>
    payments.some((payment) => payment.stayId === stay.id && payment.type.startsWith('Deposit')),
  );
  const exportRows =
    tab === 'Accommodation'
      ? accommodation
      : tab === 'Expenses'
        ? expenseRows
        : tab === 'Deposits'
          ? paymentRows.filter((row) => row.category.startsWith('Deposit'))
          : tab === 'NexG invoices'
            ? invoiceRows
            : [...transactions, ...invoiceRows];
  const exportHeaders = [
    'Date',
    'Description',
    'Property / unit',
    'Category',
    'Amount, KES',
    'Record status',
  ];
  const exported = exportRows.map((row) => [
    row.date,
    row.title,
    unitLabel(row.unitId),
    row.category,
    row.amount / 100,
    row.status,
  ]);
  const recordPayment = (type = 'Receipt', stayId = firstStay?.id, amountMinor = 0) => {
    if (!stayId) {
      notify('Add a confirmed stay before recording money.');
      return;
    }
    edit('payments', undefined, {
      stayId,
      type,
      status: 'Recorded',
      amountMinor,
      date: today,
      reference: '',
    });
  };
  const ledgerTable = (rows: LedgerRow[], title: string) => (
    <Records
      rows={rows}
      headers={['Date', 'Description', 'Property / unit', 'Category', 'Amount', 'State', '']}
      label={title}
      renderRow={(row) => (
        <tr key={row.id}>
          <td>{dateText(row.date)}</td>
          <td>
            <strong>{row.title}</strong>
          </td>
          <td>{unitLabel(row.unitId)}</td>
          <td>{row.category}</td>
          <td className={row.amount < 0 ? 'mg-negative' : 'mg-positive'}>{money(row.amount)}</td>
          <td>
            <Status value={row.status} />
          </td>
          <td>
            <Button variant="ghost" onClick={() => inspect(row.collection, row.id)}>
              View <Icon name="right" size={14} />
            </Button>
          </td>
        </tr>
      )}
    />
  );
  return (
    <div className="management-page">
      <PageHeader
        title="Finances"
        subtitle="Track recorded income, expenses and balances across your properties."
      >
        {data.settings.invoiceAccess === true && (
          <Button onClick={() => go('financial-history')}>Statements &amp; folios</Button>
        )}
        <Period value={range} onChange={setRange} />
        <Button
          onClick={() => exportCsv('nexg-finances-' + today + '.csv', [exportHeaders, ...exported])}
        >
          <Icon name="download" size={17} />
          Export statement
        </Button>
        {canEdit && (
          <Button
            variant="primary"
            onClick={() =>
              edit('expenses', undefined, {
                unitId: units[0]?.id,
                amountMinor: 0,
                date: today,
                status: 'Recorded',
                category: 'Supplies',
                description: '',
              })
            }
          >
            <Icon name="add" size={18} />
            Add expense
          </Button>
        )}
      </PageHeader>
      <div className="mg-context">
        <WorkspaceLabel />
        <span>
          {range === 'all'
            ? 'All recorded dates'
            : dateText(rangeStart(range, today)) + ' – ' + dateText(today)}{' '}
          · KES
        </span>
      </div>
      <ResponsiveTabs
        items={['Overview', 'Accommodation', 'Deposits', 'Expenses', 'NexG invoices']}
        value={tab}
        onChange={setTab}
        label="Finance view"
      />
      <div className="mg-stats">
        <Stat label="Recorded receipts" value={money(receipts)} note="Accommodation, net refunds" />
        <Stat
          label="Expenses"
          value={money(expenseTotal)}
          note="Recorded in this period"
          icon="money"
        />
        <Stat
          label="Net cash"
          value={money(receipts - expenseTotal)}
          note="Receipts less recorded expenses"
          icon="chart"
        />
        <Stat
          label="Stay balances"
          value={money(all.balance)}
          note="Across all selected stays"
          icon="book"
        />
      </div>
      {tab === 'Overview' ? (
        <div className="mg-finance-overview">
          <div className="mg-mobile-switch">
            <Tabs
              items={['Cash flow', 'Expense split', 'Transactions']}
              value={mobileView}
              onChange={setMobileView}
            />
          </div>
          <div className="mg-overview-charts">
            <Panel
              className={'mg-chart-panel ' + (mobileView === 'Cash flow' ? 'mobile-active' : '')}
            >
              <div className="mg-panel-heading">
                <h2>Receipts and expenses</h2>
                <span>KES</span>
              </div>
              <CashChart rows={transactions} />
            </Panel>
            <Panel
              className={
                'mg-chart-panel ' + (mobileView === 'Expense split' ? 'mobile-active' : '')
              }
            >
              <div className="mg-panel-heading">
                <h2>Expense breakdown</h2>
              </div>
              <ExpenseChart expenses={expenses} />
            </Panel>
          </div>
          <Panel
            className={
              'mg-transactions-panel ' + (mobileView === 'Transactions' ? 'mobile-active' : '')
            }
          >
            <div className="mg-panel-heading">
              <h2>Recent transactions</h2>
              <Button variant="ghost" onClick={() => setTab('Accommodation')}>
                View receipts <Icon name="right" size={15} />
              </Button>
            </div>
            {ledgerTable(transactions, 'Recent financial transactions')}
          </Panel>
          <div className="mg-separate-balances">
            <span>
              Refundable deposits held <strong>{money(all.deposits)}</strong>
            </span>
            <span>
              Guest merchant orders{' '}
              <strong>{sum(local.qrCards, (card) => card.orders)} QR-attributed orders</strong>
            </span>
            <span>
              NexG invoices due{' '}
              <strong>
                {money(
                  sum(
                    local.invoices.filter(
                      (invoice) =>
                        nexgInvoice(invoice) &&
                        ['Sent', 'Due', 'Overdue'].includes(text(invoice.status)),
                    ),
                    (invoice) => number(invoice.amountMinor),
                  ),
                )}
              </strong>
            </span>
          </div>
        </div>
      ) : (
        <Panel className="mg-fill-panel">
          <div className="mg-panel-heading">
            <div>
              <h2>
                {tab === 'Accommodation'
                  ? 'Accommodation payment records'
                  : tab === 'Deposits'
                    ? 'Refundable deposits'
                    : tab === 'Expenses'
                      ? 'Expense records'
                      : 'Service invoices and folios'}
              </h2>
              <p>
                {tab === 'Deposits'
                  ? 'Deposits stay separate from accommodation income.'
                  : tab === 'NexG invoices'
                    ? 'NexG services, folios and merchant shopping keep separate records.'
                    : 'Record accommodation and expense activity in your workspace.'}
              </p>
            </div>
            <div className="mg-row-actions">
              {canEdit && tab === 'Accommodation' && (
                <Button variant="primary" onClick={() => recordPayment()}>
                  <Icon name="add" size={16} />
                  Record receipt
                </Button>
              )}
              {canEdit && tab === 'Deposits' && (
                <Button variant="primary" onClick={() => recordPayment('Deposit')}>
                  <Icon name="add" size={16} />
                  Record deposit
                </Button>
              )}
              {canEdit && tab === 'Expenses' && (
                <Button
                  variant="primary"
                  onClick={() =>
                    edit('expenses', undefined, {
                      unitId: units[0]?.id,
                      date: today,
                      status: 'Recorded',
                      amountMinor: 0,
                    })
                  }
                >
                  Add expense
                </Button>
              )}
            </div>
          </div>
          {tab === 'Deposits' ? (
            <Records
              rows={deposits}
              headers={['Guest / stay', 'Unit', 'Held', 'Actions']}
              label="Refundable deposits"
              empty="No deposits recorded. Add a deposit against a confirmed stay."
              renderRow={(stay) => (
                <tr key={stay.id}>
                  <td>
                    <strong>{stay.guest}</strong>
                    <small>{stay.ref}</small>
                  </td>
                  <td>{unitLabel(stay.unitId)}</td>
                  <td>{money(totals(local, stay.id).deposits)}</td>
                  <td>
                    <div className="mg-row-actions">
                      <Button variant="ghost" onClick={() => inspect('stays', stay.id)}>
                        View stay
                      </Button>
                      {canEdit && totals(local, stay.id).deposits > 0 && (
                        <Button
                          onClick={() =>
                            recordPayment(
                              'Deposit refund',
                              stay.id,
                              totals(local, stay.id).deposits,
                            )
                          }
                        >
                          Record refund
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            />
          ) : tab === 'NexG invoices' ? (
            <>
              <Records
                rows={invoices}
                headers={['Invoice', 'Type', 'Unit', 'Due', 'Amount', 'State', '']}
                label="Service invoices and folios"
                empty="No service invoices recorded for this period."
                renderRow={(invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <strong>{text(invoice.title, 'Invoice')}</strong>
                    </td>
                    <td>{invoiceType(invoice)}</td>
                    <td>{unitLabel(text(invoice.unitId))}</td>
                    <td>{dateText(text(invoice.due, text(invoice.date)))}</td>
                    <td>{money(number(invoice.amountMinor))}</td>
                    <td>
                      <Status value={text(invoice.status)} />
                    </td>
                    <td>
                      <div className="mg-row-actions">
                        <Button variant="ghost" onClick={() => inspect('invoices', invoice.id)}>
                          View
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              />
              <div className="mg-inline-note">
                <Icon name="delivery" size={18} />
                <span>
                  <strong>Guest merchant orders</strong> ·{' '}
                  {sum(local.qrCards, (card) => card.orders)} orders attributed to QR cards.
                </span>
              </div>
            </>
          ) : (
            ledgerTable(tab === 'Accommodation' ? accommodation : expenseRows, tab)
          )}
          <div className="mg-panel-footer">
            <span>Recorded transactions</span>
            <Button
              variant="ghost"
              onClick={() => {
                if (
                  !printRows(
                    'NexG Stays · ' + tab,
                    exportHeaders,
                    exported,
                    'Selected properties · ' +
                      (range === 'all'
                        ? 'all dates'
                        : dateText(rangeStart(range, today)) + ' to ' + dateText(today)),
                  )
                )
                  notify('Allow a new window to open the printable statement.');
              }}
            >
              <Icon name="download" size={15} />
              Print statement
            </Button>
          </div>
        </Panel>
      )}
    </div>
  );
}

function useReport(range: Range) {
  const { data, scope, units, stays, today } = useWorkspace();
  return useMemo(() => {
    const local = scopedData(data, units, stays, scope === 'all');
    const candidateDates = [
      ...stays.map((stay) => stay.start),
      ...local.payments.map((payment) => payment.date),
      ...local.expenses.map((expense) => expense.date),
    ].filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today);
    const firstDate =
      range === 'all' ? candidateDates.sort()[0] || today : rangeStart(range, today);
    const length = Math.max(
      1,
      Math.round((Date.parse(today) - Date.parse(firstDate)) / 86400000) + 1,
    );
    const days = Array.from({ length }, (_, index) => addDays(firstDate, index));
    const activeUnits = units.filter(
      (unit) => !['Archived', 'Inactive', 'Draft'].includes(unit.status),
    );
    const occupied = (stay: Stay, date: string) =>
      !['Cancelled', 'Draft', 'Hold'].includes(stay.status) &&
      stay.start <= date &&
      stay.end > date;
    const counts = (ids: Set<string>) => {
      let occupiedNights = 0,
        availableNights = 0;
      days.forEach((date) =>
        activeUnits
          .filter((unit) => ids.has(unit.id))
          .forEach((unit) => {
            const hasStay = stays.some((stay) => stay.unitId === unit.id && occupied(stay, date));
            if (hasStay) occupiedNights++;
            availableNights++;
          }),
      );
      return { occupied: occupiedNights, available: availableNights };
    };
    const rows = data.properties
      .filter((property) => units.some((unit) => unit.propertyId === property.id))
      .map((property) => {
        const propertyUnits = units.filter((unit) => unit.propertyId === property.id),
          ids = new Set(propertyUnits.map((unit) => unit.id)),
          stayIds = new Set(stays.filter((stay) => ids.has(stay.unitId)).map((stay) => stay.id));
        const count = counts(ids),
          receipts = sum(
            local.payments.filter(
              (payment) => stayIds.has(payment.stayId) && inPeriod(payment.date, range, today),
            ),
            receiptAmount,
          ),
          expenses = sum(
            local.expenses.filter(
              (expense) =>
                ids.has(expense.unitId) &&
                inPeriod(expense.date, range, today) &&
                recordedExpense(expense.status),
            ),
            (expense) => expense.amountMinor,
          );
        return {
          id: property.id,
          name: property.name,
          image: property.image,
          units: propertyUnits.length,
          ...count,
          occupancy: count.available ? (count.occupied / count.available) * 100 : 0,
          receipts,
          expenses,
          net: receipts - expenses,
        };
      });
    const inventory = counts(new Set(activeUnits.map((unit) => unit.id)));
    const trend = days.map((date) => {
      let occupiedNights = 0,
        availableNights = 0;
      activeUnits.forEach((unit) => {
        const hasStay = stays.some((stay) => stay.unitId === unit.id && occupied(stay, date));
        if (hasStay) occupiedNights++;
        availableNights++;
      });
      return { date, value: availableNights ? (occupiedNights / availableNights) * 100 : 0 };
    });
    const feedback = local.feedback.filter(
      (record) =>
        inPeriod(text(record.date), range, today) &&
        number(record.rating) >= 1 &&
        number(record.rating) <= 5,
    );
    return {
      local,
      rows,
      trend,
      feedback,
      start: firstDate,
      receipts: sum(rows, (row) => row.receipts),
      expenses: sum(rows, (row) => row.expenses),
      occupancy: inventory.available ? (inventory.occupied / inventory.available) * 100 : 0,
      ...inventory,
    };
  }, [data, scope, units, stays, range, today]);
}
function OccupancyChart({ points }: { points: { date: string; value: number }[] }) {
  const { today } = useWorkspace();
  const { ref, width, height } = usePlotDimensions(),
    left = 43,
    right = 12,
    top = 9,
    bottom = 25,
    plotWidth = width - left - right,
    plotHeight = Math.max(15, height - top - bottom),
    base = top + plotHeight;
  const line = points
    .map(
      (point, index) =>
        `${index ? 'L' : 'M'}${left + (index / Math.max(1, points.length - 1)) * plotWidth},${base - (point.value / 100) * plotHeight}`,
    )
    .join(' ');
  return (
    <div className="mg-chart">
      <svg
        ref={ref}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={
          'Occupancy from ' + dateText(points[0]?.date || today) + ' to ' + dateText(today)
        }
      >
        {[0, 25, 50, 75, 100].map((value) => (
          <g key={value}>
            <line
              x1={left}
              x2={width - right}
              y1={base - (value / 100) * plotHeight}
              y2={base - (value / 100) * plotHeight}
              stroke="var(--mg-line)"
            />
            <text x={left - 8} y={base - (value / 100) * plotHeight + 3} textAnchor="end">
              {value}%
            </text>
          </g>
        ))}
        <path
          d={line + ` L${width - right},${base} L${left},${base}Z`}
          fill="var(--gold-soft)"
          opacity=".65"
        />
        <path d={line} fill="none" stroke="var(--gold)" strokeWidth="2.5" />
        <text x={left} y={height - 6}>
          {dateText(points[0]?.date || today)}
        </text>
        <text x={width - right} y={height - 6} textAnchor="end">
          {dateText(today)}
        </text>
      </svg>
    </div>
  );
}
export function ReportsPage() {
  const { data, scope, inspect, unitLabel, today, go } = useWorkspace();
  const [range, setRange] = useState<Range>('30'),
    [tab, setTab] = useState('Portfolio');
  const report = useReport(range);
  const rating = report.feedback.length
    ? sum(report.feedback, (record) => number(record.rating)) / report.feedback.length
    : 0;
  const [mobileView, setMobileView] = useState('Performance');
  const csvRows = [
    [
      'Property',
      'Units',
      'Occupied nights',
      'Tracked unit nights',
      'Occupancy %',
      'Recorded receipts, KES',
      'Recorded expenses, KES',
      'Net cash, KES',
    ],
    ...report.rows.map((row) => [
      row.name,
      row.units,
      row.occupied,
      row.available,
      row.occupancy.toFixed(1),
      row.receipts / 100,
      row.expenses / 100,
      row.net / 100,
    ]),
  ];
  return (
    <div className="management-page">
      <PageHeader
        title="Reports"
        subtitle="Understand your portfolio using the same records as your workspace."
      >
        <Button onClick={() => go('qr-analytics')}>QR and order analytics</Button>
        <Period value={range} onChange={setRange} />
        <Button
          variant="primary"
          onClick={() => exportCsv('nexg-portfolio-' + today + '.csv', csvRows)}
        >
          <Icon name="download" size={17} />
          Export report
        </Button>
      </PageHeader>
      <div className="mg-context">
        <WorkspaceLabel />
        <span>
          {scope === 'all' ? 'All properties' : 'Selected property'} · {dateText(report.start)} –{' '}
          {dateText(today)}
        </span>
      </div>
      <ResponsiveTabs
        items={['Portfolio', 'Receipts', 'Occupancy', 'Guest experience']}
        value={tab}
        onChange={setTab}
        label="Report view"
      />
      <div className="mg-stats">
        <Stat
          label="Recorded receipts"
          value={money(report.receipts)}
          note="Accommodation, net refunds"
        />
        <Stat
          label="Occupancy"
          value={report.occupancy.toFixed(1) + '%'}
          note={`${report.occupied} / ${report.available} tracked unit nights`}
          icon="bed"
        />
        <Stat
          label="Expenses"
          value={money(report.expenses)}
          note="Recorded for selected units"
          icon="money"
        />
        <Stat
          label="Guest rating"
          value={rating ? rating.toFixed(1) + ' / 5' : '—'}
          note={report.feedback.length + ' feedback records'}
          icon="user"
        />
      </div>
      {tab === 'Guest experience' ? (
        <Panel className="mg-fill-panel">
          <div className="mg-panel-heading">
            <div>
              <h2>Guest feedback</h2>
              <p>
                Feedback uses the selected period. Guide and QR counters below are lifetime totals.
              </p>
            </div>
          </div>
          <div className="mg-experience-summary">
            <span>
              <Icon name="book" size={20} />
              <strong>{report.local.units.filter((unit) => unit.guidePublished).length}</strong>
              published unit guides
            </span>
            <span>
              <Icon name="qr" size={20} />
              <strong>{sum(report.local.qrCards, (card) => card.scans)}</strong>QR scans
            </span>
            <span>
              <Icon name="package" size={20} />
              <strong>{sum(report.local.qrCards, (card) => card.orders)}</strong>attributed orders
            </span>
          </div>
          <Records
            rows={report.feedback}
            headers={['Date', 'Unit / stay', 'Rating', 'Comment', '']}
            label="Guest experience feedback"
            empty="No feedback recorded for this period."
            renderRow={(record) => (
              <tr key={record.id}>
                <td>{dateText(text(record.date))}</td>
                <td>{unitLabel(text(record.unitId))}</td>
                <td>
                  <Badge tone="success">{number(record.rating)} / 5</Badge>
                </td>
                <td>{text(record.comment, text(record.comments, text(record.title)))}</td>
                <td>
                  <Button variant="ghost" onClick={() => inspect('feedback', record.id)}>
                    View
                  </Button>
                </td>
              </tr>
            )}
          />
        </Panel>
      ) : (
        <div className="mg-reports-content">
          <div className="mg-mobile-switch">
            <Tabs items={['Performance', 'Trend']} value={mobileView} onChange={setMobileView} />
          </div>
          <div className={'mg-report-chart-row ' + (mobileView === 'Trend' ? 'mobile-active' : '')}>
            <Panel className="mg-chart-panel">
              <div className="mg-panel-heading">
                <h2>{tab === 'Receipts' ? 'Receipt distribution' : 'Occupancy trend'}</h2>
                <span>Selected units</span>
              </div>
              {tab === 'Receipts' ? (
                <div className="mg-distribution">
                  {report.rows.map((row) => (
                    <div key={row.id}>
                      <div>
                        <strong>{row.name}</strong>
                        <span>{money(row.receipts)}</span>
                      </div>
                      <div className="mg-progress">
                        <i
                          style={{
                            width:
                              Math.max(0, (row.receipts / Math.max(1, report.receipts)) * 100) +
                              '%',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <OccupancyChart points={report.trend} />
              )}
            </Panel>
            <Panel className="mg-report-aside">
              <div className="mg-panel-heading">
                <h2>Period snapshot</h2>
              </div>
              <div className="mg-key-row">
                <span>Net cash</span>
                <strong>{money(report.receipts - report.expenses)}</strong>
              </div>
              <div className="mg-key-row">
                <span>Occupied unit nights</span>
                <strong>{report.occupied}</strong>
              </div>
              <div className="mg-key-row">
                <span>Tracked unit nights</span>
                <strong>{report.available}</strong>
              </div>
              <p className="mg-small-note">
                Occupancy is calculated from recorded reservations in the selected period.
              </p>
            </Panel>
          </div>
          <Panel
            className={
              'mg-performance-panel ' + (mobileView === 'Performance' ? 'mobile-active' : '')
            }
          >
            <div className="mg-panel-heading">
              <h2>Property performance</h2>
              <span>{data.settings.currency || 'KES'}</span>
            </div>
            <Records
              rows={report.rows}
              headers={['Property', 'Units', 'Occupancy', 'Receipts', 'Expenses', 'Net cash', '']}
              label="Property performance"
              renderRow={(row) => (
                <tr key={row.id}>
                  <td>
                    <div className="mg-property-cell">
                      {row.image ? (
                        <span className="mg-property-thumb">
                          <img src={row.image} alt={row.name + ' uploaded property photo'} />
                        </span>
                      ) : (
                        <PropertyPhoto
                          index={Math.max(
                            0,
                            data.properties.findIndex((property) => property.id === row.id),
                          )}
                          className="mg-property-thumb"
                          alt={row.name}
                        />
                      )}
                      <strong>{row.name}</strong>
                    </div>
                  </td>
                  <td>{row.units}</td>
                  <td>{row.occupancy.toFixed(1)}%</td>
                  <td>{money(row.receipts)}</td>
                  <td>{money(row.expenses)}</td>
                  <td>
                    <Badge tone={row.net >= 0 ? 'success' : 'warning'}>{money(row.net)}</Badge>
                  </td>
                  <td>
                    <Button variant="ghost" onClick={() => inspect('properties', row.id)}>
                      View
                    </Button>
                  </td>
                </tr>
              )}
            />
          </Panel>
        </div>
      )}
    </div>
  );
}

function FormField({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={'mg-field ' + (wide ? 'wide' : '')}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function Toggle({
  label,
  detail,
  checked,
  onChange,
  disabled = false,
  icon,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  icon?: string;
}) {
  return (
    <label className="mg-toggle-row">
      {icon && (
        <span className="mg-toggle-icon">
          <Icon name={icon} size={21} />
        </span>
      )}
      <span>
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
    </label>
  );
}
const settingsTabs = {
  General: 'settings',
  Notifications: 'notification',
  Team: 'team',
  Branding: 'brush',
  Billing: 'card',
  'Privacy & security': 'shield',
};

export function SettingsPage() {
  const { data, actor, recordId, units, stays, today, run, notify, go, propertyLabel } =
    useWorkspace();
  const viewport = useViewport();
  const showSummary = viewport.width >= 1000;
  const owner = data.settings.settingsWritable === true;
  const [tab, setTab] = useState(
    recordId === 'team'
      ? 'Team'
      : ['privacy', 'referrals'].includes(recordId)
        ? 'Privacy & security'
        : 'General',
  );
  const [step, setStep] = useState('Workspace');
  const [security, setSecurity] = useState(
    recordId === 'referrals' ? 'Referrals' : 'Privacy requests',
  );
  const [changes, setChanges] = useState<Partial<Settings>>({});
  const [appearance, setAppearance] = useState(() => personalAppearance(data.settings));
  const [saving, setSaving] = useState(false);

  const saved = data.settings;
  const reminders = object(saved.notifications);
  const defaults: Settings = {
    ...saved,
    bookings: reminders.bookings !== false,
    daily: reminders.daily !== false,
    tasks: reminders.tasks !== false,
    quietHours: { from: '23:00', to: '07:00', ...object(saved.quietHours) },
  };
  const preferences = { ...defaults, ...changes };
  const rules = { ...object(saved.notificationRules), ...object(changes.notificationRules) };
  const features = { ...object(saved.features), ...object(changes.features) };
  const dirty = Object.keys(changes).length > 0;
  const appearanceDirty = JSON.stringify(appearance) !== JSON.stringify(personalAppearance(saved));
  const activeTeam = data.team.filter((member) => member.status === 'Active');
  const zones = [...new Set([saved.timezone, 'Africa/Nairobi', 'UTC', 'Europe/London'])];
  const accent = text(preferences.landingColour) || '#1F3A5F';

  function change(key: string, value: unknown) {
    setChanges((current) => {
      const next = { ...current };
      if (JSON.stringify(defaults[key]) === JSON.stringify(value)) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  function changeTab(value: string) {
    setTab(value);
    setStep(value === 'Notifications' ? 'Reminders' : 'Workspace');
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (!owner || !dirty || saving) return;
    setSaving(true);
    try {
      if (await run({ type: 'settings', settings: changes })) setChanges({});
    } finally {
      setSaving(false);
    }
  }

  async function action(command: Parameters<typeof run>[0]) {
    if (saving) return false;
    setSaving(true);
    try {
      return await run(command);
    } finally {
      setSaving(false);
    }
  }

  function chooseLogo(file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 256 * 1024) {
      notify('Choose a PNG, JPEG or WebP logo under 256 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => change('logo', String(reader.result));
    reader.onerror = () => notify('The logo could not be read.');
    reader.readAsDataURL(file);
  }

  function showSecurity(section: string) {
    changeTab('Privacy & security');
    setSecurity(section);
  }

  function exportWorkspace() {
    exportJson('nexg-workspace-' + today + '.json', {
      exportedAt: new Date().toISOString(),
      properties: data.properties.map(({ image, ...property }) => property),
      units: data.units.map(({ image, access, ...unit }) => unit),
      stays: data.stays,
      requests: data.tasks,
      finances: { payments: data.payments, expenses: data.expenses, invoices: data.invoices },
      settings: {
        workspace: saved.workspace,
        business: saved.business,
        currency: saved.currency,
        timezone: saved.timezone,
        checkIn: saved.checkIn,
        checkOut: saved.checkOut,
        language: saved.language,
      },
    });
  }

  const settingsFooter = (
    <div className="mg-settings-footer">
      <span>
        {dirty
          ? 'Unsaved changes'
          : owner
            ? 'Workspace preferences'
            : 'View-only settings for this role'}
      </span>
      <div className="mg-row-actions">
        <Button disabled={!dirty || saving} onClick={() => setChanges({})}>
          Cancel
        </Button>
        {owner && (
          <Button variant="primary" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        )}
      </div>
    </div>
  );

  const workspaceFields = (
    <>
      <FormField label="Workspace name">
        <input
          value={preferences.workspace}
          onChange={(e) => change('workspace', e.target.value)}
          maxLength={160}
          required
          disabled={!owner || saving}
        />
      </FormField>
      <FormField label="Business name">
        <input
          value={preferences.business}
          onChange={(e) => change('business', e.target.value)}
          maxLength={120}
          required
          disabled={!owner || saving}
        />
      </FormField>
      <FormField label="Default currency">
        <select defaultValue="KES">
          <option value="KES">KES · Kenyan shilling</option>
        </select>
      </FormField>
      <FormField label="Time zone">
        <select
          value={preferences.timezone}
          onChange={(e) => change('timezone', e.target.value)}
          disabled={!owner || saving}
        >
          {zones.map((zone) => (
            <option key={zone}>{zone}</option>
          ))}
        </select>
      </FormField>
    </>
  );
  const stayFields = (
    <>
      <FormField label="Default check-in">
        <input
          type="time"
          value={preferences.checkIn}
          onChange={(e) => change('checkIn', e.target.value)}
          required
          disabled={!owner || saving}
        />
      </FormField>
      <FormField label="Default check-out">
        <input
          type="time"
          value={preferences.checkOut}
          onChange={(e) => change('checkOut', e.target.value)}
          required
          disabled={!owner || saving}
        />
      </FormField>
    </>
  );
  const guestFields = (
    <>
      <FormField label="Guest language">
        <select
          value={preferences.language}
          onChange={(e) => change('language', e.target.value)}
          disabled={!owner || saving}
        >
          <option value="en">English</option>
          <option value="sw">Kiswahili</option>
          {!['en', 'sw'].includes(saved.language) && (
            <option value={saved.language}>{saved.language}</option>
          )}
        </select>
      </FormField>
      <FormField label="Message signature">
        <textarea
          rows={2}
          value={preferences.signature}
          onChange={(e) => change('signature', e.target.value)}
          maxLength={200}
          disabled={!owner || saving}
        />
      </FormField>
    </>
  );
  const reminderSwitches = (
    <>
      <Toggle
        icon="calendar"
        label="New reservations and cancellations"
        detail="Show reservation reminders in your workspace."
        checked={preferences.bookings === true}
        onChange={(value) => change('bookings', value)}
        disabled={!owner || saving}
      />
      <Toggle
        icon="calendar"
        label="Daily portfolio summary"
        detail="A daily overview of arrivals, departures and requests."
        checked={preferences.daily === true}
        onChange={(value) => change('daily', value)}
        disabled={!owner || saving}
      />
    </>
  );

  let body: ReactNode;
  if (tab === 'General') {
    body = (
      <>
        <div className="mg-panel-heading">
          <h2>Workspace details</h2>
        </div>
        {!showSummary && (
          <div className="mg-form-step">
            <ResponsiveTabs
              items={['Workspace', 'Stay defaults']}
              value={step}
              onChange={setStep}
              label="Details step"
            />
          </div>
        )}
        <form className="mg-settings-form mg-general-form" onSubmit={(event) => void save(event)}>
          {showSummary ? (
            <>
              <div className="mg-form-grid">
                {workspaceFields}
                {stayFields}
              </div>
              <section className="mg-general-section">
                <h3>Guest communication</h3>
                <div className="mg-form-grid">{guestFields}</div>
              </section>
              {viewport.height >= 850 && (
                <section className="mg-general-section mg-general-notifications">
                  <h3>Notifications</h3>
                  {reminderSwitches}
                </section>
              )}
            </>
          ) : (
            <div className="mg-form-grid">
              {step === 'Workspace' ? (
                workspaceFields
              ) : (
                <>
                  {stayFields}
                  {guestFields}
                </>
              )}
            </div>
          )}
        </form>
        {settingsFooter}
      </>
    );
  } else if (tab === 'Notifications') {
    const current = workspaceReminders(data, units, stays, today);
    const quiet = object(preferences.quietHours);
    body = (
      <>
        <div className="mg-panel-heading">
          <h2>Workspace notifications</h2>
        </div>
        <div className="mg-form-step">
          <ResponsiveTabs
            items={['Reminders', 'Recipients', 'Quiet hours']}
            value={step}
            onChange={setStep}
            label="Notification settings"
          />
        </div>
        {step === 'Reminders' ? (
          <>
            <div className="mg-notification-controls">
              {reminderSwitches}
              <Toggle
                label="Requests due"
                checked={preferences.tasks === true}
                onChange={(value) => change('tasks', value)}
                disabled={!owner || saving}
              />
            </div>
            <div className="mg-local-toolbar">
              <span>{current.daily ?? 'Daily summary is off'}</span>
              <Button onClick={() => go('operations')}>View requests</Button>
            </div>
          </>
        ) : step === 'Recipients' ? (
          <Records
            rows={EVENTS.map((event) => ({ ...event, id: event.key }))}
            headers={['Event', ...ROLES.map((role) => role.replaceAll('_', ' '))]}
            label="Notification recipients"
            pageSize={5}
            renderRow={(event) => {
              const selected = Array.isArray(rules[event.key])
                ? (rules[event.key] as string[])
                : [];
              return (
                <tr key={event.key}>
                  <td>
                    <strong>{event.label}</strong>
                    <small>{event.channel}</small>
                  </td>
                  {ROLES.map((role) => (
                    <td key={role}>
                      <input
                        type="checkbox"
                        aria-label={event.label + ' · ' + role.replaceAll('_', ' ')}
                        checked={selected.includes(role)}
                        disabled={!owner || saving}
                        onChange={(e) =>
                          change('notificationRules', {
                            ...object(changes.notificationRules),
                            [event.key]: e.target.checked
                              ? [...selected, role]
                              : selected.filter((value) => value !== role),
                          })
                        }
                      />
                    </td>
                  ))}
                </tr>
              );
            }}
          />
        ) : (
          <div className="mg-settings-form">
            <div className="mg-form-grid">
              <FormField label="Quiet from">
                <input
                  type="time"
                  value={text(quiet.from)}
                  onChange={(e) => change('quietHours', { ...quiet, from: e.target.value })}
                  disabled={!owner || saving}
                />
              </FormField>
              <FormField label="Quiet until">
                <input
                  type="time"
                  value={text(quiet.to)}
                  onChange={(e) => change('quietHours', { ...quiet, to: e.target.value })}
                  disabled={!owner || saving}
                />
              </FormField>
            </div>
            <p className="mg-small-note">Quiet hours use {preferences.timezone}.</p>
          </div>
        )}
        {settingsFooter}
      </>
    );
  } else if (tab === 'Team') {
    body = (
      <>
        <div className="mg-panel-heading">
          <div>
            <h2>Team and access</h2>
            <p>See the roles and units assigned to your workspace members.</p>
          </div>
          {owner && <Button onClick={() => go('inbox', 'new')}>Request an access change</Button>}
        </div>
        <Records
          rows={data.team}
          headers={['Person', 'Role / property scope', 'State']}
          label="Team access"
          renderRow={(member) => (
            <tr key={member.id}>
              <td>
                <div className="mg-person">
                  <Avatar name={member.name} />
                  <span>
                    <strong>{member.id === actor.id ? member.name + ' (you)' : member.name}</strong>
                    {member.email && <small>{member.email}</small>}
                  </span>
                </div>
              </td>
              <td>
                {member.role}
                <small>
                  {member.unitCount === null
                    ? 'Every unit'
                    : member.propertyIds.length
                      ? member.propertyIds.map(propertyLabel).join(', ') +
                        ' · ' +
                        String(member.unitCount) +
                        ' assigned units'
                      : String(member.unitCount ?? 0) + ' assigned units'}
                </small>
              </td>
              <td>
                <Status value={member.status} />
              </td>
            </tr>
          )}
        />
      </>
    );
  } else if (tab === 'Branding') {
    body = (
      <>
        <div className="mg-panel-heading">
          <div>
            <h2>Guest-facing brand</h2>
            <p>Manage guest-facing details and your own workspace appearance.</p>
          </div>
        </div>
        <div className="mg-form-step">
          <ResponsiveTabs
            items={['Workspace', 'Logo & appearance']}
            value={step}
            onChange={setStep}
            label="Branding step"
          />
        </div>
        <div className="mg-settings-form">
          {step === 'Workspace' ? (
            <div className="mg-form-grid">
              <FormField label="Guest brand name">
                <input
                  value={text(preferences.guestBrand)}
                  placeholder={preferences.business}
                  maxLength={120}
                  onChange={(e) => change('guestBrand', e.target.value)}
                  disabled={!owner || saving}
                />
              </FormField>
              <FormField label="Guide accent">
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => change('landingColour', e.target.value)}
                  disabled={!owner || saving}
                />
              </FormField>
              <FormField label="Guest welcome" wide>
                <textarea
                  rows={3}
                  value={text(preferences.landingHeadline)}
                  maxLength={160}
                  onChange={(e) => change('landingHeadline', e.target.value)}
                  disabled={!owner || saving}
                />
              </FormField>
            </div>
          ) : (
            <>
              <div className="mg-form-grid">
                <FormField label="Logo image">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => chooseLogo(e.target.files?.[0])}
                    disabled={!owner || saving}
                  />
                </FormField>
                <div className="mg-brand-preview">
                  {text(preferences.logo) ? (
                    <img src={text(preferences.logo)} alt="Guest brand logo" />
                  ) : (
                    <Icon name="home" size={38} />
                  )}
                  <strong>{text(preferences.guestBrand) || preferences.business}</strong>
                  {preferences.logo && owner ? (
                    <Button variant="ghost" onClick={() => change('logo', '')}>
                      Remove logo
                    </Button>
                  ) : null}
                </div>
                <FormField label="Theme">
                  <select
                    value={appearance.theme}
                    onChange={(e) =>
                      setAppearance({
                        ...appearance,
                        theme: e.target.value as typeof appearance.theme,
                      })
                    }
                  >
                    {THEMES.map((theme) => (
                      <option key={theme.value} value={theme.value}>
                        {theme.label}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Density">
                  <select
                    value={appearance.density}
                    onChange={(e) =>
                      setAppearance({
                        ...appearance,
                        density: e.target.value === 'compact' ? 'compact' : 'comfortable',
                      })
                    }
                  >
                    <option value="comfortable">Comfortable</option>
                    <option value="compact">Compact</option>
                  </select>
                </FormField>
                <FormField label="Sidebar">
                  <select
                    value={appearance.sidebar}
                    onChange={(e) =>
                      setAppearance({
                        ...appearance,
                        sidebar: e.target.value === 'dark' ? 'dark' : 'light',
                      })
                    }
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </FormField>
                <FormField label="Text size">
                  <select
                    value={appearance.font_size}
                    onChange={(e) =>
                      setAppearance({
                        ...appearance,
                        font_size: e.target.value === 'large' ? 'large' : 'default',
                      })
                    }
                  >
                    <option value="default">Default</option>
                    <option value="large">Large</option>
                  </select>
                </FormField>
                {appearance.theme === 'custom' && (
                  <FormField label="Personal accent">
                    <input
                      type="color"
                      value={appearance.accent ?? '#1F3A5F'}
                      onChange={(e) => setAppearance({ ...appearance, accent: e.target.value })}
                    />
                  </FormField>
                )}
              </div>
              <div className="mg-row-actions">
                <Button
                  disabled={!appearanceDirty || saving}
                  onClick={() => void action({ type: 'theme', record: appearance })}
                >
                  Save personal appearance
                </Button>
              </div>
            </>
          )}
        </div>
        {settingsFooter}
      </>
    );
  } else if (tab === 'Billing') {
    const billingMethod = text(saved.billingMethod);
    body = (
      <>
        <div className="mg-panel-heading">
          <h2>Billing preferences and folios</h2>
        </div>
        <div className="mg-form-step">
          <ResponsiveTabs
            items={['Workspace', 'Features']}
            value={step}
            onChange={setStep}
            label="Billing settings"
          />
        </div>
        {step === 'Features' ? (
          <Records
            rows={FEATURES.map((feature) => ({ ...feature, id: feature.key }))}
            headers={['Feature', 'Preference']}
            label="Host features"
            pageSize={5}
            renderRow={(feature) => (
              <tr key={feature.key}>
                <td>
                  <strong>{feature.label}</strong>
                  <small>{feature.consequence}</small>
                </td>
                <td>
                  {feature.key === 'charge_to_room' ? (
                    <Status value={saved.folioEnabled ? 'Enabled' : 'Managed by NexG'} />
                  ) : (
                    <Toggle
                      label={feature.label}
                      checked={features[feature.key] === true}
                      disabled={!owner || saving}
                      onChange={(value) =>
                        change('features', { ...object(changes.features), [feature.key]: value })
                      }
                    />
                  )}
                </td>
              </tr>
            )}
          />
        ) : (
          <div className="mg-settings-form">
            <div className="mg-form-grid">
              <FormField label="Workspace plan">
                <input value={text(saved.tier) || 'Managed by NexG'} readOnly />
              </FormField>
              <FormField label="Billing contact">
                <input
                  type="email"
                  value={text(preferences.email)}
                  onChange={(e) => change('email', e.target.value)}
                  maxLength={254}
                  disabled={!owner || saving}
                />
              </FormField>
              <FormField label="Verified phone">
                <input value={text(saved.phone) || 'Not set'} readOnly />
              </FormField>
              <FormField label="Payment preference">
                <select
                  value={text(preferences.billingPreference)}
                  onChange={(e) => change('billingPreference', e.target.value)}
                  disabled={!owner || saving}
                >
                  <option>Manual record</option>
                  <option>M-Pesa preference</option>
                  <option>Card preference</option>
                </select>
              </FormField>
              <FormField label="Billing method">
                <input
                  value={
                    billingMethod === 'invoice'
                      ? 'Invoice, 14 days'
                      : billingMethod === 'mpesa'
                        ? 'M-Pesa'
                        : billingMethod === 'card_on_file'
                          ? 'Card on file'
                          : 'Managed by NexG'
                  }
                  readOnly
                />
              </FormField>
            </div>
            <Toggle
              label="Room folios"
              detail="NexG manages charge-to-room access for eligible accounts."
              checked={saved.folioEnabled}
              onChange={() => {}}
              disabled
            />
            <div className="mg-row-actions">
              <Button onClick={() => go('finances', 'invoices')}>
                Open finances <Icon name="right" size={16} />
              </Button>
              <Button onClick={() => go('inbox', 'new')}>Billing support</Button>
            </div>
          </div>
        )}
        {settingsFooter}
      </>
    );
  } else {
    const code = text(saved.referralCode);
    const referralLink = code ? 'https://nexgapp.com/hosts?ref=' + encodeURIComponent(code) : '';

    body = (
      <>
        <div className="mg-panel-heading">
          <h2>Privacy and workspace controls</h2>
        </div>
        <div className="mg-form-step">
          <ResponsiveTabs
            items={['Privacy requests', 'Devices', 'Referrals', 'Activity']}
            value={security}
            onChange={setSecurity}
            label="Privacy and security section"
          />
        </div>
        {security === 'Devices' ? (
          <>
            <Records
              rows={data.devices}
              headers={['Session', 'State']}
              label="Devices and sessions"
              renderRow={(device) => (
                <tr key={device.id}>
                  <td>
                    <strong>{device.title}</strong>
                  </td>
                  <td>
                    <Status value={text(device.status)} />
                  </td>
                </tr>
              )}
            />
            <div className="mg-local-toolbar">
              <span>Manage sessions on your account.</span>
              <Button
                disabled={saving}
                onClick={() => {
                  if (window.confirm('Sign out your other sessions?'))
                    void action({ type: 'sign-out-others' });
                }}
              >
                Sign out other sessions
              </Button>
            </div>
          </>
        ) : security === 'Referrals' ? (
          <>
            <div className="mg-local-toolbar">
              {referralLink ? (
                <>
                  <input aria-label="Your referral link" value={referralLink} readOnly />
                  <Button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(referralLink);
                        notify('Referral link copied.');
                      } catch {
                        notify('Select the link to copy it.');
                      }
                    }}
                  >
                    Copy link
                  </Button>
                  <Button
                    onClick={() =>
                      window.open(
                        'https://wa.me/?text=' + encodeURIComponent(referralLink),
                        '_blank',
                        'noopener',
                      )
                    }
                  >
                    Share on WhatsApp
                  </Button>
                </>
              ) : (
                <>
                  <span>Share a link that credits referrals to this host account.</span>
                  {owner && (
                    <Button disabled={saving} onClick={() => void action({ type: 'referral' })}>
                      Create referral link
                    </Button>
                  )}
                </>
              )}
            </div>
            <Records
              rows={data.referrals}
              headers={['Referral', 'Stage', 'Reward', 'State']}
              label="Host referrals"
              renderRow={(referral) => (
                <tr key={referral.id}>
                  <td>
                    <strong>{referral.title}</strong>
                    <small>{dateText(text(referral.date))}</small>
                  </td>
                  <td>
                    <Status value={text(referral.status)} />
                  </td>
                  <td>{money(referral.amountMinor ?? 0)}</td>
                  <td>{text(referral.rewardStatus)}</td>
                </tr>
              )}
            />
          </>
        ) : security === 'Activity' ? (
          <Records
            rows={data.audit}
            headers={['When', 'Actor', 'Action']}
            label="Workspace settings activity"
            empty={
              owner
                ? 'No workspace settings changes recorded.'
                : 'Workspace settings history is visible to the owner.'
            }
            renderRow={(event) => (
              <tr key={event.id}>
                <td>
                  {new Date(text(event.date)).toLocaleString('en-GB', { timeZone: saved.timezone })}
                </td>
                <td>{text(event.actor)}</td>
                <td>{event.title}</td>
              </tr>
            )}
          />
        ) : (
          <div className="mg-settings-form">
            <h3>Data requests</h3>
            <p>
              NexG support handles guest identity verification and requests for access, correction
              or erasure.
            </p>
            <div className="mg-row-actions">
              <Button onClick={() => go('privacy-requests')}>View shared request status</Button>
              <Button onClick={() => go('inbox', 'new')}>Contact NexG about a data request</Button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="management-page mg-settings-page">
      <PageHeader title="Settings" subtitle="Your workspace, team and preferences." />
      <ResponsiveTabs
        items={Object.keys(settingsTabs)}
        icons={settingsTabs}
        value={tab}
        onChange={changeTab}
        label="Settings section"
      />
      <div className={'mg-settings-layout ' + (showSummary ? 'has-summary' : '')}>
        <Panel className="mg-settings-panel">{body}</Panel>
        {showSummary && (
          <aside className="mg-settings-summary" aria-label="Workspace summary">
            <Panel className="mg-summary-card">
              <h2>Your team</h2>
              <div className="mg-summary-team">
                <div className="mg-avatar-stack">
                  {activeTeam.slice(0, 4).map((member) => (
                    <Avatar key={member.id} name={member.name} size={36} />
                  ))}
                </div>
                <span>
                  <strong>
                    {activeTeam.length} team {activeTeam.length === 1 ? 'member' : 'members'}
                  </strong>
                  <small>Owners and managers</small>
                </span>
              </div>
              <Button onClick={() => changeTab('Team')}>Manage access</Button>
            </Panel>
            <Panel className="mg-summary-card">
              <h2>Guest experience</h2>
              <div className="mg-summary-guide">
                <span>
                  <Icon name="guide" size={30} />
                </span>
                <p>Guides, unit maps and QR cards.</p>
              </div>
              <Button onClick={() => changeTab('Branding')}>Manage guest branding</Button>
            </Panel>
            <Panel className="mg-summary-card mg-summary-tools">
              <h2>Workspace tools</h2>
              <div>
                <button onClick={() => showSecurity('Devices')}>
                  <Icon name="device" size={20} />
                  <span>Devices</span>
                  <Icon name="right" size={15} />
                </button>
                <button onClick={() => showSecurity('Privacy requests')}>
                  <Icon name="file" size={20} />
                  <span>Data requests</span>
                  <Icon name="right" size={15} />
                </button>
                <button onClick={() => showSecurity('Referrals')}>
                  <Icon name="team" size={20} />
                  <span>Referrals</span>
                  <Icon name="right" size={15} />
                </button>
                <button onClick={exportWorkspace}>
                  <Icon name="download" size={20} />
                  <span>Export workspace</span>
                  <Icon name="right" size={15} />
                </button>
              </div>
              <small>Access is scoped by property and role.</small>
            </Panel>
          </aside>
        )}
      </div>
      {!showSummary && (
        <div className="mg-row-actions">
          <Button onClick={exportWorkspace}>Export workspace</Button>
        </div>
      )}
    </div>
  );
}
