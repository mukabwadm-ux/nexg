'use client';

import {
  Button,
  cn,
  DataTable,
  DetailPanel,
  EmptyState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type ColumnDef,
  useToast,
} from '@nexg/ui';
import {
  CalendarClock,
  Eye,
  Hand,
  History,
  Info,
  Laptop,
  PackageCheck,
  Pencil,
  Plus,
  RotateCcw,
  Undo2,
  Wrench,
  XCircle,
} from 'lucide-react';
import * as React from 'react';

import {
  assignAsset,
  maintainAsset,
  returnAsset,
  saveAsset,
  setAssetStatus,
} from '@/app/company/actions';
import {
  ActionMenu,
  FieldRow,
  FilterSelect,
  FormPanel,
  fromCents,
  IconAction,
  SearchBox,
  SelectField,
  TextArea,
  TextField,
  toCents,
  useRunner,
  useShowMore,
} from '@/components/portal/client-kit';
import { ActivityFeed, type ActivityRow } from '@/components/company/feeds';
import { CategoryIcon } from '@/components/company/icons';
import { PhotoField, type CategoryRow, type Option } from '@/components/company/inventory';
import { Person, Pill } from '@/components/portal/kit';
import { createClient } from '@/lib/supabase/client';
import { ASSET_CONDITION, ASSET_STATUS, day, daysUntil, kes, todayInNairobi } from '@/lib/company';

export interface AssetRow {
  id: string;
  tag: string;
  name: string;
  category_id: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  location_id: string | null;
  assigned_to: string | null;
  assignee_name: string | null;
  assigned_at: string | null;
  condition: string;
  status: string;
  purchase_date: string | null;
  purchase_cost_cents: number | null;
  vendor_id: string | null;
  warranty_until: string | null;
  next_service_on: string | null;
  photo_path: string | null;
  notes: string | null;
  created_at: string;
  category: { name: string; icon: string } | null;
  location: { name: string } | null;
  holder: { display_name: string | null; email: string } | null;
  vendor: { name: string } | null;
}

type Panel =
  | {
      kind: 'view' | 'edit' | 'assign' | 'return' | 'schedule' | 'start' | 'complete';
      row: AssetRow;
    }
  | { kind: 'retired' | 'lost' | 'available'; row: AssetRow };

const holderOf = (a: AssetRow) => a.holder?.display_name ?? a.holder?.email ?? a.assignee_name;

function ServiceDue({ on }: { on: string | null }) {
  if (!on) return <span className="text-muted-light">—</span>;
  const d = daysUntil(on);
  return (
    <span
      className={cn(
        'whitespace-nowrap tabular-nums',
        d < 0 ? 'text-danger font-bold' : d <= 14 ? 'font-bold text-[#8A5A00]' : '',
      )}
    >
      {day(on)}
      <span className="text-muted-light block text-xs font-semibold">
        {d < 0 ? `${-d} days overdue` : d === 0 ? 'today' : `in ${d} days`}
      </span>
    </span>
  );
}

export function AssetsTable({
  rows,
  photos,
  people,
  categories,
  locations,
  vendors,
  canWrite,
  title,
  compact = false,
}: {
  rows: AssetRow[];
  photos: Record<string, string>;
  people: Option[];
  categories: CategoryRow[];
  locations: Option[];
  vendors: Option[];
  canWrite: boolean;
  title: string;
  compact?: boolean;
}) {
  const [q, setQ] = React.useState('');
  const [category, setCategory] = React.useState('all');
  const [status, setStatus] = React.useState('all');
  const [panel, setPanel] = React.useState<Panel | null>(null);
  const term = q.trim().toLowerCase();
  const shown = rows.filter(
    (a) =>
      (category === 'all' || a.category_id === category) &&
      (status === 'all' || a.status === status) &&
      (!term ||
        `${a.tag} ${a.name} ${a.brand ?? ''} ${a.model ?? ''} ${a.serial_number ?? ''} ${holderOf(a) ?? ''} ${a.location?.name ?? ''}`
          .toLowerCase()
          .includes(term)),
  );
  const filtered = term !== '' || category !== 'all' || status !== 'all';
  const { shown: page, more } = useShowMore(shown, compact ? 8 : 25);

  const actions = (a: AssetRow) => [
    {
      label: 'Details and history',
      icon: <Eye />,
      opensOverlay: true,
      onSelect: () => setPanel({ kind: 'view', row: a }),
    },
    canWrite && {
      label: 'Edit details',
      icon: <Pencil />,
      opensOverlay: true,
      onSelect: () => setPanel({ kind: 'edit', row: a }),
    },
    canWrite &&
      (a.status === 'available' || a.status === 'in_use') && {
        label: a.status === 'in_use' ? 'Hand to someone else' : 'Hand over',
        icon: <Hand />,
        separated: true,
        opensOverlay: true,
        onSelect: () => setPanel({ kind: 'assign', row: a }),
      },
    canWrite &&
      a.status === 'in_use' && {
        label: 'Hand back',
        icon: <Undo2 />,
        opensOverlay: true,
        onSelect: () => setPanel({ kind: 'return', row: a }),
      },
    canWrite &&
      !['retired', 'lost'].includes(a.status) && {
        label: 'Schedule service',
        icon: <CalendarClock />,
        separated: true,
        opensOverlay: true,
        onSelect: () => setPanel({ kind: 'schedule', row: a }),
      },
    canWrite &&
      (a.status === 'available' || a.status === 'in_use') && {
        label: 'Send for maintenance',
        icon: <Wrench />,
        opensOverlay: true,
        onSelect: () => setPanel({ kind: 'start', row: a }),
      },
    canWrite &&
      a.status === 'maintenance' && {
        label: 'Back from maintenance',
        icon: <PackageCheck />,
        opensOverlay: true,
        onSelect: () => setPanel({ kind: 'complete', row: a }),
      },
    canWrite &&
      !['retired', 'lost'].includes(a.status) && {
        label: 'Report lost',
        icon: <XCircle />,
        tone: 'danger' as const,
        separated: true,
        opensOverlay: true,
        onSelect: () => setPanel({ kind: 'lost', row: a }),
      },
    canWrite &&
      !['retired', 'lost'].includes(a.status) && {
        label: 'Retire',
        icon: <XCircle />,
        tone: 'danger' as const,
        opensOverlay: true,
        onSelect: () => setPanel({ kind: 'retired', row: a }),
      },
    canWrite &&
      ['retired', 'lost'].includes(a.status) && {
        label: 'Bring back into use',
        icon: <RotateCcw />,
        separated: true,
        opensOverlay: true,
        onSelect: () => setPanel({ kind: 'available', row: a }),
      },
  ];

  const thumb = (a: AssetRow, size = 'h-11 w-11') =>
    photos[a.id] ? (
      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
      <img
        src={photos[a.id]}
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
        <CategoryIcon icon={a.category?.icon ?? null} className="h-5 w-5" />
      </span>
    );

  const columns: ColumnDef<AssetRow, unknown>[] = [
    {
      id: 'name',
      accessorFn: (a) => a.name,
      header: 'Asset',
      cell: ({ row: { original: a } }) => (
        <span className="flex min-w-0 items-center gap-3">
          {thumb(a)}
          <span className="min-w-0">
            <button
              type="button"
              onClick={() => setPanel({ kind: 'view', row: a })}
              className="hover:text-gold-text block max-w-[15rem] truncate text-left font-semibold underline-offset-4 hover:underline"
            >
              {a.name}
            </button>
            <span className="text-muted-light block text-xs">
              {a.tag}
              {a.serial_number && ` · SN: ${a.serial_number}`}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: 'category',
      accessorFn: (a) => a.category?.name ?? '',
      header: 'Category',
      cell: ({ row: { original: a } }) => (
        <span className="flex items-center gap-2">
          <CategoryIcon
            icon={a.category?.icon ?? null}
            className="h-4 w-4 shrink-0 text-[#E5A800]"
          />
          {a.category?.name}
        </span>
      ),
    },
    {
      id: 'holder',
      accessorFn: (a) => holderOf(a) ?? '',
      header: 'Assigned to',
      cell: ({ row: { original: a } }) => (
        <Person name={holderOf(a)} sub={a.assigned_at ? `since ${day(a.assigned_at)}` : null} />
      ),
    },
    {
      id: 'location',
      accessorFn: (a) => a.location?.name ?? '',
      header: 'Location',
      cell: ({ row: { original: a } }) => <span>{a.location?.name ?? '—'}</span>,
    },
    {
      id: 'condition',
      accessorFn: (a) => a.condition,
      header: 'Condition',
      cell: ({ row: { original: a } }) => (
        <Pill tone={ASSET_CONDITION[a.condition]?.tone ?? 'grey'}>
          {ASSET_CONDITION[a.condition]?.label ?? a.condition}
        </Pill>
      ),
    },
    {
      id: 'service',
      accessorFn: (a) => a.next_service_on ?? '9999',
      header: 'Next service',
      cell: ({ row: { original: a } }) => <ServiceDue on={a.next_service_on} />,
    },
    {
      id: 'status',
      accessorFn: (a) => a.status,
      header: 'Status',
      cell: ({ row: { original: a } }) => (
        <Pill tone={ASSET_STATUS[a.status]?.tone ?? 'grey'} dot>
          {ASSET_STATUS[a.status]?.label ?? a.status}
        </Pill>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row: { original: a } }) => (
        <span className="flex items-center justify-end">
          <IconAction
            label={`Details of ${a.name}`}
            onClick={() => setPanel({ kind: 'view', row: a })}
          >
            <Eye />
          </IconAction>
          <ActionMenu label={`Actions for ${a.name}`} actions={actions(a)} />
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
            placeholder="Search tag, name, serial or person…"
            label="Search equipment"
            className="w-full sm:w-72"
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
            label="Status"
            value={status}
            onChange={setStatus}
            className="flex-1 sm:flex-none"
            options={[
              { value: 'all', label: 'Any status' },
              ...Object.entries(ASSET_STATUS).map(([k, v]) => ({ value: k, label: v.label })),
            ]}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<Laptop className="h-5 w-5" />}
          title={filtered ? 'Nothing matches' : 'No equipment here'}
          description={
            filtered
              ? 'Try another search, category or status.'
              : 'Register laptops, phones, motorbikes and other serial-numbered equipment with Register asset.'
          }
          {...(filtered
            ? {
                action: {
                  label: 'Clear filters',
                  onClick: () => {
                    setQ('');
                    setCategory('all');
                    setStatus('all');
                  },
                },
              }
            : {})}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable
              caption={title}
              columns={columns}
              data={page}
              onRowClick={(a) => setPanel({ kind: 'view', row: a })}
            />
          </div>
          <ul className="divide-border border-border divide-y overflow-hidden rounded-2xl border md:hidden">
            {page.map((a) => (
              <li key={a.id} className="flex items-center gap-3 bg-white px-3 py-3">
                {thumb(a, 'h-12 w-12')}
                <button
                  type="button"
                  onClick={() => setPanel({ kind: 'view', row: a })}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-bold">{a.name}</span>
                  <span className="text-muted-light block truncate text-xs">
                    {a.tag} · {holderOf(a) ?? a.location?.name ?? 'Not assigned'}
                  </span>
                  <span className="mt-1 flex gap-1.5">
                    <Pill tone={ASSET_STATUS[a.status]?.tone ?? 'grey'} dot>
                      {ASSET_STATUS[a.status]?.label ?? a.status}
                    </Pill>
                  </span>
                </button>
                <ActionMenu label={`Actions for ${a.name}`} actions={actions(a)} />
              </li>
            ))}
          </ul>
          {more}
        </>
      )}

      {panel?.kind === 'view' && (
        <AssetDetail
          asset={panel.row}
          photo={photos[panel.row.id] ?? null}
          onClose={() => setPanel(null)}
        />
      )}
      {panel?.kind === 'edit' && (
        <AssetPanel
          asset={panel.row}
          photo={photos[panel.row.id] ?? null}
          categories={categories}
          locations={locations}
          vendors={vendors}
          onClose={() => setPanel(null)}
        />
      )}
      {panel?.kind === 'assign' && (
        <AssignPanel asset={panel.row} people={people} onClose={() => setPanel(null)} />
      )}
      {panel?.kind === 'return' && <ReturnPanel asset={panel.row} onClose={() => setPanel(null)} />}
      {panel &&
        (panel.kind === 'schedule' || panel.kind === 'start' || panel.kind === 'complete') && (
          <MaintenancePanel asset={panel.row} step={panel.kind} onClose={() => setPanel(null)} />
        )}
      {panel &&
        (panel.kind === 'retired' || panel.kind === 'lost' || panel.kind === 'available') && (
          <StatusPanel asset={panel.row} status={panel.kind} onClose={() => setPanel(null)} />
        )}
    </div>
  );
}

/* ──────────────────────────────────────────────────── details, history */

function AssetDetail({
  asset: a,
  photo,
  onClose,
}: {
  asset: AssetRow;
  photo: string | null;
  onClose: () => void;
}) {
  const [history, setHistory] = React.useState<ActivityRow[] | null>(null);
  React.useEffect(() => {
    void createClient()
      .from('company_activity_v')
      .select('*')
      .eq('asset_id', a.id)
      .order('at', { ascending: false })
      .limit(100)
      .then(({ data }) => setHistory((data ?? []) as ActivityRow[]));
  }, [a.id]);

  const facts: [string, React.ReactNode][] = [
    ['Tag', a.tag],
    ['Category', a.category?.name ?? '—'],
    ['Brand and model', [a.brand, a.model].filter(Boolean).join(' ') || '—'],
    ['Serial number', a.serial_number ?? '—'],
    ['Assigned to', holderOf(a) ?? 'Nobody'],
    ['Location', a.location?.name ?? '—'],
    ['Condition', ASSET_CONDITION[a.condition]?.label ?? a.condition],
    [
      'Bought',
      a.purchase_date ? `${day(a.purchase_date)}${a.vendor ? ` from ${a.vendor.name}` : ''}` : '—',
    ],
    ['Cost', a.purchase_cost_cents != null ? kes(a.purchase_cost_cents) : '—'],
    ['Warranty until', a.warranty_until ? day(a.warranty_until) : '—'],
    ['Next service', a.next_service_on ? day(a.next_service_on) : 'Not scheduled'],
  ];

  return (
    <DetailPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={a.name}
      subtitle={`${a.tag}${a.serial_number ? ` · SN ${a.serial_number}` : ''}`}
      meta={
        <>
          <Pill tone={ASSET_STATUS[a.status]?.tone ?? 'grey'} dot>
            {ASSET_STATUS[a.status]?.label ?? a.status}
          </Pill>
          <Pill tone={ASSET_CONDITION[a.condition]?.tone ?? 'grey'}>
            {ASSET_CONDITION[a.condition]?.label}
          </Pill>
        </>
      }
      width="lg"
    >
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">
            <Info className="h-4 w-4" /> Details
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4" /> History
          </TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="space-y-5">
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
            <img
              src={photo}
              alt={a.name}
              className="border-border max-h-64 w-full rounded-2xl border object-contain"
            />
          )}
          <dl className="divide-border border-border divide-y rounded-2xl border">
            {facts.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-4 py-3 text-sm">
                <dt className="text-muted font-semibold">{k}</dt>
                <dd className="text-right font-bold">{v}</dd>
              </div>
            ))}
          </dl>
          {a.notes && <p className="bg-bg rounded-xl px-4 py-3 text-sm">{a.notes}</p>}
        </TabsContent>
        <TabsContent value="history">
          {history == null ? (
            <p className="text-muted-light py-6 text-center text-sm">Loading history…</p>
          ) : (
            <ActivityFeed rows={history} empty="Nothing recorded yet." />
          )}
        </TabsContent>
      </Tabs>
    </DetailPanel>
  );
}

/* ─────────────────────────────────────────────────────────── the forms */

export function RegisterAsset(props: {
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
        Register asset
      </Button>
      {open && <AssetPanel {...props} asset={null} photo={null} onClose={() => setOpen(false)} />}
    </>
  );
}

function AssetPanel({
  asset,
  photo,
  categories,
  locations,
  vendors,
  onClose,
}: {
  asset: AssetRow | null;
  photo: string | null;
  categories: CategoryRow[];
  locations: Option[];
  vendors: Option[];
  onClose: () => void;
}) {
  const [f, setF] = React.useState({
    name: asset?.name ?? '',
    categoryId: asset?.category_id ?? '',
    brand: asset?.brand ?? '',
    model: asset?.model ?? '',
    serialNumber: asset?.serial_number ?? '',
    locationId: asset?.location_id ?? locations[0]?.id ?? '',
    condition: asset?.condition ?? 'new',
    purchaseDate: asset?.purchase_date ?? '',
    cost: fromCents(asset?.purchase_cost_cents),
    vendorId: asset?.vendor_id ?? '',
    warrantyUntil: asset?.warranty_until ?? '',
    nextServiceOn: asset?.next_service_on ?? '',
    photoPath: asset?.photo_path ?? null,
    notes: asset?.notes ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const { run, busy } = useRunner();
  const { toast } = useToast();

  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={asset ? 'Edit asset' : 'Register asset'}
      subtitle={asset ? `${asset.tag} · ${asset.name}` : 'Serial-numbered equipment NexG owns'}
      submitLabel={asset ? 'Save asset' : 'Register asset'}
      busy={busy}
      width="lg"
      onSubmit={async () => {
        const cents = toCents(f.cost);
        if (Number.isNaN(cents)) {
          toast({ tone: 'warning', title: 'Enter the cost in shillings' });
          return false;
        }
        if (!f.categoryId) {
          toast({ tone: 'warning', title: 'Choose a category' });
          return false;
        }
        return run(() =>
          saveAsset({
            id: asset?.id,
            name: f.name,
            categoryId: f.categoryId,
            brand: f.brand,
            model: f.model,
            serialNumber: f.serialNumber,
            locationId: f.locationId || null,
            condition: f.condition,
            purchaseDate: f.purchaseDate || null,
            purchaseCostCents: cents,
            vendorId: f.vendorId || null,
            warrantyUntil: f.warrantyUntil || null,
            nextServiceOn: f.nextServiceOn || null,
            photoPath: f.photoPath,
            notes: f.notes,
          }),
        );
      }}
    >
      <PhotoField
        current={photo}
        hasPhoto={f.photoPath != null}
        onUploaded={(p) => set('photoPath', p)}
        onRemove={() => set('photoPath', null)}
      />
      <TextField
        label="Name"
        required
        value={f.name}
        onChange={(e) => set('name', e.target.value)}
        maxLength={120}
        placeholder="MacBook Pro 14”"
      />
      <FieldRow>
        <SelectField
          label="Category"
          required
          value={f.categoryId}
          onChange={(e) => set('categoryId', e.target.value)}
          placeholder="Choose a category"
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
        />
        <SelectField
          label="Condition"
          value={f.condition}
          onChange={(e) => set('condition', e.target.value)}
          options={Object.entries(ASSET_CONDITION).map(([k, v]) => ({ value: k, label: v.label }))}
        />
      </FieldRow>
      <FieldRow>
        <TextField
          label="Brand"
          value={f.brand}
          onChange={(e) => set('brand', e.target.value)}
          maxLength={60}
        />
        <TextField
          label="Model"
          value={f.model}
          onChange={(e) => set('model', e.target.value)}
          maxLength={80}
        />
      </FieldRow>
      <FieldRow>
        <TextField
          label="Serial number"
          value={f.serialNumber}
          onChange={(e) => set('serialNumber', e.target.value)}
          maxLength={80}
        />
        <SelectField
          label="Location"
          value={f.locationId}
          onChange={(e) => set('locationId', e.target.value)}
          placeholder="Not at a location"
          options={locations.map((l) => ({ value: l.id, label: l.name }))}
        />
      </FieldRow>
      <FieldRow>
        <TextField
          label="Bought on"
          type="date"
          max={todayInNairobi()}
          value={f.purchaseDate}
          onChange={(e) => set('purchaseDate', e.target.value)}
        />
        <TextField
          label="Cost (KES)"
          inputMode="decimal"
          value={f.cost}
          onChange={(e) => set('cost', e.target.value)}
        />
      </FieldRow>
      <FieldRow>
        <SelectField
          label="Bought from"
          value={f.vendorId}
          onChange={(e) => set('vendorId', e.target.value)}
          placeholder="Not recorded"
          options={vendors.map((v) => ({ value: v.id, label: v.name }))}
        />
        <TextField
          label="Warranty until"
          type="date"
          value={f.warrantyUntil}
          onChange={(e) => set('warrantyUntil', e.target.value)}
        />
      </FieldRow>
      <TextField
        label="Next service"
        type="date"
        value={f.nextServiceOn}
        onChange={(e) => set('nextServiceOn', e.target.value)}
        hint="Leave empty if it needs no regular service."
      />
      <TextArea
        label="Notes"
        value={f.notes}
        onChange={(e) => set('notes', e.target.value)}
        maxLength={1000}
      />
    </FormPanel>
  );
}

function AssignPanel({
  asset,
  people,
  onClose,
}: {
  asset: AssetRow;
  people: Option[];
  onClose: () => void;
}) {
  const [who, setWho] = React.useState<'staff' | 'other'>('staff');
  const [staffId, setStaffId] = React.useState('');
  const [name, setName] = React.useState('');
  const [note, setNote] = React.useState('');
  const { run, busy } = useRunner();
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={asset.status === 'in_use' ? 'Hand to someone else' : 'Hand over'}
      subtitle={`${asset.tag} · ${asset.name}`}
      submitLabel="Hand over"
      busy={busy}
      onSubmit={() =>
        run(() =>
          assignAsset({
            id: asset.id,
            staffId: who === 'staff' ? staffId || null : null,
            assigneeName: who === 'other' ? name : '',
            note,
          }),
        )
      }
    >
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-2 text-sm font-bold">Who takes it</legend>
        {(
          [
            ['staff', 'A colleague', 'Someone with a console account'],
            ['other', 'Someone else', 'A rider, driver or contractor'],
          ] as const
        ).map(([k, label, hint]) => (
          <label
            key={k}
            className={cn(
              'cursor-pointer rounded-xl border p-3 transition-colors',
              who === k ? 'border-ink bg-gold-soft' : 'border-border hover:bg-bg',
            )}
          >
            <input
              type="radio"
              name="who"
              className="sr-only"
              checked={who === k}
              onChange={() => setWho(k)}
            />
            <span className="block text-sm font-bold">{label}</span>
            <span className="text-muted-light block text-xs">{hint}</span>
          </label>
        ))}
      </fieldset>
      {who === 'staff' ? (
        <SelectField
          label="Colleague"
          required
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          placeholder="Choose a colleague"
          options={people.map((p) => ({ value: p.id, label: p.name }))}
        />
      ) : (
        <TextField
          label="Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          placeholder="Rider #442 – Brian Otieno"
        />
      )}
      <TextArea
        label="Note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={400}
        placeholder="Charger and case included"
      />
    </FormPanel>
  );
}

function ReturnPanel({ asset, onClose }: { asset: AssetRow; onClose: () => void }) {
  const [condition, setCondition] = React.useState(asset.condition);
  const [note, setNote] = React.useState('');
  const { run, busy } = useRunner();
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title="Hand back"
      subtitle={`${asset.tag} · ${asset.name} · from ${holderOf(asset)}`}
      submitLabel="Record hand-back"
      busy={busy}
      onSubmit={() => run(() => returnAsset({ id: asset.id, condition, note }))}
    >
      <SelectField
        label="Condition now"
        value={condition}
        onChange={(e) => setCondition(e.target.value)}
        options={Object.entries(ASSET_CONDITION).map(([k, v]) => ({ value: k, label: v.label }))}
      />
      <TextArea
        label="Note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={400}
        placeholder="Scratched lid, charger missing…"
      />
    </FormPanel>
  );
}

function MaintenancePanel({
  asset,
  step,
  onClose,
}: {
  asset: AssetRow;
  step: 'schedule' | 'start' | 'complete';
  onClose: () => void;
}) {
  const [dueOn, setDueOn] = React.useState(
    step === 'schedule' ? (asset.next_service_on ?? '') : '',
  );
  const [cost, setCost] = React.useState('');
  const [condition, setCondition] = React.useState(asset.condition);
  const [note, setNote] = React.useState('');
  const { run, busy } = useRunner();
  const { toast } = useToast();
  const titles = {
    schedule: 'Schedule service',
    start: 'Send for maintenance',
    complete: 'Back from maintenance',
  };
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={titles[step]}
      subtitle={`${asset.tag} · ${asset.name}`}
      submitLabel={titles[step]}
      busy={busy}
      onSubmit={async () => {
        const cents = toCents(cost);
        if (Number.isNaN(cents)) {
          toast({ tone: 'warning', title: 'Enter the cost in shillings' });
          return false;
        }
        return run(() =>
          maintainAsset({
            id: asset.id,
            step,
            dueOn: dueOn || null,
            costCents: cents,
            condition: step === 'complete' ? condition : null,
            note,
          }),
        );
      }}
    >
      {step === 'schedule' && (
        <TextField
          label="Service date"
          type="date"
          required
          min={todayInNairobi()}
          value={dueOn}
          onChange={(e) => setDueOn(e.target.value)}
        />
      )}
      {step === 'start' && (
        <p className="bg-bg rounded-xl px-4 py-3 text-sm">
          The asset shows as under maintenance until it comes back.
          {asset.status === 'in_use' && ` It stays on ${holderOf(asset)}'s name meanwhile.`}
        </p>
      )}
      {step === 'complete' && (
        <>
          <FieldRow>
            <TextField
              label="Cost (KES)"
              inputMode="decimal"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
            <SelectField
              label="Condition now"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              options={Object.entries(ASSET_CONDITION).map(([k, v]) => ({
                value: k,
                label: v.label,
              }))}
            />
          </FieldRow>
          <TextField
            label="Next service"
            type="date"
            min={todayInNairobi()}
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
            hint="Leave empty if no further service is due."
          />
        </>
      )}
      <TextArea
        label={step === 'start' ? 'What is wrong' : 'Note'}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
      />
    </FormPanel>
  );
}

function StatusPanel({
  asset,
  status,
  onClose,
}: {
  asset: AssetRow;
  status: 'retired' | 'lost' | 'available';
  onClose: () => void;
}) {
  const [reason, setReason] = React.useState('');
  const { run, busy } = useRunner();
  const copy = {
    retired: {
      title: 'Retire asset',
      button: 'Retire',
      hint: 'Sold, scrapped or worn out. It leaves the active lists; its history stays.',
    },
    lost: {
      title: 'Report lost',
      button: 'Report lost',
      hint: 'It stays on the holder’s name so the record shows who had it last.',
    },
    available: {
      title: 'Bring back into use',
      button: 'Make available',
      hint: 'Found again, or returned to service.',
    },
  }[status];
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={copy.title}
      subtitle={`${asset.tag} · ${asset.name}`}
      submitLabel={copy.button}
      busy={busy}
      danger={status !== 'available'}
      onSubmit={() => run(() => setAssetStatus(asset.id, status, reason))}
    >
      <p className="bg-bg rounded-xl px-4 py-3 text-sm">{copy.hint}</p>
      <TextArea
        label="Why"
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
      />
    </FormPanel>
  );
}
