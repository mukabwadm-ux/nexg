'use client';

import { DataTable, EmptyState, type ColumnDef } from '@nexg/ui';
import { ArrowLeftRight } from 'lucide-react';
import * as React from 'react';

import { ShareDonut } from '@/components/charts';
import { ExportButton, FilterSelect, SearchBox, useShowMore } from '@/components/portal/client-kit';
import { describe, type ActivityRow } from '@/components/company/feeds';
import type { StockRow } from '@/components/company/inventory';
import { PanelHead, Pill, Sheet } from '@/components/portal/kit';
import { dateTime, kes, kesShort, quantity, STOCK_STATUS, type Tone } from '@/lib/company';

const KIND: Record<string, { label: string; tone: Tone }> = {
  'stock:in': { label: 'Stock In', tone: 'green' },
  'stock:out': { label: 'Stock Out', tone: 'red' },
  'stock:transfer': { label: 'Transfer', tone: 'gold' },
  'stock:adjust': { label: 'Count', tone: 'blue' },
  'asset:maintenance_scheduled': { label: 'Service Booked', tone: 'amber' },
  'asset:maintenance_started': { label: 'Maintenance', tone: 'amber' },
  'asset:maintenance_done': { label: 'Maintenance Done', tone: 'green' },
  'asset:assigned': { label: 'Handed Over', tone: 'blue' },
  'asset:returned': { label: 'Handed Back', tone: 'green' },
  'asset:moved': { label: 'Moved', tone: 'gold' },
  'asset:registered': { label: 'Registered', tone: 'purple' },
  'asset:updated': { label: 'Changed', tone: 'grey' },
  'asset:retired': { label: 'Retired', tone: 'grey' },
  'asset:lost': { label: 'Lost', tone: 'red' },
  'asset:restored': { label: 'Back in Use', tone: 'green' },
};

/** Every stock movement and equipment event in the period. */
export function MovementsTable({ rows, period }: { rows: ActivityRow[]; period: string }) {
  const [q, setQ] = React.useState('');
  const [kind, setKind] = React.useState('all');
  const term = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (kind === 'all' ||
        (kind === 'stock'
          ? r.source === 'stock'
          : kind === 'asset'
            ? r.source === 'asset'
            : `${r.source}:${r.kind}` === kind)) &&
      (!term ||
        `${r.subject} ${r.from_location ?? ''} ${r.to_location ?? ''} ${r.detail ?? ''} ${r.actor ?? ''}`
          .toLowerCase()
          .includes(term)),
  );
  const { shown: page, more } = useShowMore(shown, 30);

  const columns: ColumnDef<ActivityRow, unknown>[] = [
    {
      id: 'at',
      accessorFn: (r) => r.at,
      header: 'When',
      cell: ({ row: { original: r } }) => (
        <span className="whitespace-nowrap tabular-nums">{dateTime(r.at)}</span>
      ),
    },
    {
      id: 'kind',
      accessorFn: (r) => `${r.source}:${r.kind}`,
      header: 'What',
      cell: ({ row: { original: r } }) => {
        const k = KIND[`${r.source}:${r.kind}`];
        return <Pill tone={k?.tone ?? 'grey'}>{k?.label ?? r.kind}</Pill>;
      },
    },
    {
      id: 'subject',
      accessorFn: (r) => r.subject,
      header: 'Item',
      cell: ({ row: { original: r } }) => <span className="font-semibold">{r.subject}</span>,
    },
    {
      id: 'qty',
      accessorFn: (r) => Number(r.quantity ?? 0),
      header: 'Quantity',
      cell: ({ row: { original: r } }) =>
        r.source === 'stock' ? (
          <span className="tabular-nums">
            {r.kind === 'out' || (r.kind === 'adjust' && r.from_location) ? '−' : '+'}
            {quantity(r.quantity, r.unit)}
          </span>
        ) : (
          <span className="text-muted-light">—</span>
        ),
    },
    {
      id: 'where',
      accessorFn: (r) => `${r.from_location ?? ''} ${r.to_location ?? ''}`,
      header: 'Where',
      cell: ({ row: { original: r } }) => (
        <span className="text-muted">
          {r.source === 'stock' && r.kind === 'transfer'
            ? `${r.from_location} → ${r.to_location}`
            : (r.to_location ?? r.from_location ?? '—')}
        </span>
      ),
    },
    {
      id: 'detail',
      accessorFn: (r) => describe(r).line,
      header: 'Details',
      enableSorting: false,
      cell: ({ row: { original: r } }) => (
        <span className="text-muted block max-w-[18rem] truncate">
          {r.detail ?? r.reason ?? (r.cost_cents != null ? kes(r.cost_cents) : '—')}
        </span>
      ),
    },
    {
      id: 'actor',
      accessorFn: (r) => r.actor ?? '',
      header: 'By',
      cell: ({ row: { original: r } }) => <span className="text-muted">{r.actor ?? '—'}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PanelHead title="Stock Movements" aside={period}>
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search movements…"
          label="Search movements"
          className="w-full sm:w-60"
        />
        <FilterSelect
          label="Kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'Everything' },
            { value: 'stock', label: 'Stock Only' },
            { value: 'stock:in', label: 'Stock In' },
            { value: 'stock:out', label: 'Stock Out' },
            { value: 'stock:transfer', label: 'Transfers' },
            { value: 'stock:adjust', label: 'Counts' },
            { value: 'asset', label: 'Equipment Only' },
          ]}
        />
        <ExportButton
          filename={`company-stock-movements.csv`}
          rows={() => [
            ['When', 'What', 'Item', 'Quantity', 'Unit', 'From', 'To', 'Details', 'By'],
            ...shown.map((r) => [
              dateTime(r.at),
              KIND[`${r.source}:${r.kind}`]?.label ?? r.kind,
              r.subject,
              r.quantity,
              r.unit,
              r.from_location,
              r.to_location,
              r.detail ?? r.reason,
              r.actor,
            ]),
          ]}
        />
      </PanelHead>
      {shown.length === 0 ? (
        <EmptyState
          icon={<ArrowLeftRight className="h-5 w-5" />}
          title={rows.length ? 'Nothing matches' : 'Nothing moved in this period'}
          description={rows.length ? 'Try another search or kind.' : 'Pick a longer period above.'}
        />
      ) : (
        <>
          <DataTable caption="Stock movements" columns={columns} data={page} />
          {more}
        </>
      )}
    </div>
  );
}

/** Where the money sits: stock value by category and by location. */
export function InventoryReports({
  stock,
  stockValue,
  assetValue,
}: {
  stock: StockRow[];
  stockValue: string;
  assetValue: string;
}) {
  const sum = (key: (r: StockRow) => string, label: (r: StockRow) => string) => {
    const m = new Map<string, { key: string; label: string; value: number }>();
    for (const r of stock) {
      const k = key(r);
      const cur = m.get(k) ?? { key: k, label: label(r), value: 0 };
      cur.value += r.value_cents;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.value - a.value);
  };
  const byCategory = sum(
    (r) => r.category_id,
    (r) => r.category_name,
  );
  const byLocation = sum(
    (r) => r.location_id,
    (r) => r.location_name,
  );
  const total = byCategory.reduce((s, c) => s + c.value, 0);
  const top = byCategory.slice(0, 6);
  const rest = byCategory.slice(6).reduce((s, c) => s + c.value, 0);
  const slices = [
    ...top.map((c) => ({ key: c.key, label: c.label, value: Math.round(c.value / 100) })),
    ...(rest > 0 ? [{ key: 'rest', label: 'Everything Else', value: Math.round(rest / 100) }] : []),
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Sheet>
        <PanelHead
          title="Stock Value by Category"
          aside={`${stockValue} on hand · ${assetValue} in equipment`}
        >
          <ExportButton
            label="Export Stock"
            filename="company-stock.csv"
            rows={() => [
              [
                'Item',
                'SKU',
                'Category',
                'Location',
                'Quantity',
                'Unit',
                'Unit cost (KES)',
                'Value (KES)',
                'Status',
              ],
              ...stock.map((r) => [
                r.name,
                r.sku,
                r.category_name,
                r.location_name,
                r.quantity,
                r.unit,
                Math.round(r.unit_cost_cents / 100),
                Math.round(r.value_cents / 100),
                STOCK_STATUS[r.status]?.label,
              ]),
            ]}
          />
        </PanelHead>
        <div className="mt-5">
          {total > 0 ? (
            <ShareDonut data={slices} centre={kesShort(total)} caption="Stock Value" unit="kes" />
          ) : (
            <p className="text-muted-light py-8 text-center text-sm">
              No stock with a value yet. Items need a unit cost to count here.
            </p>
          )}
        </div>
      </Sheet>
      <Sheet>
        <PanelHead title="Stock Value by Location" />
        {byLocation.length === 0 ? (
          <p className="text-muted-light py-8 text-center text-sm">No stock recorded yet.</p>
        ) : (
          <ul className="mt-5 space-y-4">
            {byLocation.map((l) => {
              const pct = total > 0 ? (l.value / total) * 100 : 0;
              const lines = stock.filter((r) => r.location_id === l.key);
              const low = lines.filter((r) => r.status !== 'in_stock').length;
              return (
                <li key={l.key}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-bold">{l.label}</span>
                    <span className="font-extrabold tabular-nums">{kes(l.value)}</span>
                  </div>
                  <div className="bg-border/70 mt-1.5 h-2 overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#F0B90B] to-[#FDD128]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-muted-light mt-1 text-xs">
                    {lines.length} {lines.length === 1 ? 'line' : 'lines'} · {pct.toFixed(1)}% of
                    stock value
                    {low > 0 && (
                      <span className="text-danger font-semibold"> · {low} need reordering</span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </div>
  );
}
