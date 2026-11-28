'use client';

import {
  Button,
  cn,
  DetailPanel,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nexg/ui';
import {
  BedDouble,
  Bike,
  Car,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  History as HistoryIcon,
  Minus,
  Pencil,
  Plus,
  ShoppingBag,
  Ticket,
  Upload,
  Users,
  UtensilsCrossed,
  Wifi,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import {
  addCategory,
  decideRate,
  importCategories,
  saveCategory,
  withdrawRate,
} from '@/app/settings/categories/actions';
import {
  ActionMenu,
  ConfirmAction,
  DateField,
  FieldRow,
  FilterSelect,
  FormPanel,
  IconAction,
  SearchBox,
  SelectField,
  TextArea,
  TextField,
  useRunner,
} from '@/components/portal/client-kit';
import { CategoryChip, DashCard, StatusChip, categoryIcon } from '@/components/portal/dash';
import {
  ACTION_LABEL,
  APPROVAL_LABEL,
  band,
  changes,
  chargedWithVat,
  exportRows,
  FULFILMENT,
  outsideBand,
  parsePct,
  pct,
  planImport,
  stepPct,
  type Approval,
  type CategoryRow,
  type Fulfilment,
  type HistoryRow,
  type ImportChange,
  type OverrideRow,
  type Overview,
  type VatTreatment,
} from '@/lib/category-commissions';
import { hrefWith, toCsv } from '@/lib/portal';

const PAGE = 8;

const FULFIL_ICON: Record<Fulfilment, LucideIcon> = {
  delivery: Bike,
  pickup: ShoppingBag,
  dine_in: UtensilsCrossed,
  booking: BedDouble,
  ticketing: Ticket,
  transport: Car,
  digital: Wifi,
};

const fulfilLabel = (key: Fulfilment) => FULFILMENT.find((f) => f.key === key)?.label ?? key;

function download(filename: string, rows: (string | number | null | undefined)[][]) {
  const blob = new Blob([String.fromCharCode(0xfeff), toCsv(rows)], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const dayLabel = (iso: string | null | undefined) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T12:00:00+03:00`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Africa/Nairobi',
      })
    : '—';

const whenLabel = (iso: string) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Nairobi',
      })
    : '—';

/* ──────────────────────────────────────────────────────────── the screen */

export function CategoriesScreen({
  overview,
  history,
  overrides,
  focus,
}: {
  overview: Overview;
  history: HistoryRow[];
  overrides: OverrideRow[];
  focus: string | null;
}) {
  const rows = overview.categories;
  const [q, setQ] = React.useState('');
  const [group, setGroup] = React.useState('all');
  const [status, setStatus] = React.useState('all');
  const [page, setPage] = React.useState(1);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<string | null>(
    rows.some((r) => r.category === focus)
      ? focus
      : (rows.find((r) => r.is_active)?.category ?? null),
  );
  const [drawer, setDrawer] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const { run, busy } = useRunner();

  const shown = rows.filter((r) => {
    const text = q.trim().toLowerCase();
    if (
      text &&
      !`${r.label} ${r.category} ${r.rate_group ?? ''} ${r.subcategories.map((s) => s.name).join(' ')}`
        .toLowerCase()
        .includes(text)
    )
      return false;
    if (group === 'card' && !r.rate_group) return false;
    if (group === 'off_card' && r.rate_group) return false;
    if (group === 'pending' && !r.pending) return false;
    if (status === 'active' && !r.is_active) return false;
    if (status === 'inactive' && r.is_active) return false;
    return true;
  });
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const current = Math.min(page, pages);
  const slice = shown.slice((current - 1) * PAGE, current * PAGE);
  React.useEffect(() => setPage(1), [q, group, status]);

  const row = rows.find((r) => r.category === selected) ?? null;

  const open = (category: string) => {
    setSelected(category);
    if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1280px)').matches) {
      setDrawer(true);
    }
  };

  const toggleActive = (r: CategoryRow) =>
    run(
      () => saveCategory(r.category, { is_active: !r.is_active }),
      r.is_active ? `${r.label} switched off` : `${r.label} switched on`,
    );

  const allOnPage = slice.length > 0 && slice.every((r) => picked.has(r.category));

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_27rem]">
      <DashCard
        title="Categories & Commission Rates"
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="md" leadingIcon={<Upload className="h-4 w-4" />}>
                  Import / Export <ChevronDown aria-hidden="true" className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  icon={<Download className="h-4 w-4" />}
                  onSelect={() =>
                    download(
                      `nexg-categories-${overview.today}.csv`,
                      exportRows(picked.size ? rows.filter((r) => picked.has(r.category)) : shown),
                    )
                  }
                >
                  {picked.size ? `Export ${picked.size} selected` : 'Export as CSV'}
                </DropdownMenuItem>
                {overview.can_edit && (
                  <DropdownMenuItem
                    icon={<Upload className="h-4 w-4" />}
                    onSelect={() => setImporting(true)}
                  >
                    Import from CSV
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {overview.can_add && (
              <Button
                variant="gold"
                size="md"
                leadingIcon={<Plus className="h-4 w-4" />}
                onClick={() => setAdding(true)}
              >
                Add Category
              </Button>
            )}
          </div>
        }
      >
        <p className="text-muted -mt-2 mb-4 text-sm font-semibold">
          Create and manage categories, set commission percentages, VAT and fulfilment rules.
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search categories…"
            label="Search categories"
            className="min-w-[14rem] flex-1"
          />
          <FilterSelect
            label="Rate card"
            value={group}
            onChange={setGroup}
            options={[
              { value: 'all', label: 'All Categories' },
              { value: 'card', label: 'On the rate card' },
              { value: 'off_card', label: 'Not on the rate card' },
              { value: 'pending', label: 'Waiting for approval' },
            ]}
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'All Statuses' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Switched off' },
            ]}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-[0.875rem]">
            <thead className="text-muted text-[0.8125rem] font-bold">
              <tr className="border-border border-b">
                <th className="w-10 py-2.5 pr-2">
                  <input
                    type="checkbox"
                    aria-label="Select every category on this page"
                    checked={allOnPage}
                    onChange={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        for (const r of slice) {
                          if (allOnPage) next.delete(r.category);
                          else next.add(r.category);
                        }
                        return next;
                      })
                    }
                    className="h-4 w-4 accent-[#E5A800]"
                  />
                </th>
                <th className="py-2.5 pr-3">Category</th>
                <th className="py-2.5 pr-3 text-right">Subcategories</th>
                <th className="py-2.5 pr-3 text-right">Commission</th>
                <th className="py-2.5 pr-3">VAT Treatment</th>
                <th className="py-2.5 pr-3">Fulfilment</th>
                <th className="py-2.5 pr-3">Status</th>
                <th className="py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {slice.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-muted py-10 text-center font-semibold">
                    No category matches.
                  </td>
                </tr>
              )}
              {slice.map((r) => {
                const Icon = categoryIcon(`${r.category} ${r.label}`);
                const on = r.category === selected;
                const rate = r.rate?.pct ?? overview.presets.own_delivery_pct;
                return (
                  <tr
                    key={r.category}
                    onClick={() => open(r.category)}
                    className={cn(
                      'border-border cursor-pointer border-b transition-colors last:border-0',
                      on ? 'bg-[#FFF7E0]' : 'hover:bg-bg',
                    )}
                  >
                    <td className="py-3 pr-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.label}`}
                        checked={picked.has(r.category)}
                        onChange={() =>
                          setPicked((prev) => {
                            const next = new Set(prev);
                            if (next.has(r.category)) next.delete(r.category);
                            else next.add(r.category);
                            return next;
                          })
                        }
                        className="h-4 w-4 accent-[#E5A800]"
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FFF4D6] text-[#B57A00]">
                          <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
                        </span>
                        <span className="min-w-0">
                          <span className="text-ink block truncate font-bold">{r.label}</span>
                          <span className="text-muted block truncate text-[0.8125rem] font-semibold">
                            {r.subcategories
                              .slice(0, 3)
                              .map((s) => s.name)
                              .join(', ') || r.category}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-right font-semibold tabular-nums">
                      {r.subcategories.length}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">
                      <span className="font-bold">{pct(rate)}</span>
                      {!r.rate && (
                        <span className="text-muted block text-[0.75rem] font-semibold">
                          preset
                        </span>
                      )}
                      {r.pending && (
                        <span className="block text-[0.75rem] font-semibold text-[#9A6700]">
                          {pct(r.pending.pct)} waiting
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <StatusChip tone={r.rate?.vat_treatment === 'exclusive' ? 'grey' : 'amber'}>
                        {r.rate?.vat_treatment === 'exclusive' ? 'VAT Exclusive' : 'VAT Inclusive'}
                      </StatusChip>
                    </td>
                    <td className="py-3 pr-3">
                      <span className="flex items-center gap-1.5">
                        {r.fulfilment_methods.length === 0 && <span className="text-muted">—</span>}
                        {r.fulfilment_methods.map((m) => {
                          const FIcon = FULFIL_ICON[m];
                          return (
                            <span key={m} title={fulfilLabel(m)} className="text-muted">
                              <FIcon
                                aria-hidden="true"
                                className="h-[1.1rem] w-[1.1rem]"
                                strokeWidth={1.8}
                              />
                              <span className="sr-only">{fulfilLabel(m)}</span>
                            </span>
                          );
                        })}
                      </span>
                    </td>
                    <td className="py-3 pr-3" onClick={(e) => e.stopPropagation()}>
                      <PillSwitch
                        checked={r.is_active}
                        label={`${r.label} active`}
                        disabled={!overview.can_edit || busy}
                        onChange={() => toggleActive(r)}
                      />
                    </td>
                    <td className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex items-center">
                        <IconAction label={`Edit ${r.label}`} onClick={() => open(r.category)}>
                          <Pencil />
                        </IconAction>
                        <ActionMenu
                          label={`More for ${r.label}`}
                          actions={[
                            { label: 'Edit category', onSelect: () => open(r.category) },
                            {
                              label: `Merchant overrides (${r.overrides})`,
                              onSelect: () =>
                                window.location.assign(
                                  hrefWith('/settings/categories', {
                                    tab: 'overrides',
                                    category: r.category,
                                  }),
                                ),
                            },
                            {
                              label: 'Change history',
                              onSelect: () =>
                                window.location.assign(
                                  hrefWith('/settings/categories', {
                                    tab: 'history',
                                    category: r.category,
                                  }),
                                ),
                            },
                            overview.can_edit && {
                              label: r.is_active ? 'Switch off' : 'Switch on',
                              separated: true,
                              tone: r.is_active ? 'danger' : 'default',
                              onSelect: () => toggleActive(r),
                            },
                          ]}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <p className="text-muted text-[0.875rem] font-semibold">
            Showing {shown.length === 0 ? 0 : (current - 1) * PAGE + 1} –{' '}
            {Math.min(shown.length, current * PAGE)} of {shown.length} categories
            {picked.size > 0 && ` · ${picked.size} selected`}
          </p>
          {pages > 1 && (
            <nav aria-label="Pages" className="flex items-center gap-1.5">
              <PageButton
                label="Previous page"
                disabled={current === 1}
                onClick={() => setPage(current - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </PageButton>
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <PageButton
                  key={p}
                  label={`Page ${p}`}
                  current={p === current}
                  onClick={() => setPage(p)}
                >
                  {p}
                </PageButton>
              ))}
              <PageButton
                label="Next page"
                disabled={current === pages}
                onClick={() => setPage(current + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </PageButton>
            </nav>
          )}
        </div>
      </DashCard>

      <aside className="hidden xl:sticky xl:top-4 xl:block">
        {row ? (
          <DashCard>
            <CategoryEditor
              key={`${row.category}-${row.rate?.id ?? ''}-${row.pending?.id ?? ''}`}
              row={row}
              overview={overview}
              history={history}
              overrides={overrides}
            />
          </DashCard>
        ) : (
          <DashCard>
            <p className="text-muted py-10 text-center font-semibold">
              Pick a category to edit it.
            </p>
          </DashCard>
        )}
      </aside>

      <DetailPanel
        open={drawer && !!row}
        onOpenChange={setDrawer}
        title="Edit Category"
        subtitle="Configure category details, commission and rules."
        width="lg"
      >
        {row && (
          <CategoryEditor
            key={`d-${row.category}-${row.rate?.id ?? ''}-${row.pending?.id ?? ''}`}
            row={row}
            overview={overview}
            history={history}
            overrides={overrides}
            onDone={() => setDrawer(false)}
            bare
          />
        )}
      </DetailPanel>

      <AddCategoryPanel open={adding} onOpenChange={setAdding} overview={overview} />
      <ImportPanel open={importing} onOpenChange={setImporting} overview={overview} />
    </div>
  );
}

function PageButton({
  label,
  current,
  disabled,
  onClick,
  children,
}: {
  label: string;
  current?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-[0.9375rem] font-bold tabular-nums transition-colors disabled:opacity-40',
        current
          ? 'border-[#E5A800] bg-gradient-to-b from-[#FFD24D] to-[#F0A800] text-[#1A1A1A]'
          : 'border-border text-ink hover:bg-bg',
      )}
    >
      {children}
    </button>
  );
}

/** The designs' small gold pill: saves as soon as it is pressed. */
function PillSwitch({
  checked,
  label,
  disabled,
  onChange,
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onChange}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
          'focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60',
          checked ? 'bg-gradient-to-b from-[#FFD24D] to-[#E5A800]' : 'bg-[#D9D5CC]',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
          )}
        />
      </button>
      <StatusChip tone={checked ? 'green' : 'grey'}>{checked ? 'Active' : 'Off'}</StatusChip>
    </span>
  );
}

/* ──────────────────────────────────────────────────────────── the editor */

function CategoryEditor({
  row,
  overview,
  history,
  overrides,
  onDone,
  bare = false,
}: {
  row: CategoryRow;
  overview: Overview;
  history: HistoryRow[];
  overrides: OverrideRow[];
  onDone?: () => void;
  bare?: boolean;
}) {
  const [view, setView] = React.useState<'details' | 'overrides' | 'history'>('details');
  const mine = overrides.filter((o) => o.category === row.category);
  const past = history.filter((h) => h.category === row.category);
  const Icon = categoryIcon(`${row.category} ${row.label}`);

  return (
    <div>
      {!bare && (
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF4D6] text-[#B57A00]">
            <Icon aria-hidden="true" className="h-6 w-6" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[1.25rem] font-extrabold tracking-[-0.01em]">Edit Category</h2>
            <p className="text-muted text-sm font-semibold">
              Configure category details, commission and rules.
            </p>
          </div>
        </div>
      )}
      <div
        role="tablist"
        aria-label="Edit category"
        className="border-border mb-4 flex gap-4 border-b"
      >
        {(
          [
            ['details', 'Category Details', null],
            ['overrides', 'Overrides', mine.length],
            ['history', 'History', null],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={cn(
              '-mb-px border-b-2 pb-2.5 text-[0.875rem] font-bold transition-colors',
              view === key
                ? 'border-[#E5A800] text-[#8A5C00]'
                : 'text-muted hover:text-ink border-transparent',
            )}
          >
            {label}
            {count !== null && ` (${count})`}
          </button>
        ))}
      </div>

      {view === 'details' && (
        <DetailsForm
          row={row}
          overview={overview}
          onDone={onDone}
          onOverrides={() => setView('overrides')}
        />
      )}
      {view === 'overrides' && (
        <div className="space-y-3">
          {mine.length === 0 ? (
            <p className="text-muted py-6 text-center text-sm font-semibold">
              No merchant in {row.label} has its own agreed rate.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {mine.map((o) => (
                <li key={`${o.merchant_id}-${o.term_id ?? 'legacy'}`} className="py-2.5">
                  <Link href={`/merchants/${o.merchant_id}`} className="font-bold hover:underline">
                    {o.merchant}
                  </Link>
                  <p className="text-muted text-[0.8125rem] font-semibold">
                    {pct(o.own_delivery_pct)} own delivery · {pct(o.nexg_delivery_pct)} NexG
                    delivery ·{' '}
                    {o.status === 'pending'
                      ? 'waiting for approval'
                      : o.status === 'scheduled'
                        ? `from ${dayLabel(o.starts_on)}`
                        : 'in force'}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted text-[0.8125rem] font-semibold">
            Agreed rates are asked for and approved on each merchant&apos;s page.
          </p>
        </div>
      )}
      {view === 'history' && (
        <ul className="divide-border max-h-[32rem] divide-y overflow-y-auto">
          {past.length === 0 && (
            <li className="text-muted py-6 text-center text-sm font-semibold">No changes yet.</li>
          )}
          {past.map((h) => (
            <li key={h.id} className="py-2.5 text-[0.8125rem]">
              <p className="font-bold">{ACTION_LABEL[h.action] ?? h.action}</p>
              <p className="text-muted font-semibold">
                {whenLabel(h.at)} · {h.actor ?? 'Unknown'}
              </p>
              <ul className="mt-1 space-y-0.5">
                {changes(h).map((c) => (
                  <li key={c.field}>
                    {c.field}: <span className="text-muted line-through">{c.before}</span> →{' '}
                    <strong>{c.after}</strong>
                  </li>
                ))}
              </ul>
              {h.reason && <p className="text-muted mt-1 italic">“{h.reason}”</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DetailsForm({
  row,
  overview,
  onDone,
  onOverrides,
}: {
  row: CategoryRow;
  overview: Overview;
  onDone?: () => void;
  onOverrides: () => void;
}) {
  const { run, busy } = useRunner();
  const today = overview.today;
  const start = row.rate?.starts_on && row.rate.starts_on > today ? row.rate.starts_on : today;
  const initial = React.useMemo(
    () => ({
      label: row.label,
      pct: row.rate ? row.rate.pct.toFixed(2) : '',
      nexg: row.rate?.nexg_delivery_pct != null ? row.rate.nexg_delivery_pct.toFixed(2) : '',
      vat: (row.rate?.vat_treatment ?? 'inclusive') as VatTreatment,
      from: start,
      to: row.rate?.ends_on ?? '',
      bandMin: row.band_min_pct != null ? String(Number(row.band_min_pct)) : '',
      bandMax: row.band_max_pct != null ? String(Number(row.band_max_pct)) : '',
      methods: row.fulfilment_methods,
      approval: row.approval,
      active: row.is_active,
      overridesOn: row.merchant_overrides,
    }),
    [row, start],
  );
  const [f, setF] = React.useState(initial);
  const [reason, setReason] = React.useState('');
  const [showAllSubs, setShowAllSubs] = React.useState(false);
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));

  const rateChanged =
    f.pct !== initial.pct ||
    f.nexg !== initial.nexg ||
    f.vat !== initial.vat ||
    f.from !== initial.from ||
    f.to !== initial.to;
  const parsed = parsePct(f.pct);
  const parsedNexg = parsePct(f.nexg);
  const rateValue = parsed.ok ? parsed.value : null;
  const out = outsideBand(rateValue, {
    band_min_pct: parsePct(f.bandMin).ok
      ? (parsePct(f.bandMin) as { value: number | null }).value
      : null,
    band_max_pct: parsePct(f.bandMax).ok
      ? (parsePct(f.bandMax) as { value: number | null }).value
      : null,
  });
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const canEdit = overview.can_edit;

  const submit = async () => {
    const payload: Record<string, unknown> = {};
    if (f.label.trim() !== initial.label) payload.label = f.label.trim();
    if (f.active !== initial.active) payload.is_active = f.active;
    if (f.bandMin !== initial.bandMin || f.bandMax !== initial.bandMax) {
      const lo = parsePct(f.bandMin);
      const hi = parsePct(f.bandMax);
      if (!lo.ok || !hi.ok)
        return run(async () => ({ ok: false, message: 'A band is a percentage from 0 to 100.' }));
      payload.band_min_pct = lo.value;
      payload.band_max_pct = hi.value;
    }
    if ([...f.methods].sort().join() !== [...initial.methods].sort().join())
      payload.fulfilment_methods = f.methods;
    if (f.approval !== initial.approval) payload.approval = f.approval;
    if (f.overridesOn !== initial.overridesOn) payload.merchant_overrides = f.overridesOn;
    if (rateChanged) {
      if (!parsed.ok || parsed.value === null || !parsedNexg.ok) {
        return run(async () => ({
          ok: false,
          message: 'Commission is a percentage from 0 to 100, two decimals at most.',
        }));
      }
      if (!reason.trim()) {
        return run(async () => ({
          ok: false,
          message: 'Say why the rate changes, for the approver and the history.',
        }));
      }
      payload.rate = {
        pct: parsed.value,
        nexg_delivery_pct: parsedNexg.value,
        vat_treatment: f.vat,
        starts_on: f.from,
        ends_on: f.to || null,
        reason: reason.trim(),
      };
    }
    if (reason.trim()) payload.reason = reason.trim();
    if (Object.keys(payload).length === 0) return false;
    const ok = await run(() => saveCategory(row.category, payload));
    if (ok) onDone?.();
    return ok;
  };

  const subs = showAllSubs ? row.subcategories : row.subcategories.slice(0, 3);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        await submit();
      }}
    >
      {row.pending && <PendingCard row={row} overview={overview} />}

      <FieldRow>
        <TextField
          label="Category Name"
          required
          value={f.label}
          maxLength={100}
          disabled={!canEdit}
          onChange={(e) => set('label', e.target.value)}
        />
        <TextField
          label="Category Code"
          required
          value={row.category.toUpperCase()}
          disabled
          readOnly
        />
      </FieldRow>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">Subcategories</span>
        <div className="border-border-strong flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5">
          {row.subcategories.length === 0 && <span className="text-muted px-1 text-sm">None</span>}
          {subs.map((s) => (
            <span
              key={s.id}
              className="bg-bg rounded-md px-2 py-0.5 text-[0.8125rem] font-semibold"
            >
              {s.name}
            </span>
          ))}
          {row.subcategories.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllSubs((v) => !v)}
              className="rounded-md px-2 py-0.5 text-[0.8125rem] font-bold text-[#8A5C00] hover:bg-[#FFF4D6]"
            >
              {showAllSubs ? 'Show fewer' : `+${row.subcategories.length - 3}`}
            </button>
          )}
        </div>
        <p className="text-muted-light text-xs">
          Edited on{' '}
          <Link href="/categories" className="underline">
            Merchants › Categories
          </Link>
          , with the onboarding questions they bring.
        </p>
      </div>

      <FieldRow>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`pct-${row.category}`} className="text-sm font-bold">
            Commission Percentage<span className="text-danger ml-0.5">*</span>
          </label>
          <div className="flex items-center gap-2">
            <div className="border-border-strong focus-within:ring-gold flex h-11 flex-1 items-center rounded-lg border focus-within:ring-2">
              <input
                id={`pct-${row.category}`}
                inputMode="decimal"
                value={f.pct}
                placeholder={pct(overview.presets.own_delivery_pct)}
                disabled={!canEdit}
                onChange={(e) => set('pct', e.target.value)}
                aria-describedby={`pct-${row.category}-hint`}
                className="min-w-0 flex-1 bg-transparent px-3 text-base tabular-nums focus:outline-none md:text-sm"
              />
              <span className="flex flex-col">
                <button
                  type="button"
                  aria-label="Raise by 0.25"
                  disabled={!canEdit}
                  onClick={() =>
                    set(
                      'pct',
                      stepPct(f.pct || String(overview.presets.own_delivery_pct ?? 0), 0.25),
                    )
                  }
                  className="text-muted hover:text-ink px-2"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Lower by 0.25"
                  disabled={!canEdit}
                  onClick={() =>
                    set(
                      'pct',
                      stepPct(f.pct || String(overview.presets.own_delivery_pct ?? 0), -0.25),
                    )
                  }
                  className="text-muted hover:text-ink px-2"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
            <span className="text-muted text-sm font-bold">%</span>
          </div>
          <p
            id={`pct-${row.category}-hint`}
            className={cn('text-xs', out ? 'font-bold text-[#B5560B]' : 'text-muted-light')}
          >
            {band(row) ? `Band ${band(row)}` : 'Not on the rate card'}
            {out && ' · outside the band'}
            {!row.rate && ' · on the preset until a rate is set'}
          </p>
        </div>
        <SelectField
          label="VAT Treatment"
          required
          value={f.vat}
          disabled={!canEdit}
          onChange={(e) => set('vat', e.target.value as VatTreatment)}
          options={[
            { value: 'inclusive', label: 'VAT Inclusive' },
            { value: 'exclusive', label: 'VAT Exclusive' },
          ]}
          hint={
            f.vat === 'exclusive' && rateValue !== null
              ? `Charged ${pct(chargedWithVat(rateValue, 'exclusive', overview.presets.vat_pct))} with ${pct(overview.presets.vat_pct, 0)} VAT`
              : 'Charged as written; VAT is split out in the books'
          }
        />
      </FieldRow>

      <TextField
        label="NexG-delivery rate (%)"
        inputMode="decimal"
        value={f.nexg}
        disabled={!canEdit}
        placeholder={`Preset ${pct(overview.presets.nexg_delivery_pct, 0)}`}
        onChange={(e) => set('nexg', e.target.value)}
        hint="For orders a NexG rider delivers. Blank keeps the preset."
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">
          Fulfilment Method<span className="text-danger ml-0.5">*</span>
        </span>
        <div className="flex flex-wrap gap-1.5">
          {FULFILMENT.map((m) => {
            const on = f.methods.includes(m.key);
            const MIcon = FULFIL_ICON[m.key];
            return (
              <button
                key={m.key}
                type="button"
                aria-pressed={on}
                disabled={!canEdit}
                onClick={() =>
                  set('methods', on ? f.methods.filter((x) => x !== m.key) : [...f.methods, m.key])
                }
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.8125rem] font-semibold transition-colors',
                  on
                    ? 'border-[#E5A800] bg-[#FFF4D6] text-[#8A5C00]'
                    : 'border-border text-muted hover:bg-bg',
                )}
              >
                <MIcon aria-hidden="true" className="h-4 w-4" />
                {m.label}
                {on && <X aria-hidden="true" className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span className="text-sm font-bold">Effective Period</span>
        <FieldRow>
          <DateField
            label="From"
            required
            value={f.from}
            min={today}
            onChange={(d) => set('from', d)}
            hint={rateChanged ? 'The new rate applies from this day' : undefined}
          />
          <DateField
            label="To"
            value={f.to}
            min={f.from || today}
            onChange={(d) => set('to', d)}
            hint={f.to ? undefined : 'No end date'}
          />
        </FieldRow>
        {f.to && (
          <button
            type="button"
            onClick={() => set('to', '')}
            className="text-muted mt-1 text-xs font-bold underline"
          >
            Clear the end date
          </button>
        )}
      </div>

      <FieldRow>
        <TextField
          label="Band from (%)"
          inputMode="decimal"
          value={f.bandMin}
          disabled={!canEdit}
          onChange={(e) => set('bandMin', e.target.value)}
        />
        <TextField
          label="Band to (%)"
          inputMode="decimal"
          value={f.bandMax}
          disabled={!canEdit}
          onChange={(e) => set('bandMax', e.target.value)}
        />
      </FieldRow>

      <FieldRow>
        <SelectField
          label="Approval Requirement"
          required
          value={f.approval}
          disabled={!overview.can_decide}
          onChange={(e) => set('approval', e.target.value as Approval)}
          options={(Object.keys(APPROVAL_LABEL) as Approval[]).map((k) => ({
            value: k,
            label: APPROVAL_LABEL[k],
          }))}
          hint={overview.can_decide ? undefined : 'Finance or a super admin changes this'}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Status</span>
          <span className="flex h-11 items-center">
            <PillSwitch
              checked={f.active}
              label="Category active"
              disabled={!canEdit}
              onChange={() => set('active', !f.active)}
            />
          </span>
        </div>
      </FieldRow>

      <div className="rounded-xl border border-[#F2D27A] bg-[#FFF7E0] p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.9375rem] font-extrabold">Merchant-Specific Commission Override</p>
            <p className="text-muted text-[0.8125rem] font-semibold">
              Allow custom commission rates for selected merchants.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={f.overridesOn}
            aria-label="Allow merchant-specific rates"
            disabled={!overview.can_decide}
            onClick={() => set('overridesOn', !f.overridesOn)}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60',
              f.overridesOn ? 'bg-gradient-to-b from-[#FFD24D] to-[#E5A800]' : 'bg-[#D9D5CC]',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
                f.overridesOn ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
              )}
            />
          </button>
        </div>
        {!f.overridesOn && row.overrides > 0 && (
          <p className="mt-2 text-[0.8125rem] font-bold text-[#B5560B]">
            {row.overrides} merchant{row.overrides === 1 ? '' : 's'} with an agreed rate would be
            charged the category rate instead.
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="mt-2.5"
          leadingIcon={<Users className="h-4 w-4" />}
          onClick={onOverrides}
        >
          Manage Overrides ({row.overrides})
        </Button>
      </div>

      {(rateChanged || dirty) && canEdit && (
        <TextArea
          label={rateChanged ? 'Why the rate changes' : 'Note (optional)'}
          required={rateChanged}
          value={reason}
          maxLength={1000}
          onChange={(e) => setReason(e.target.value)}
          hint={
            rateChanged
              ? row.approval === 'two_person' || !overview.can_decide
                ? 'A second person approves the new rate before it applies.'
                : 'Single approval: it applies from its start day as soon as you save.'
              : undefined
          }
        />
      )}

      {canEdit && (
        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="outline"
            onClick={() => (onDone ? onDone() : (setF(initial), setReason('')))}
          >
            Cancel
          </Button>
          <Button type="submit" variant="gold" loading={busy} disabled={!dirty}>
            Save Changes
          </Button>
        </div>
      )}
    </form>
  );
}

function PendingCard({ row, overview }: { row: CategoryRow; overview: Overview }) {
  const { run } = useRunner();
  const p = row.pending!;
  return (
    <div className="rounded-xl border border-[#F2D27A] bg-[#FFF7E0] p-3.5 text-[0.8125rem]">
      <p className="text-[0.9375rem] font-extrabold">Waiting for approval</p>
      <p className="mt-0.5 font-semibold">
        {pct(p.pct)} own delivery
        {p.nexg_delivery_pct != null && ` · ${pct(p.nexg_delivery_pct)} NexG delivery`} ·{' '}
        {p.vat_treatment === 'exclusive' ? 'VAT exclusive' : 'VAT inclusive'} · from{' '}
        {dayLabel(p.starts_on)}
        {p.ends_on && ` to ${dayLabel(p.ends_on)}`}
      </p>
      <p className="text-muted mt-0.5 font-semibold">
        Asked by {p.requested_by ?? 'someone'} on {whenLabel(p.requested_at)}: “{p.reason}”
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {overview.can_decide && !p.mine && (
          <>
            <ConfirmAction
              tone="black"
              trigger={
                <Button size="sm" variant="black">
                  Approve
                </Button>
              }
              title={`Approve ${pct(p.pct)} for ${row.label}?`}
              body="Merchants in this category are charged it from its start day. Orders already placed keep their rate."
              confirmLabel="Approve"
              reason={{ label: 'Note (optional)' }}
              onConfirm={(note) => run(() => decideRate(p.id, true, note))}
            />
            <ConfirmAction
              trigger={
                <Button size="sm" variant="outline">
                  Reject
                </Button>
              }
              title="Reject this rate?"
              confirmLabel="Reject"
              reason={{ label: 'Why', required: true }}
              onConfirm={(note) => run(() => decideRate(p.id, false, note))}
            />
          </>
        )}
        {(p.mine || overview.can_decide) && (
          <ConfirmAction
            trigger={
              <Button size="sm" variant="ghost">
                Withdraw
              </Button>
            }
            title="Withdraw this request?"
            confirmLabel="Withdraw"
            onConfirm={() => run(() => withdrawRate(p.id))}
          />
        )}
        {p.mine && !overview.can_decide && (
          <span className="text-muted self-center font-semibold">
            Somebody in Finance approves it.
          </span>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── add, import */

function AddCategoryPanel({
  open,
  onOpenChange,
  overview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  overview: Overview;
}) {
  const { run, busy } = useRunner();
  const blank = {
    code: '',
    label: '',
    pct: '',
    vat: 'inclusive' as VatTreatment,
    bandMin: '',
    bandMax: '',
    from: overview.today,
    reason: '',
  };
  const [f, setF] = React.useState(blank);
  const [methods, setMethods] = React.useState<Fulfilment[]>([]);
  React.useEffect(() => {
    if (open) {
      setF({ ...blank, from: overview.today });
      setMethods([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the panel opens
  }, [open]);

  return (
    <FormPanel
      open={open}
      onOpenChange={onOpenChange}
      title="Add Category"
      subtitle="It starts switched off. Merchants can pick it once it is also added to the master category list."
      submitLabel="Add category"
      busy={busy}
      onSubmit={async () => {
        const code = f.code.trim().toLowerCase();
        const payload: Record<string, unknown> = {
          label: f.label.trim(),
          fulfilment_methods: methods,
        };
        const lo = parsePct(f.bandMin);
        const hi = parsePct(f.bandMax);
        const rate = parsePct(f.pct);
        if (!lo.ok || !hi.ok || !rate.ok) {
          return run(async () => ({
            ok: false,
            message: 'Rates and bands are percentages from 0 to 100.',
          }));
        }
        if (lo.value !== null || hi.value !== null) {
          payload.band_min_pct = lo.value;
          payload.band_max_pct = hi.value;
        }
        if (rate.value !== null) {
          payload.rate = {
            pct: rate.value,
            vat_treatment: f.vat,
            starts_on: f.from,
            reason: f.reason.trim() || 'Rate set when the category was added',
          };
        }
        return run(() => addCategory(code, payload));
      }}
    >
      <FieldRow>
        <TextField
          label="Category Name"
          required
          maxLength={100}
          value={f.label}
          onChange={(e) =>
            setF((p) => ({
              ...p,
              label: e.target.value,
              code: p.code === '' || p.code === slug(p.label) ? slug(e.target.value) : p.code,
            }))
          }
        />
        <TextField
          label="Category Code"
          required
          value={f.code}
          pattern="[a-z][a-z0-9_]{1,63}"
          title="Lower case letters, digits and underscores"
          onChange={(e) => setF((p) => ({ ...p, code: e.target.value }))}
          hint="Lower case, e.g. home_services. It cannot change later."
        />
      </FieldRow>
      <FieldRow>
        <TextField
          label="Commission Percentage"
          inputMode="decimal"
          value={f.pct}
          placeholder={`Preset ${pct(overview.presets.own_delivery_pct, 0)}`}
          onChange={(e) => setF((p) => ({ ...p, pct: e.target.value }))}
        />
        <SelectField
          label="VAT Treatment"
          value={f.vat}
          onChange={(e) => setF((p) => ({ ...p, vat: e.target.value as VatTreatment }))}
          options={[
            { value: 'inclusive', label: 'VAT Inclusive' },
            { value: 'exclusive', label: 'VAT Exclusive' },
          ]}
        />
      </FieldRow>
      <FieldRow>
        <TextField
          label="Band from (%)"
          inputMode="decimal"
          value={f.bandMin}
          onChange={(e) => setF((p) => ({ ...p, bandMin: e.target.value }))}
        />
        <TextField
          label="Band to (%)"
          inputMode="decimal"
          value={f.bandMax}
          onChange={(e) => setF((p) => ({ ...p, bandMax: e.target.value }))}
        />
      </FieldRow>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">Fulfilment Methods</span>
        <div className="flex flex-wrap gap-1.5">
          {FULFILMENT.map((m) => {
            const on = methods.includes(m.key);
            return (
              <button
                key={m.key}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setMethods((prev) => (on ? prev.filter((x) => x !== m.key) : [...prev, m.key]))
                }
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-[0.8125rem] font-semibold',
                  on ? 'border-[#E5A800] bg-[#FFF4D6] text-[#8A5C00]' : 'border-border text-muted',
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
      {f.pct.trim() && (
        <>
          <DateField
            label="Rate effective from"
            required
            value={f.from}
            min={overview.today}
            onChange={(d) => setF((p) => ({ ...p, from: d }))}
          />
          <TextArea
            label="Why this rate"
            value={f.reason}
            maxLength={1000}
            onChange={(e) => setF((p) => ({ ...p, reason: e.target.value }))}
          />
        </>
      )}
    </FormPanel>
  );
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'c_$1')
    .slice(0, 64);
}

function ImportPanel({
  open,
  onOpenChange,
  overview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  overview: Overview;
}) {
  const { run, busy } = useRunner();
  const [plan, setPlan] = React.useState<{ changes: ImportChange[]; errors: string[] } | null>(
    null,
  );
  const [from, setFrom] = React.useState(overview.today);
  const [text, setText] = React.useState('');
  const [reason, setReason] = React.useState('');
  React.useEffect(() => {
    if (!open) {
      setPlan(null);
      setText('');
      setReason('');
    }
  }, [open]);
  React.useEffect(() => {
    if (text) setPlan(planImport(text, overview.categories, from));
  }, [text, from, overview.categories]);

  return (
    <FormPanel
      open={open}
      onOpenChange={onOpenChange}
      title="Import categories"
      subtitle="Upload a CSV in the export's layout. Only what differs is changed; each new rate waits for its approver as usual."
      submitLabel={
        plan?.changes.length
          ? `Apply ${plan.changes.length} change${plan.changes.length === 1 ? '' : 's'}`
          : 'Apply'
      }
      busy={busy}
      width="lg"
      onSubmit={async () => {
        if (!plan || plan.changes.length === 0) {
          return run(async () => ({
            ok: false,
            message: 'Nothing in the file changes a category.',
          }));
        }
        if (plan.errors.length) {
          return run(async () => ({ ok: false, message: 'Fix the lines listed first.' }));
        }
        if (!reason.trim()) {
          return run(async () => ({
            ok: false,
            message: 'Say why, for the approver and the history.',
          }));
        }
        return run(() =>
          importCategories(
            plan.changes.map((c) => ({ category: c.category, payload: c.payload })),
            reason.trim(),
          ),
        );
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          leadingIcon={<Download className="h-4 w-4" />}
          onClick={() =>
            download(`nexg-categories-${overview.today}.csv`, exportRows(overview.categories))
          }
        >
          Download the current file
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="category-import-file" className="text-sm font-bold">
          CSV file<span className="text-danger ml-0.5">*</span>
        </label>
        <input
          id="category-import-file"
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            setText(file ? await file.text() : '');
          }}
          className="text-sm"
        />
      </div>
      <DateField
        label="New rates start on"
        required
        value={from}
        min={overview.today}
        onChange={setFrom}
        hint="A row's own later effective_from wins."
      />
      {plan && (
        <div className="space-y-2">
          {plan.errors.length > 0 && (
            <ul
              role="alert"
              className="bg-danger-bg text-danger space-y-1 rounded-lg px-3 py-2 text-sm font-semibold"
            >
              {plan.errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}
          {plan.changes.length === 0 && plan.errors.length === 0 && (
            <p className="text-muted text-sm font-semibold">
              The file matches the categories as they are.
            </p>
          )}
          {plan.changes.length > 0 && (
            <ul className="border-border divide-border divide-y rounded-lg border text-sm">
              {plan.changes.map((c) => (
                <li key={c.category} className="px-3 py-2">
                  <p className="font-bold">{c.label}</p>
                  <p className="text-muted font-semibold">{c.summary.join(' · ')}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <TextArea
        label="Why"
        required
        value={reason}
        maxLength={1000}
        onChange={(e) => setReason(e.target.value)}
      />
    </FormPanel>
  );
}

/* ──────────────────────────────────────────────────── the other two tabs */

export function OverridesTable({ rows, focus }: { rows: OverrideRow[]; focus: string | null }) {
  const [category, setCategory] = React.useState(focus ?? 'all');
  const cats = [
    ...new Map(rows.map((r) => [r.category, r.category_label ?? r.category])).entries(),
  ];
  const shown = rows.filter((r) => category === 'all' || r.category === category);
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <FilterSelect
          label="Category"
          value={category}
          onChange={setCategory}
          options={[
            { value: 'all', label: 'All Categories' },
            ...cats.map(([value, label]) => ({ value, label })),
          ]}
        />
      </div>
      <table className="w-full min-w-[52rem] text-left text-[0.875rem]">
        <thead className="text-muted text-[0.8125rem] font-bold">
          <tr className="border-border border-b">
            <th className="py-2 pr-3">Merchant</th>
            <th className="py-2 pr-3">Category</th>
            <th className="py-2 pr-3 text-right">Own delivery</th>
            <th className="py-2 pr-3 text-right">NexG delivery</th>
            <th className="py-2 pr-3 text-right">Category rate</th>
            <th className="py-2 pr-3 text-right">Charged now</th>
            <th className="py-2 pr-3">Dates</th>
            <th className="py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && (
            <tr>
              <td colSpan={8} className="text-muted py-10 text-center font-semibold">
                No merchant has its own agreed rate{category === 'all' ? '' : ' in this category'}.
              </td>
            </tr>
          )}
          {shown.map((r) => (
            <tr
              key={`${r.merchant_id}-${r.term_id ?? 'legacy'}`}
              className="border-border border-b last:border-0"
            >
              <td className="py-2.5 pr-3">
                <Link href={`/merchants/${r.merchant_id}`} className="font-bold hover:underline">
                  {r.merchant}
                </Link>
                <span className="text-muted block text-[0.75rem] font-semibold">
                  {r.own_riders ? 'Own riders' : 'NexG riders deliver'}
                </span>
              </td>
              <td className="py-2.5 pr-3">
                <CategoryChip label={r.category_label ?? r.category} />
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{pct(r.own_delivery_pct)}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{pct(r.nexg_delivery_pct)}</td>
              <td className="text-muted py-2.5 pr-3 text-right tabular-nums">
                {pct(r.category_pct)}
              </td>
              <td className="py-2.5 pr-3 text-right font-bold tabular-nums">
                {pct(r.charged_pct)}
              </td>
              <td className="py-2.5 pr-3 text-[0.8125rem]">
                {r.starts_on
                  ? `${dayLabel(r.starts_on)} – ${r.ends_on ? dayLabel(r.ends_on) : 'no end'}`
                  : 'Undated'}
              </td>
              <td className="py-2.5">
                <StatusChip
                  tone={
                    r.status === 'pending'
                      ? 'amber'
                      : r.status === 'scheduled'
                        ? 'blue'
                        : r.overrides_allowed
                          ? 'green'
                          : 'grey'
                  }
                >
                  {r.status === 'pending'
                    ? 'Waiting'
                    : r.status === 'scheduled'
                      ? 'Starts later'
                      : r.overrides_allowed
                        ? 'In force'
                        : 'Overrides off'}
                </StatusChip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function HistoryTable({
  rows,
  categories,
  focus,
}: {
  rows: HistoryRow[];
  categories: CategoryRow[];
  focus: string | null;
}) {
  const [category, setCategory] = React.useState(focus ?? 'all');
  const shown = rows.filter((r) => category === 'all' || r.category === category);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <FilterSelect
          label="Category"
          value={category}
          onChange={setCategory}
          options={[
            { value: 'all', label: 'All Categories' },
            ...categories.map((c) => ({ value: c.category, label: c.label })),
          ]}
        />
        <Button
          variant="outline"
          size="sm"
          leadingIcon={<HistoryIcon className="h-4 w-4" />}
          onClick={() =>
            download('nexg-category-commission-history.csv', [
              ['when', 'category', 'change', 'field', 'old', 'new', 'reason', 'by'],
              ...shown.flatMap((h) => {
                const list = changes(h);
                return (list.length ? list : [{ field: '', before: '', after: '' }]).map((c) => [
                  h.at,
                  h.label,
                  ACTION_LABEL[h.action] ?? h.action,
                  c.field,
                  c.before,
                  c.after,
                  h.reason,
                  h.actor,
                ]);
              }),
            ])
          }
        >
          Export history
        </Button>
      </div>
      <table className="w-full min-w-[52rem] text-left text-[0.875rem]">
        <thead className="text-muted text-[0.8125rem] font-bold">
          <tr className="border-border border-b">
            <th className="py-2 pr-3">When</th>
            <th className="py-2 pr-3">Category</th>
            <th className="py-2 pr-3">Change</th>
            <th className="py-2 pr-3">Old → New</th>
            <th className="py-2 pr-3">Reason</th>
            <th className="py-2">By</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && (
            <tr>
              <td colSpan={6} className="text-muted py-10 text-center font-semibold">
                No changes yet.
              </td>
            </tr>
          )}
          {shown.map((h) => (
            <tr key={h.id} className="border-border border-b align-top last:border-0">
              <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums">{whenLabel(h.at)}</td>
              <td className="py-2.5 pr-3 font-bold">{h.label}</td>
              <td className="py-2.5 pr-3">{ACTION_LABEL[h.action] ?? h.action}</td>
              <td className="py-2.5 pr-3 text-[0.8125rem]">
                <ul className="space-y-0.5">
                  {changes(h).map((c) => (
                    <li key={c.field}>
                      {c.field}: <span className="text-muted">{c.before}</span> →{' '}
                      <strong>{c.after}</strong>
                    </li>
                  ))}
                </ul>
              </td>
              <td className="text-muted max-w-[18rem] py-2.5 pr-3 text-[0.8125rem]">
                {h.reason ?? '—'}
              </td>
              <td className="py-2.5 font-semibold">{h.actor ?? 'Unknown'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
