'use client';

import { Button, cn, DataTable, EmptyState, type ColumnDef, useToast } from '@nexg/ui';
import {
  Archive,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ClipboardCheck,
  ImagePlus,
  MapPin,
  Package,
  Pencil,
  Plus,
  ShoppingCart,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { archiveItem, countStock, moveStock, saveCategory, saveItem } from '@/app/company/actions';
import {
  ActionMenu,
  ConfirmAction,
  FieldRow,
  FilterSelect,
  FormPanel,
  fromCents,
  SearchBox,
  SelectField,
  TextArea,
  TextField,
  toCents,
  useRunner,
  useShowMore,
} from '@/components/portal/client-kit';
import { CategoryIcon } from '@/components/company/icons';
import { Pill } from '@/components/portal/kit';
import { createClient } from '@/lib/supabase/client';
import { quantity, shillings, STOCK_STATUS, suggestedOrder, UNITS } from '@/lib/company';

export interface StockRow {
  item_id: string;
  location_id: string;
  name: string;
  sku: string | null;
  unit: string;
  unit_cost_cents: number;
  reorder_level: number;
  photo_path: string | null;
  vendor_id: string | null;
  category_id: string;
  category_name: string;
  category_icon: string;
  location_name: string;
  location_kind: string;
  location_active: boolean;
  quantity: number;
  value_cents: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export interface Option {
  id: string;
  name: string;
}

export interface CategoryRow {
  id: string;
  name: string;
  icon: string;
}

type Panel =
  | { kind: 'in' | 'out' | 'transfer'; row: StockRow }
  | { kind: 'count'; row: StockRow }
  | { kind: 'edit'; row: StockRow }
  | { kind: 'archive'; row: StockRow };

/* ─────────────────────────────────────────────────────────── the table */

export function InventoryTable({
  rows,
  photos,
  categories,
  locations,
  vendors,
  canWrite,
  title,
  compact = false,
  initialStatus = 'all',
  reorder = false,
}: {
  rows: StockRow[];
  photos: Record<string, string>;
  categories: CategoryRow[];
  locations: Option[];
  vendors: Option[];
  canWrite: boolean;
  title: string;
  compact?: boolean;
  initialStatus?: string;
  /** The Reorder & alerts view: suggested quantities and Request purchase. */
  reorder?: boolean;
}) {
  const [q, setQ] = React.useState('');
  const [category, setCategory] = React.useState('all');
  const [location, setLocation] = React.useState('all');
  const [status, setStatus] = React.useState(initialStatus);
  const [panel, setPanel] = React.useState<Panel | null>(null);
  const router = useRouter();
  const { run } = useRunner();

  const onHandByItem = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.item_id, (m.get(r.item_id) ?? 0) + Number(r.quantity));
    return m;
  }, [rows]);

  const term = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (category === 'all' || r.category_id === category) &&
      (location === 'all' || r.location_id === location) &&
      (status === 'all' ||
        (status === 'attention' ? r.status !== 'in_stock' : r.status === status)) &&
      (!term ||
        `${r.name} ${r.sku ?? ''} ${r.category_name} ${r.location_name}`
          .toLowerCase()
          .includes(term)),
  );
  const filtered =
    term !== '' || category !== 'all' || location !== 'all' || status !== initialStatus;

  const request = (r: StockRow) =>
    router.push(
      `/company/procurement?new=1&item=${r.item_id}&qty=${Math.max(
        1,
        suggestedOrder(Number(r.quantity), Number(r.reorder_level)),
      )}&location=${r.location_id}`,
    );

  const actions = (r: StockRow) =>
    canWrite
      ? [
          {
            label: 'Receive stock',
            icon: <ArrowDown />,
            opensOverlay: true,
            onSelect: () => setPanel({ kind: 'in', row: r }),
          },
          {
            label: 'Issue stock',
            icon: <ArrowUp />,
            opensOverlay: true,
            disabled: Number(r.quantity) <= 0,
            onSelect: () => setPanel({ kind: 'out', row: r }),
          },
          {
            label: 'Move to another location',
            icon: <ArrowLeftRight />,
            opensOverlay: true,
            disabled: Number(r.quantity) <= 0 || locations.length < 2,
            onSelect: () => setPanel({ kind: 'transfer', row: r }),
          },
          {
            label: 'Count stock',
            icon: <ClipboardCheck />,
            opensOverlay: true,
            onSelect: () => setPanel({ kind: 'count', row: r }),
          },
          {
            label: 'Request purchase',
            icon: <ShoppingCart />,
            separated: true,
            onSelect: () => request(r),
          },
          {
            label: 'Edit item',
            icon: <Pencil />,
            opensOverlay: true,
            onSelect: () => setPanel({ kind: 'edit', row: r }),
          },
          (onHandByItem.get(r.item_id) ?? 0) <= 0 && {
            label: 'Archive item',
            icon: <Archive />,
            tone: 'danger' as const,
            opensOverlay: true,
            onSelect: () => setPanel({ kind: 'archive', row: r }),
          },
        ]
      : [];

  const menu = (r: StockRow) => {
    const m = (
      <ActionMenu label={`Actions for ${r.name} at ${r.location_name}`} actions={actions(r)} />
    );
    return panel?.kind === 'archive' && panel.row === r ? (
      <ConfirmAction
        open
        onOpenChange={(o) => !o && setPanel(null)}
        anchor={m}
        title={`Archive “${r.name}”?`}
        body="Nothing is on hand, so it leaves the inventory lists. Its movements stay in the history."
        confirmLabel="Archive"
        onConfirm={async () => run(() => archiveItem(r.item_id, true))}
      />
    ) : (
      m
    );
  };

  const thumb = (r: StockRow, size = 'h-11 w-11') =>
    photos[r.item_id] ? (
      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
      <img
        src={photos[r.item_id]}
        alt=""
        className={cn(size, 'border-border shrink-0 rounded-lg border bg-white object-cover')}
      />
    ) : (
      <span
        aria-hidden="true"
        className={cn(
          size,
          'bg-bg text-muted-light flex shrink-0 items-center justify-center rounded-lg',
        )}
      >
        <CategoryIcon icon={r.category_icon} className="h-5 w-5" />
      </span>
    );

  const columns: ColumnDef<StockRow, unknown>[] = [
    {
      id: 'name',
      accessorFn: (r) => r.name,
      header: 'Item name',
      cell: ({ row: { original: r } }) => (
        <span className="flex min-w-0 items-center gap-3">
          {thumb(r)}
          <span className="min-w-0">
            <span className="block max-w-[16rem] truncate font-semibold">{r.name}</span>
            {r.sku && <span className="text-muted-light block text-xs">SKU: {r.sku}</span>}
          </span>
        </span>
      ),
    },
    {
      id: 'category',
      accessorFn: (r) => r.category_name,
      header: 'Category',
      cell: ({ row: { original: r } }) => (
        <span className="flex items-center gap-2">
          <CategoryIcon icon={r.category_icon} className="h-4 w-4 shrink-0 text-[#E5A800]" />
          <span className="truncate">{r.category_name}</span>
        </span>
      ),
    },
    {
      id: 'location',
      accessorFn: (r) => r.location_name,
      header: 'Location',
      cell: ({ row: { original: r } }) => (
        <span className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4 shrink-0 text-[#E5A800]" aria-hidden="true" />
          <span className="truncate">{r.location_name}</span>
        </span>
      ),
    },
    {
      id: 'quantity',
      accessorFn: (r) => Number(r.quantity),
      header: 'Quantity',
      cell: ({ row: { original: r } }) => (
        <span className="font-semibold tabular-nums">{quantity(r.quantity, r.unit)}</span>
      ),
    },
    {
      id: 'unit_cost',
      accessorFn: (r) => r.unit_cost_cents,
      header: 'Unit cost (KES)',
      cell: ({ row: { original: r } }) => (
        <span className="tabular-nums">
          {shillings(r.unit_cost_cents)}
          {r.unit !== 'pcs' && <span className="text-muted-light"> / {r.unit}</span>}
        </span>
      ),
    },
    ...(reorder
      ? [
          {
            id: 'reorder',
            accessorFn: (r: StockRow) => Number(r.reorder_level),
            header: 'Reorder at',
            cell: ({ row: { original: r } }: { row: { original: StockRow } }) => (
              <span className="tabular-nums">{quantity(r.reorder_level, r.unit)}</span>
            ),
          },
          {
            id: 'suggested',
            accessorFn: (r: StockRow) =>
              suggestedOrder(Number(r.quantity), Number(r.reorder_level)),
            header: 'Suggested order',
            cell: ({ row: { original: r } }: { row: { original: StockRow } }) => (
              <span className="font-extrabold tabular-nums">
                {quantity(suggestedOrder(Number(r.quantity), Number(r.reorder_level)), r.unit)}
              </span>
            ),
          },
        ]
      : [
          {
            id: 'value',
            accessorFn: (r: StockRow) => r.value_cents,
            header: 'Total value (KES)',
            cell: ({ row: { original: r } }: { row: { original: StockRow } }) => (
              <span className="font-semibold tabular-nums">{shillings(r.value_cents)}</span>
            ),
          },
        ]),
    {
      id: 'status',
      accessorFn: (r) => r.status,
      header: 'Status',
      cell: ({ row: { original: r } }) => (
        <Pill tone={STOCK_STATUS[r.status]!.tone} dot>
          {STOCK_STATUS[r.status]!.label}
        </Pill>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row: { original: r } }) =>
        reorder && canWrite ? (
          <span className="flex items-center justify-end gap-1">
            <Button
              size="sm"
              variant="gold"
              leadingIcon={<ShoppingCart className="h-4 w-4" />}
              onClick={() => request(r)}
            >
              Request
            </Button>
            {menu(r)}
          </span>
        ) : (
          <span className="flex justify-end">{menu(r)}</span>
        ),
    },
  ];

  const { shown: page, more } = useShowMore(shown, compact ? 8 : 25);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.125rem] font-extrabold tracking-[-0.01em]">{title}</h2>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search inventory…"
            label="Search inventory"
            className="w-full sm:w-56"
          />
          <FilterSelect
            label="Category"
            value={category}
            onChange={setCategory}
            className="flex-1 sm:flex-none"
            options={[
              { value: 'all', label: 'All categories' },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <FilterSelect
            label="Location"
            value={location}
            onChange={setLocation}
            className="flex-1 sm:flex-none"
            options={[
              { value: 'all', label: 'All locations' },
              ...locations.map((l) => ({ value: l.id, label: l.name })),
            ]}
          />
          {!reorder && (
            <FilterSelect
              label="Stock status"
              value={status}
              onChange={setStatus}
              className="flex-1 sm:flex-none"
              options={[
                { value: 'all', label: 'Any status' },
                { value: 'in_stock', label: 'In stock' },
                { value: 'low_stock', label: 'Low stock' },
                { value: 'out_of_stock', label: 'Out of stock' },
                { value: 'attention', label: 'Needs attention' },
              ]}
            />
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<Package className="h-5 w-5" />}
          title={
            filtered
              ? 'Nothing matches'
              : reorder
                ? 'Nothing needs reordering'
                : 'No stock recorded yet'
          }
          description={
            filtered
              ? 'Try another name, category, location or status.'
              : reorder
                ? 'Every item is above its reorder level.'
                : 'Add the first item with Add item: say where it is kept and how many are on the shelf.'
          }
          {...(filtered
            ? {
                action: {
                  label: 'Clear filters',
                  onClick: () => {
                    setQ('');
                    setCategory('all');
                    setLocation('all');
                    setStatus(initialStatus);
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
            {page.map((r) => (
              <li
                key={`${r.item_id}-${r.location_id}`}
                className="flex items-center gap-3 bg-white px-3 py-3"
              >
                {thumb(r, 'h-12 w-12')}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{r.name}</span>
                  <span className="text-muted-light block truncate text-xs">
                    {r.location_name} · {r.category_name}
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <span className="whitespace-nowrap text-sm font-extrabold tabular-nums">
                      {quantity(r.quantity, r.unit)}
                    </span>
                    <Pill tone={STOCK_STATUS[r.status]!.tone} dot>
                      {STOCK_STATUS[r.status]!.label}
                    </Pill>
                  </span>
                </span>
                {menu(r)}
              </li>
            ))}
          </ul>
          {more}
        </>
      )}

      {panel && (panel.kind === 'in' || panel.kind === 'out' || panel.kind === 'transfer') && (
        <StockPanel
          kind={panel.kind}
          row={panel.row}
          locations={locations}
          onClose={() => setPanel(null)}
        />
      )}
      {panel?.kind === 'count' && <CountPanel row={panel.row} onClose={() => setPanel(null)} />}
      {panel?.kind === 'edit' && (
        <ItemPanel
          itemId={panel.row.item_id}
          categories={categories}
          locations={locations}
          vendors={vendors}
          photo={photos[panel.row.item_id] ?? null}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────── moving stock */

const OUT_REASONS = [
  { value: 'issued', label: 'Issued to someone' },
  { value: 'used', label: 'Used up' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'lost', label: 'Lost' },
  { value: 'sold', label: 'Sold' },
  { value: 'other', label: 'Other' },
];

const IN_REASONS = [
  { value: 'purchase', label: 'Bought' },
  { value: 'return', label: 'Returned' },
  { value: 'other', label: 'Other' },
];

function StockPanel({
  kind,
  row,
  locations,
  onClose,
}: {
  kind: 'in' | 'out' | 'transfer';
  row: StockRow;
  locations: Option[];
  onClose: () => void;
}) {
  const [qty, setQty] = React.useState('');
  const [to, setTo] = React.useState(kind === 'in' ? row.location_id : '');
  const [cost, setCost] = React.useState(fromCents(row.unit_cost_cents));
  const [reason, setReason] = React.useState(kind === 'in' ? 'purchase' : 'issued');
  const [note, setNote] = React.useState('');
  const { run, busy } = useRunner();
  const { toast } = useToast();

  const titles = {
    in: 'Receive stock',
    out: 'Issue stock',
    transfer: 'Move stock',
  } as const;

  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={titles[kind]}
      subtitle={`${row.name} · ${quantity(row.quantity, row.unit)} on hand at ${row.location_name}`}
      submitLabel={titles[kind]}
      busy={busy}
      onSubmit={async () => {
        const n = Number(qty);
        const cents = kind === 'in' ? toCents(cost) : null;
        if (!(n > 0)) {
          toast({ tone: 'warning', title: 'Enter a quantity above zero' });
          return false;
        }
        if (Number.isNaN(cents)) {
          toast({ tone: 'warning', title: 'Enter the unit cost in shillings' });
          return false;
        }
        return run(() =>
          moveStock({
            itemId: row.item_id,
            kind,
            quantity: n,
            fromLocationId: kind === 'in' ? null : row.location_id,
            toLocationId: kind === 'out' ? null : to || null,
            unitCostCents: cents,
            reason: kind === 'transfer' ? 'move' : reason,
            note,
          }),
        );
      }}
    >
      <TextField
        label={`Quantity (${row.unit})`}
        required
        type="number"
        inputMode="decimal"
        min={0.01}
        step="any"
        max={kind === 'in' ? undefined : Number(row.quantity)}
        value={qty}
        onChange={(e) => setQty(e.target.value)}
      />
      {kind === 'in' && (
        <FieldRow>
          <SelectField
            label="Into"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
            options={locations.map((l) => ({ value: l.id, label: l.name }))}
          />
          <TextField
            label="Unit cost (KES)"
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            hint="Reprices the item at the average of old and new stock."
          />
        </FieldRow>
      )}
      {kind === 'transfer' && (
        <SelectField
          label="To"
          required
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Choose a location"
          options={locations
            .filter((l) => l.id !== row.location_id)
            .map((l) => ({ value: l.id, label: l.name }))}
        />
      )}
      {kind !== 'transfer' && (
        <SelectField
          label="Why"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          options={kind === 'in' ? IN_REASONS : OUT_REASONS}
        />
      )}
      <TextArea
        label="Note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        placeholder={
          kind === 'out' ? 'Who took it, for what' : 'Delivery note, supplier, anything useful'
        }
      />
    </FormPanel>
  );
}

function CountPanel({ row, onClose }: { row: StockRow; onClose: () => void }) {
  const [counted, setCounted] = React.useState('');
  const [note, setNote] = React.useState('');
  const { run, busy } = useRunner();
  const diff = counted === '' ? null : Number(counted) - Number(row.quantity);
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Count stock"
      subtitle={`${row.name} at ${row.location_name}`}
      submitLabel="Record count"
      busy={busy}
      onSubmit={() =>
        run(() =>
          countStock({
            itemId: row.item_id,
            locationId: row.location_id,
            counted: Number(counted),
            note,
          }),
        )
      }
    >
      <p className="bg-bg rounded-xl px-4 py-3 text-sm">
        The system says <strong className="tabular-nums">{quantity(row.quantity, row.unit)}</strong>{' '}
        on hand. Count what is on the shelf and enter it; the difference is recorded as a
        correction.
      </p>
      <TextField
        label={`Counted (${row.unit})`}
        required
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={counted}
        onChange={(e) => setCounted(e.target.value)}
      />
      {diff != null && !Number.isNaN(diff) && (
        <p
          className={cn(
            'text-sm font-bold',
            diff === 0 ? 'text-success' : diff < 0 ? 'text-danger' : 'text-info',
          )}
        >
          {diff === 0
            ? 'Matches the system.'
            : `${diff > 0 ? '+' : '−'}${quantity(Math.abs(diff), row.unit)} against the system.`}
        </p>
      )}
      <TextArea
        label="Note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
      />
    </FormPanel>
  );
}

/* ──────────────────────────────────────────────────────── adding items */

export function AddItem(props: {
  categories: CategoryRow[];
  locations: Option[];
  vendors: Option[];
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant="gold"
        leadingIcon={<Plus className="h-4 w-4" />}
        onClick={() => setOpen(true)}
      >
        Add item
      </Button>
      {open && <ItemPanel {...props} itemId={null} photo={null} onClose={() => setOpen(false)} />}
    </>
  );
}

function ItemPanel({
  itemId,
  categories: initialCategories,
  locations,
  vendors,
  photo,
  onClose,
}: {
  itemId: string | null;
  categories: CategoryRow[];
  locations: Option[];
  vendors: Option[];
  photo: string | null;
  onClose: () => void;
}) {
  const [categories, setCategories] = React.useState(initialCategories);
  const [loaded, setLoaded] = React.useState(itemId == null);
  const [name, setName] = React.useState('');
  const [categoryId, setCategoryId] = React.useState('');
  const [sku, setSku] = React.useState('');
  const [unit, setUnit] = React.useState('pcs');
  const [cost, setCost] = React.useState('');
  const [reorder, setReorder] = React.useState('0');
  const [vendorId, setVendorId] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [photoPath, setPhotoPath] = React.useState<string | null>(null);
  const [locationId, setLocationId] = React.useState(locations[0]?.id ?? '');
  const [opening, setOpening] = React.useState('0');
  const [newCategory, setNewCategory] = React.useState<string | null>(null);
  const { run, busy } = useRunner();
  const { toast } = useToast();

  React.useEffect(() => {
    if (!itemId) return;
    void createClient()
      .from('company_item')
      .select(
        'name, category_id, sku, unit, unit_cost_cents, reorder_level, vendor_id, description, photo_path',
      )
      .eq('id', itemId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setName(data.name);
          setCategoryId(data.category_id);
          setSku(data.sku ?? '');
          setUnit(data.unit);
          setCost(fromCents(data.unit_cost_cents));
          setReorder(String(data.reorder_level));
          setVendorId(data.vendor_id ?? '');
          setDescription(data.description ?? '');
          setPhotoPath(data.photo_path);
        }
        setLoaded(true);
      });
  }, [itemId]);

  const addCategory = async () => {
    if (!newCategory?.trim()) return;
    const r = await saveCategory({ name: newCategory, icon: 'package' });
    if (!r.ok || !r.id) {
      toast({ tone: 'danger', title: 'Category not added', description: r.message });
      return;
    }
    setCategories((c) => [...c, { id: r.id!, name: newCategory.trim(), icon: 'package' }]);
    setCategoryId(r.id);
    setNewCategory(null);
  };

  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={itemId ? 'Edit item' : 'Add item'}
      subtitle={itemId ? name : 'Something NexG keeps in stock by quantity'}
      submitLabel={itemId ? 'Save item' : 'Add item'}
      busy={busy || !loaded}
      width="lg"
      onSubmit={async () => {
        const cents = toCents(cost) ?? 0;
        if (Number.isNaN(cents)) {
          toast({ tone: 'warning', title: 'Enter the unit cost in shillings' });
          return false;
        }
        if (!categoryId) {
          toast({ tone: 'warning', title: 'Choose a category' });
          return false;
        }
        return run(() =>
          saveItem({
            id: itemId,
            name,
            categoryId,
            sku,
            unit,
            unitCostCents: cents,
            reorderLevel: Number(reorder) || 0,
            vendorId: vendorId || null,
            description,
            photoPath,
            locationId: itemId ? null : locationId || null,
            openingQuantity: Number(opening) || 0,
          }),
        );
      }}
    >
      <PhotoField
        current={photoPath ? photo : null}
        onUploaded={(path) => setPhotoPath(path)}
        onRemove={() => setPhotoPath(null)}
        hasPhoto={photoPath != null}
      />
      <TextField
        label="Name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={120}
        placeholder="Rider safety vest"
      />
      <FieldRow>
        <div className="space-y-2">
          <SelectField
            label="Category"
            required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            placeholder="Choose a category"
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
          {newCategory == null ? (
            <button
              type="button"
              onClick={() => setNewCategory('')}
              className="text-gold-text text-xs font-bold underline-offset-4 hover:underline"
            >
              + New category
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                aria-label="New category name"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Kitchen supplies"
                className="border-border-strong focus:ring-gold h-9 min-w-0 flex-1 rounded-lg border px-2.5 text-sm focus:outline-none focus:ring-2"
              />
              <Button size="sm" variant="outline" onClick={addCategory}>
                Add
              </Button>
            </div>
          )}
        </div>
        <TextField
          label="SKU"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          maxLength={40}
          placeholder="Optional"
        />
      </FieldRow>
      <FieldRow>
        <SelectField
          label="Counted in"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          options={UNITS.map((u) => ({ value: u, label: u === 'pcs' ? 'pieces' : u }))}
        />
        <TextField
          label="Unit cost (KES)"
          inputMode="decimal"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          placeholder="0"
        />
      </FieldRow>
      <FieldRow>
        <TextField
          label="Reorder when at or below"
          type="number"
          min={0}
          step="any"
          value={reorder}
          onChange={(e) => setReorder(e.target.value)}
          hint="Lines at or under this show as low stock."
        />
        <SelectField
          label="Usual supplier"
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
          placeholder="None"
          options={vendors.map((v) => ({ value: v.id, label: v.name }))}
        />
      </FieldRow>
      {!itemId && (
        <FieldRow>
          <SelectField
            label="Kept at"
            required
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            placeholder={locations.length ? 'Choose a location' : 'Add a location first'}
            options={locations.map((l) => ({ value: l.id, label: l.name }))}
          />
          <TextField
            label="On the shelf now"
            type="number"
            min={0}
            step="any"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            hint="Recorded as opening stock."
          />
        </FieldRow>
      )}
      <TextArea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={1000}
      />
    </FormPanel>
  );
}

/* ─────────────────────────────────────────────────────────────── photos */

/** A photo for an item or asset, uploaded straight to the private bucket. */
export function PhotoField({
  current,
  hasPhoto,
  onUploaded,
  onRemove,
}: {
  current: string | null;
  hasPhoto: boolean;
  onUploaded: (path: string) => void;
  onRemove: () => void;
}) {
  const [preview, setPreview] = React.useState<string | null>(current);
  const [busy, setBusy] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const pick = async (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast({ tone: 'warning', title: 'Use a JPG, PNG or WebP photo' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ tone: 'warning', title: 'Keep the photo under 5 MB' });
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${session?.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from('company-photos')
      .upload(path, file, { contentType: file.type });
    setBusy(false);
    if (error) {
      toast({ tone: 'danger', title: 'Photo not uploaded', description: error.message });
      return;
    }
    setPreview(URL.createObjectURL(file));
    onUploaded(path);
  };

  return (
    <div className="flex items-center gap-4">
      {hasPhoto && preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- local preview or signed URL
        <img
          src={preview}
          alt=""
          className="border-border h-20 w-20 rounded-xl border object-cover"
        />
      ) : (
        <span className="bg-bg text-muted-light flex h-20 w-20 items-center justify-center rounded-xl">
          <ImagePlus className="h-7 w-7" aria-hidden="true" />
        </span>
      )}
      <div className="flex flex-col items-start gap-1.5">
        <Button size="sm" variant="outline" loading={busy} onClick={() => input.current?.click()}>
          {hasPhoto ? 'Change photo' : 'Add photo'}
        </Button>
        {hasPhoto && (
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              onRemove();
            }}
            className="text-muted-light hover:text-danger text-xs font-semibold"
          >
            Remove photo
          </button>
        )}
        <span className="text-muted-light text-xs">JPG, PNG or WebP, up to 5 MB</span>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
