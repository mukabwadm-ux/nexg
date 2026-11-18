'use client';

import { Button, cn, DataTable, DetailPanel, EmptyState, type ColumnDef } from '@nexg/ui';
import {
  Archive,
  Eye,
  Globe,
  Mail,
  Pause,
  Pencil,
  Phone,
  Play,
  Plus,
  Star,
  Truck,
} from 'lucide-react';
import * as React from 'react';

import { saveVendor, setVendorStatus } from '@/app/company/actions';
import {
  ActionMenu,
  FieldRow,
  FilterSelect,
  FormPanel,
  IconAction,
  SearchBox,
  SelectField,
  TextArea,
  TextField,
  useRunner,
  useShowMore,
} from '@/components/portal/client-kit';
import type { Option } from '@/components/company/inventory';
import { Pill } from '@/components/portal/kit';
import {
  day,
  kes,
  ORDER_STATUS,
  PAYMENT_TERMS,
  VENDOR_CATEGORIES,
  VENDOR_STATUS,
} from '@/lib/company';

export interface VendorRow {
  id: string;
  name: string;
  categories: string[];
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city_id: string | null;
  tax_pin: string | null;
  payment_terms: string;
  rating: number | null;
  status: string;
  notes: string | null;
  created_at: string;
  city: { name: string } | null;
}

export interface VendorOrder {
  id: string;
  number: string;
  vendor_id: string;
  status: string;
  total_cents: number;
  issued_at: string;
  received_at: string | null;
}

type Panel =
  | { kind: 'view' | 'edit'; row: VendorRow }
  | { kind: 'status'; row: VendorRow; status: 'active' | 'on_hold' | 'archived' };

function Rating({ value }: { value: number | null }) {
  if (!value) return <span className="text-muted-light">—</span>;
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          className={cn('h-3.5 w-3.5', n <= value ? 'fill-gold text-gold' : 'text-border-strong')}
        />
      ))}
    </span>
  );
}

export function VendorsTable({
  rows,
  orders,
  cities,
  canWrite,
  title,
  compact = false,
}: {
  rows: VendorRow[];
  orders: VendorOrder[];
  cities: Option[];
  canWrite: boolean;
  title: string;
  compact?: boolean;
}) {
  const [q, setQ] = React.useState('');
  const [category, setCategory] = React.useState('all');
  const [panel, setPanel] = React.useState<Panel | null>(null);
  const term = q.trim().toLowerCase();
  const spend = React.useMemo(() => {
    const m = new Map<string, { count: number; cents: number; open: number }>();
    for (const o of orders) {
      if (o.status === 'cancelled') continue;
      const cur = m.get(o.vendor_id) ?? { count: 0, cents: 0, open: 0 };
      cur.count += 1;
      cur.cents += o.total_cents;
      if (o.status === 'issued' || o.status === 'partially_received') cur.open += 1;
      m.set(o.vendor_id, cur);
    }
    return m;
  }, [orders]);

  const shown = rows.filter(
    (v) =>
      (category === 'all' || v.categories.includes(category)) &&
      (!term ||
        `${v.name} ${v.contact_name ?? ''} ${v.email ?? ''} ${v.phone ?? ''} ${v.categories.map((c) => VENDOR_CATEGORIES[c]).join(' ')}`
          .toLowerCase()
          .includes(term)),
  );
  const filtered = term !== '' || category !== 'all';
  const { shown: page, more } = useShowMore(shown, compact ? 8 : 25);

  const actions = (v: VendorRow) => [
    {
      label: 'Details',
      icon: <Eye />,
      opensOverlay: true,
      onSelect: () => setPanel({ kind: 'view', row: v }),
    },
    canWrite && {
      label: 'Edit',
      icon: <Pencil />,
      opensOverlay: true,
      onSelect: () => setPanel({ kind: 'edit', row: v }),
    },
    canWrite &&
      v.status !== 'active' && {
        label: 'Make Active',
        icon: <Play />,
        separated: true,
        opensOverlay: true,
        onSelect: () => setPanel({ kind: 'status', row: v, status: 'active' }),
      },
    canWrite &&
      v.status === 'active' && {
        label: 'Put on Hold',
        icon: <Pause />,
        separated: true,
        opensOverlay: true,
        onSelect: () => setPanel({ kind: 'status', row: v, status: 'on_hold' }),
      },
    canWrite &&
      v.status !== 'archived' && {
        label: 'Archive',
        icon: <Archive />,
        tone: 'danger' as const,
        opensOverlay: true,
        onSelect: () => setPanel({ kind: 'status', row: v, status: 'archived' }),
      },
  ];

  const columns: ColumnDef<VendorRow, unknown>[] = [
    {
      id: 'name',
      accessorFn: (v) => v.name,
      header: 'Vendor',
      cell: ({ row: { original: v } }) => (
        <span className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="bg-ink text-gold flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold"
          >
            {v.name.slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0">
            <button
              type="button"
              onClick={() => setPanel({ kind: 'view', row: v })}
              className="hover:text-gold-text block max-w-[15rem] truncate text-left font-semibold underline-offset-4 hover:underline"
            >
              {v.name}
            </button>
            <span className="text-muted-light block truncate text-xs">
              {v.contact_name ?? 'No contact name'}
              {v.city ? ` · ${v.city.name}` : ''}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: 'categories',
      accessorFn: (v) => v.categories.map((c) => VENDOR_CATEGORIES[c]).join(', '),
      header: 'Supplies',
      enableSorting: false,
      cell: ({ row: { original: v } }) =>
        v.categories.length ? (
          <span className="flex flex-wrap gap-1">
            {v.categories.slice(0, 2).map((c) => (
              <Pill key={c} tone="gold">
                {VENDOR_CATEGORIES[c] ?? c}
              </Pill>
            ))}
            {v.categories.length > 2 && <Pill tone="grey">+{v.categories.length - 2}</Pill>}
          </span>
        ) : (
          <span className="text-muted-light">—</span>
        ),
    },
    {
      id: 'contact',
      accessorFn: (v) => v.phone ?? v.email ?? '',
      header: 'Contact',
      enableSorting: false,
      cell: ({ row: { original: v } }) => (
        <span className="text-muted block max-w-[14rem] text-xs leading-relaxed">
          {v.phone && <span className="block">{v.phone}</span>}
          {v.email && <span className="block truncate">{v.email}</span>}
          {!v.phone && !v.email && '—'}
        </span>
      ),
    },
    {
      id: 'terms',
      accessorFn: (v) => PAYMENT_TERMS[v.payment_terms],
      header: 'Terms',
      cell: ({ row: { original: v } }) => (
        <span>{PAYMENT_TERMS[v.payment_terms] ?? v.payment_terms}</span>
      ),
    },
    {
      id: 'rating',
      accessorFn: (v) => v.rating ?? 0,
      header: 'Rating',
      cell: ({ row: { original: v } }) => <Rating value={v.rating} />,
    },
    {
      id: 'spend',
      accessorFn: (v) => spend.get(v.id)?.cents ?? 0,
      header: 'Ordered (KES)',
      cell: ({ row: { original: v } }) => {
        const s = spend.get(v.id);
        return s ? (
          <span>
            <span className="block font-semibold tabular-nums">
              {Math.round(s.cents / 100).toLocaleString('en-KE')}
            </span>
            <span className="text-muted-light block text-xs">
              {s.count} {s.count === 1 ? 'order' : 'orders'}
              {s.open > 0 && ` · ${s.open} open`}
            </span>
          </span>
        ) : (
          <span className="text-muted-light">None yet</span>
        );
      },
    },
    {
      id: 'status',
      accessorFn: (v) => v.status,
      header: 'Status',
      cell: ({ row: { original: v } }) => (
        <Pill tone={VENDOR_STATUS[v.status]?.tone ?? 'grey'} dot>
          {VENDOR_STATUS[v.status]?.label ?? v.status}
        </Pill>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row: { original: v } }) => (
        <span className="flex items-center justify-end">
          <IconAction
            label={`Details of ${v.name}`}
            onClick={() => setPanel({ kind: 'view', row: v })}
          >
            <Eye />
          </IconAction>
          <ActionMenu label={`Actions for ${v.name}`} actions={actions(v)} />
        </span>
      ),
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.125rem] font-extrabold tracking-[-0.01em]">{title}</h2>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search vendors, contacts…"
            label="Search vendors"
            className="w-full sm:w-64"
          />
          <FilterSelect
            label="Supplies"
            value={category}
            onChange={setCategory}
            options={[
              { value: 'all', label: 'Everything They Supply' },
              ...Object.entries(VENDOR_CATEGORIES).map(([k, v]) => ({ value: k, label: v })),
            ]}
          />
        </div>
      </div>
      {shown.length === 0 ? (
        <EmptyState
          icon={<Truck className="h-5 w-5" />}
          title={filtered ? 'Nothing matches' : 'No vendors here'}
          description={
            filtered
              ? 'Try another name or category.'
              : 'Add the businesses NexG buys from with Add Vendor: who to call, what they supply and on what terms.'
          }
          {...(filtered
            ? {
                action: {
                  label: 'Clear Filters',
                  onClick: () => {
                    setQ('');
                    setCategory('all');
                  },
                },
              }
            : {})}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable caption={title} columns={columns} data={page} />
          </div>
          <ul className="divide-border border-border divide-y overflow-hidden rounded-2xl border md:hidden">
            {page.map((v) => (
              <li key={v.id} className="flex items-center gap-3 bg-white px-3 py-3">
                <button
                  type="button"
                  onClick={() => setPanel({ kind: 'view', row: v })}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-bold">{v.name}</span>
                  <span className="text-muted-light block truncate text-xs">
                    {v.categories.map((c) => VENDOR_CATEGORIES[c]).join(', ') || 'No categories'}
                  </span>
                  <span className="mt-1 flex">
                    <Pill tone={VENDOR_STATUS[v.status]?.tone ?? 'grey'} dot>
                      {VENDOR_STATUS[v.status]?.label}
                    </Pill>
                  </span>
                </button>
                {v.phone && (
                  <a
                    href={`tel:${v.phone}`}
                    aria-label={`Call ${v.name}`}
                    className="text-muted hover:bg-bg flex h-10 w-10 items-center justify-center rounded-lg"
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                )}
                <ActionMenu label={`Actions for ${v.name}`} actions={actions(v)} />
              </li>
            ))}
          </ul>
          {more}
        </>
      )}

      {panel?.kind === 'view' && (
        <VendorDetail
          vendor={panel.row}
          orders={orders.filter((o) => o.vendor_id === panel.row.id)}
          onClose={() => setPanel(null)}
        />
      )}
      {panel?.kind === 'edit' && (
        <VendorPanel vendor={panel.row} cities={cities} onClose={() => setPanel(null)} />
      )}
      {panel?.kind === 'status' && (
        <StatusPanel vendor={panel.row} status={panel.status} onClose={() => setPanel(null)} />
      )}
    </div>
  );
}

function VendorDetail({
  vendor: v,
  orders,
  onClose,
}: {
  vendor: VendorRow;
  orders: VendorOrder[];
  onClose: () => void;
}) {
  const live = orders.filter((o) => o.status !== 'cancelled');
  return (
    <DetailPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={v.name}
      subtitle={v.categories.map((c) => VENDOR_CATEGORIES[c]).join(' · ') || 'No categories'}
      meta={
        <>
          <Pill tone={VENDOR_STATUS[v.status]?.tone ?? 'grey'} dot>
            {VENDOR_STATUS[v.status]?.label}
          </Pill>
          <Rating value={v.rating} />
        </>
      }
      width="lg"
    >
      <div className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-3">
          {v.phone && (
            <a
              href={`tel:${v.phone}`}
              className="border-border hover:bg-bg flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold"
            >
              <Phone className="text-gold-text h-4 w-4" aria-hidden="true" /> {v.phone}
            </a>
          )}
          {v.email && (
            <a
              href={`mailto:${v.email}`}
              className="border-border hover:bg-bg flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold"
            >
              <Mail className="text-gold-text h-4 w-4 shrink-0" aria-hidden="true" />{' '}
              <span className="truncate">{v.email}</span>
            </a>
          )}
          {v.website && (
            <a
              href={v.website}
              target="_blank"
              rel="noopener noreferrer"
              className="border-border hover:bg-bg flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold"
            >
              <Globe className="text-gold-text h-4 w-4 shrink-0" aria-hidden="true" />{' '}
              <span className="truncate">{v.website.replace(/^https?:\/\//, '')}</span>
            </a>
          )}
        </div>
        <dl className="divide-border border-border divide-y rounded-2xl border text-sm">
          {(
            [
              ['Contact Person', v.contact_name ?? '—'],
              ['Address', [v.address, v.city?.name].filter(Boolean).join(', ') || '—'],
              ['KRA PIN', v.tax_pin ?? '—'],
              ['Payment Terms', PAYMENT_TERMS[v.payment_terms] ?? v.payment_terms],
              [
                'Ordered So Far',
                `${kes(live.reduce((s, o) => s + o.total_cents, 0))} over ${live.length} ${live.length === 1 ? 'order' : 'orders'}`,
              ],
              ['On NexG’s List Since', day(v.created_at)],
            ] as const
          ).map(([k, val]) => (
            <div key={k} className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-muted font-semibold">{k}</dt>
              <dd className="text-right font-bold">{val}</dd>
            </div>
          ))}
        </dl>
        {v.notes && <p className="bg-bg rounded-xl px-4 py-3 text-sm">{v.notes}</p>}
        <div>
          <h3 className="mb-2 text-sm font-extrabold">Purchase Orders</h3>
          {orders.length === 0 ? (
            <p className="text-muted-light text-sm">No orders with this vendor yet.</p>
          ) : (
            <ul className="divide-border border-border divide-y rounded-xl border">
              {orders.slice(0, 12).map((o) => (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                >
                  <span>
                    <span className="block font-semibold">{o.number}</span>
                    <span className="text-muted-light text-xs">{day(o.issued_at)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">{kes(o.total_cents)}</span>
                    <Pill tone={ORDER_STATUS[o.status]?.tone ?? 'grey'}>
                      {ORDER_STATUS[o.status]?.label}
                    </Pill>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DetailPanel>
  );
}

export function AddVendor({ cities }: { cities: Option[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant="gold"
        leadingIcon={<Plus className="h-4 w-4" />}
        onClick={() => setOpen(true)}
      >
        Add Vendor
      </Button>
      {open && <VendorPanel vendor={null} cities={cities} onClose={() => setOpen(false)} />}
    </>
  );
}

function VendorPanel({
  vendor,
  cities,
  onClose,
}: {
  vendor: VendorRow | null;
  cities: Option[];
  onClose: () => void;
}) {
  const [f, setF] = React.useState({
    name: vendor?.name ?? '',
    categories: vendor?.categories ?? [],
    contactName: vendor?.contact_name ?? '',
    email: vendor?.email ?? '',
    phone: vendor?.phone ?? '',
    website: vendor?.website ?? '',
    address: vendor?.address ?? '',
    cityId: vendor?.city_id ?? '',
    taxPin: vendor?.tax_pin ?? '',
    paymentTerms: vendor?.payment_terms ?? 'net_30',
    rating: vendor?.rating ? String(vendor.rating) : '',
    notes: vendor?.notes ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const { run, busy } = useRunner();

  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={vendor ? 'Edit Vendor' : 'Add Vendor'}
      subtitle={vendor?.name ?? 'A business NexG buys from'}
      submitLabel={vendor ? 'Save Vendor' : 'Add Vendor'}
      busy={busy}
      width="lg"
      onSubmit={() =>
        run(() =>
          saveVendor({
            id: vendor?.id,
            ...f,
            cityId: f.cityId || null,
            website:
              f.website && !/^https?:\/\//i.test(f.website) ? `https://${f.website}` : f.website,
            rating: f.rating ? Number(f.rating) : null,
          }),
        )
      }
    >
      <TextField
        label="Business Name"
        required
        value={f.name}
        onChange={(e) => set('name', e.target.value)}
        maxLength={120}
        placeholder="Tech Hub Kenya Ltd"
      />
      <fieldset>
        <legend className="mb-2 text-sm font-bold">What They Supply</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(VENDOR_CATEGORIES).map(([k, label]) => {
            const on = f.categories.includes(k);
            return (
              <label key={k} className="cursor-pointer">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={on}
                  onChange={() =>
                    set(
                      'categories',
                      on ? f.categories.filter((c) => c !== k) : [...f.categories, k],
                    )
                  }
                />
                <span
                  className={cn(
                    'peer-focus-visible:ring-gold flex min-h-9 items-center rounded-full border px-3 text-sm font-semibold transition-colors peer-focus-visible:ring-2',
                    on
                      ? 'border-ink bg-ink text-white'
                      : 'border-border-strong text-muted hover:bg-bg',
                  )}
                >
                  {label}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <FieldRow>
        <TextField
          label="Contact Person"
          value={f.contactName}
          onChange={(e) => set('contactName', e.target.value)}
          maxLength={120}
        />
        <TextField
          label="Phone"
          type="tel"
          value={f.phone}
          onChange={(e) => set('phone', e.target.value)}
          maxLength={30}
          placeholder="+254 7…"
        />
      </FieldRow>
      <FieldRow>
        <TextField
          label="Email"
          type="email"
          value={f.email}
          onChange={(e) => set('email', e.target.value)}
          maxLength={200}
        />
        <TextField
          label="Website"
          value={f.website}
          onChange={(e) => set('website', e.target.value)}
          maxLength={200}
          placeholder="example.co.ke"
        />
      </FieldRow>
      <FieldRow>
        <TextField
          label="Address"
          value={f.address}
          onChange={(e) => set('address', e.target.value)}
          maxLength={200}
        />
        <SelectField
          label="City"
          value={f.cityId}
          onChange={(e) => set('cityId', e.target.value)}
          placeholder="Not recorded"
          options={cities.map((c) => ({ value: c.id, label: c.name }))}
        />
      </FieldRow>
      <FieldRow>
        <TextField
          label="KRA PIN"
          value={f.taxPin}
          onChange={(e) => set('taxPin', e.target.value.toUpperCase())}
          maxLength={20}
          placeholder="P051234567X"
        />
        <SelectField
          label="Payment Terms"
          value={f.paymentTerms}
          onChange={(e) => set('paymentTerms', e.target.value)}
          options={Object.entries(PAYMENT_TERMS).map(([k, v]) => ({ value: k, label: v }))}
        />
      </FieldRow>
      <SelectField
        label="Rating"
        value={f.rating}
        onChange={(e) => set('rating', e.target.value)}
        placeholder="Not rated"
        options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} out of 5` }))}
      />
      <TextArea
        label="Notes"
        value={f.notes}
        onChange={(e) => set('notes', e.target.value)}
        maxLength={1000}
        placeholder="Delivery days, account numbers on invoices, who to escalate to"
      />
    </FormPanel>
  );
}

function StatusPanel({
  vendor,
  status,
  onClose,
}: {
  vendor: VendorRow;
  status: 'active' | 'on_hold' | 'archived';
  onClose: () => void;
}) {
  const [reason, setReason] = React.useState('');
  const { run, busy } = useRunner();
  const copy = {
    active: {
      title: 'Make Active',
      button: 'Make Active',
      hint: 'Colleagues can order from them again.',
    },
    on_hold: {
      title: 'Put on Hold',
      button: 'Put on Hold',
      hint: 'No new purchase orders until they are made active again. Open orders carry on.',
    },
    archived: {
      title: 'Archive Vendor',
      button: 'Archive',
      hint: 'They leave the lists. Their orders stay in the history.',
    },
  }[status];
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={copy.title}
      subtitle={vendor.name}
      submitLabel={copy.button}
      busy={busy}
      danger={status !== 'active'}
      onSubmit={() => run(() => setVendorStatus(vendor.id, status, reason))}
    >
      <p className="bg-bg rounded-xl px-4 py-3 text-sm">{copy.hint}</p>
      <TextArea
        label="Why"
        required={status !== 'active'}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
      />
    </FormPanel>
  );
}
