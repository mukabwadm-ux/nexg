'use client';

import { Button, cn, DetailPanel, EmptyState } from '@nexg/ui';
import {
  Bike,
  Building2,
  Eye,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Power,
  PowerOff,
  Store,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';

import { saveLocation, setLocationActive } from '@/app/company/actions';
import {
  ActionMenu,
  FieldRow,
  FormPanel,
  SelectField,
  TextArea,
  TextField,
  useRunner,
} from '@/components/portal/client-kit';
import { CategoryIcon } from '@/components/company/icons';
import type { Option, StockRow } from '@/components/company/inventory';
import { Person, Pill } from '@/components/portal/kit';
import { ASSET_STATUS, kes, LOCATION_KINDS, quantity, STOCK_STATUS } from '@/lib/company';

export interface LocationRow {
  id: string;
  name: string;
  kind: string;
  city_id: string | null;
  address: string | null;
  manager_id: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  city: { name: string } | null;
  manager: { display_name: string | null; email: string } | null;
}

export interface LocationAsset {
  id: string;
  tag: string;
  name: string;
  status: string;
  location_id: string | null;
  category: { name: string; icon: string } | null;
}

const KIND_ICON: Record<string, LucideIcon> = {
  office: Building2,
  warehouse: Warehouse,
  store: Store,
  hub: Bike,
  other: MapPin,
};

type Panel =
  | { kind: 'view' | 'edit'; row: LocationRow }
  | { kind: 'close' | 'open'; row: LocationRow };

export function LocationsBoard({
  locations,
  stock,
  assets,
  people,
  cities,
  canWrite,
  title,
}: {
  locations: LocationRow[];
  stock: StockRow[];
  assets: LocationAsset[];
  people: Option[];
  cities: Option[];
  canWrite: boolean;
  title: string;
}) {
  const [panel, setPanel] = React.useState<Panel | null>(null);
  const stats = (id: string) => {
    const lines = stock.filter((s) => s.location_id === id);
    return {
      lines,
      value: lines.reduce((s, l) => s + l.value_cents, 0),
      low: lines.filter((l) => l.status !== 'in_stock').length,
      assets: assets.filter(
        (a) => a.location_id === id && a.status !== 'retired' && a.status !== 'lost',
      ),
    };
  };
  const biggest = Math.max(1, ...locations.map((l) => stats(l.id).value));

  return (
    <div>
      <h2 className="text-[1.125rem] font-extrabold tracking-[-0.01em]">{title}</h2>
      {locations.length === 0 ? (
        <EmptyState
          className="mt-4"
          icon={<Warehouse className="h-5 w-5" />}
          title="No locations here"
          description="Add the offices, warehouses, stores and rider hubs where NexG keeps stock and equipment."
        />
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {locations.map((l) => {
            const s = stats(l.id);
            const Icon = KIND_ICON[l.kind] ?? MapPin;
            return (
              <li
                key={l.id}
                className={cn(
                  'border-border relative flex flex-col rounded-2xl border bg-white p-4 transition-shadow hover:shadow-[0_14px_30px_-20px_rgba(20,20,20,0.5)]',
                  !l.active && 'bg-[#FAF9F6]',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                        l.active ? 'bg-ink text-gold' : 'bg-border text-muted',
                      )}
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.9} />
                    </span>
                    <span className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setPanel({ kind: 'view', row: l })}
                        className="hover:text-gold-text block truncate text-left text-[0.9375rem] font-extrabold underline-offset-4 after:absolute after:inset-0 after:content-[''] hover:underline"
                      >
                        {l.name}
                      </button>
                      <span className="text-muted-light block truncate text-xs">
                        {LOCATION_KINDS[l.kind] ?? l.kind}
                        {l.city ? ` · ${l.city.name}` : ''}
                      </span>
                    </span>
                  </span>
                  <span className="relative z-10">
                    <ActionMenu
                      label={`Actions for ${l.name}`}
                      actions={[
                        {
                          label: 'Stock and Equipment',
                          icon: <Eye />,
                          opensOverlay: true,
                          onSelect: () => setPanel({ kind: 'view', row: l }),
                        },
                        canWrite && {
                          label: 'Edit',
                          icon: <Pencil />,
                          opensOverlay: true,
                          onSelect: () => setPanel({ kind: 'edit', row: l }),
                        },
                        canWrite &&
                          (l.active
                            ? {
                                label: 'Close Location',
                                icon: <PowerOff />,
                                tone: 'danger' as const,
                                separated: true,
                                opensOverlay: true,
                                onSelect: () => setPanel({ kind: 'close', row: l }),
                              }
                            : {
                                label: 'Reopen Location',
                                icon: <Power />,
                                separated: true,
                                opensOverlay: true,
                                onSelect: () => setPanel({ kind: 'open', row: l }),
                              }),
                      ]}
                    />
                  </span>
                </div>

                <p data-figure className="mt-4 text-[1.375rem] font-extrabold tracking-[-0.02em]">
                  {kes(s.value)}
                </p>
                <p className="text-muted-light text-xs font-semibold">Stock Value</p>
                <div className="bg-border/70 mt-2 h-1.5 overflow-hidden rounded-full">
                  <div
                    className="from-gold-deep to-gold h-full rounded-full bg-gradient-to-r"
                    style={{ width: `${(s.value / biggest) * 100}%` }}
                  />
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {(
                    [
                      ['Stock Lines', s.lines.length, false],
                      ['Need Reorder', s.low, s.low > 0],
                      ['Equipment', s.assets.length, false],
                    ] as const
                  ).map(([k, v, alert]) => (
                    <div
                      key={k}
                      className={cn('rounded-xl px-2 py-2', alert ? 'bg-danger-bg' : 'bg-bg')}
                    >
                      <dd
                        className={cn(
                          'text-base font-extrabold tabular-nums',
                          alert && 'text-danger',
                        )}
                      >
                        {v}
                      </dd>
                      <dt className="text-muted-light text-[0.6875rem] font-semibold">{k}</dt>
                    </div>
                  ))}
                </dl>

                <div className="mt-4 flex items-center justify-between gap-2">
                  {l.manager ? (
                    <Person name={l.manager.display_name ?? l.manager.email} sub="Manager" />
                  ) : (
                    <span className="text-muted-light text-xs font-semibold">No manager named</span>
                  )}
                  {!l.active && <Pill tone="grey">Closed</Pill>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {panel?.kind === 'view' && (
        <LocationDetail
          location={panel.row}
          stock={stats(panel.row.id).lines}
          assets={stats(panel.row.id).assets}
          onClose={() => setPanel(null)}
        />
      )}
      {panel?.kind === 'edit' && (
        <LocationPanel
          location={panel.row}
          people={people}
          cities={cities}
          onClose={() => setPanel(null)}
        />
      )}
      {panel && (panel.kind === 'close' || panel.kind === 'open') && (
        <ActivePanel
          location={panel.row}
          active={panel.kind === 'open'}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}

function LocationDetail({
  location: l,
  stock,
  assets,
  onClose,
}: {
  location: LocationRow;
  stock: StockRow[];
  assets: LocationAsset[];
  onClose: () => void;
}) {
  return (
    <DetailPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={l.name}
      subtitle={[LOCATION_KINDS[l.kind], l.address, l.city?.name].filter(Boolean).join(' · ')}
      meta={!l.active ? <Pill tone="grey">Closed</Pill> : undefined}
      width="lg"
    >
      <div className="space-y-5">
        {(l.phone || l.manager) && (
          <div className="flex flex-wrap items-center gap-3">
            <Person
              name={l.manager?.display_name ?? l.manager?.email ?? null}
              sub="Manager"
              size="md"
            />
            {l.phone && (
              <a
                href={`tel:${l.phone}`}
                className="border-border hover:bg-bg ml-auto flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"
              >
                <Phone className="text-gold-text h-4 w-4" aria-hidden="true" /> {l.phone}
              </a>
            )}
          </div>
        )}
        <div>
          <h3 className="mb-2 text-sm font-extrabold">Stock Here</h3>
          {stock.length === 0 ? (
            <p className="text-muted-light text-sm">No stock kept here.</p>
          ) : (
            <ul className="divide-border border-border divide-y rounded-xl border">
              {stock.map((s) => (
                <li key={s.item_id} className="flex items-center gap-3 px-3 py-2.5">
                  <CategoryIcon
                    icon={s.category_icon}
                    className="h-4 w-4 shrink-0 text-[#E5A800]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{s.name}</span>
                    <span className="text-muted-light block text-xs">{kes(s.value_cents)}</span>
                  </span>
                  <span className="text-sm font-extrabold tabular-nums">
                    {quantity(s.quantity, s.unit)}
                  </span>
                  <Pill tone={STOCK_STATUS[s.status]!.tone} dot>
                    {STOCK_STATUS[s.status]!.label}
                  </Pill>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-extrabold">Equipment Here</h3>
          {assets.length === 0 ? (
            <p className="text-muted-light text-sm">No equipment based here.</p>
          ) : (
            <ul className="divide-border border-border divide-y rounded-xl border">
              {assets.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                  <CategoryIcon
                    icon={a.category?.icon ?? null}
                    className="text-muted h-4 w-4 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{a.name}</span>
                    <span className="text-muted-light block text-xs">{a.tag}</span>
                  </span>
                  <Pill tone={ASSET_STATUS[a.status]?.tone ?? 'grey'} dot>
                    {ASSET_STATUS[a.status]?.label ?? a.status}
                  </Pill>
                </li>
              ))}
            </ul>
          )}
        </div>
        {l.notes && <p className="bg-bg rounded-xl px-4 py-3 text-sm">{l.notes}</p>}
      </div>
    </DetailPanel>
  );
}

export function AddLocation({ people, cities }: { people: Option[]; cities: Option[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        variant="gold"
        leadingIcon={<Plus className="h-4 w-4" />}
        onClick={() => setOpen(true)}
      >
        Add Location
      </Button>
      {open && (
        <LocationPanel
          location={null}
          people={people}
          cities={cities}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function LocationPanel({
  location,
  people,
  cities,
  onClose,
}: {
  location: LocationRow | null;
  people: Option[];
  cities: Option[];
  onClose: () => void;
}) {
  const [f, setF] = React.useState({
    name: location?.name ?? '',
    kind: location?.kind ?? 'warehouse',
    cityId: location?.city_id ?? '',
    address: location?.address ?? '',
    managerId: location?.manager_id ?? '',
    phone: location?.phone ?? '',
    notes: location?.notes ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const { run, busy } = useRunner();
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={location ? 'Edit Location' : 'Add Location'}
      subtitle={location?.name ?? 'Where NexG keeps stock and equipment'}
      submitLabel={location ? 'Save Location' : 'Add Location'}
      busy={busy}
      onSubmit={() =>
        run(() =>
          saveLocation({
            id: location?.id,
            ...f,
            cityId: f.cityId || null,
            managerId: f.managerId || null,
          }),
        )
      }
    >
      <TextField
        label="Name"
        required
        value={f.name}
        onChange={(e) => set('name', e.target.value)}
        maxLength={80}
        placeholder="Nairobi HQ"
      />
      <FieldRow>
        <SelectField
          label="Kind"
          value={f.kind}
          onChange={(e) => set('kind', e.target.value)}
          options={Object.entries(LOCATION_KINDS).map(([k, v]) => ({ value: k, label: v }))}
        />
        <SelectField
          label="City"
          value={f.cityId}
          onChange={(e) => set('cityId', e.target.value)}
          placeholder="Not recorded"
          options={cities.map((c) => ({ value: c.id, label: c.name }))}
        />
      </FieldRow>
      <TextField
        label="Address"
        value={f.address}
        onChange={(e) => set('address', e.target.value)}
        maxLength={200}
        placeholder="Building, street, area"
      />
      <FieldRow>
        <SelectField
          label="Manager"
          value={f.managerId}
          onChange={(e) => set('managerId', e.target.value)}
          placeholder="Nobody named"
          options={people.map((p) => ({ value: p.id, label: p.name }))}
        />
        <TextField
          label="Phone"
          type="tel"
          value={f.phone}
          onChange={(e) => set('phone', e.target.value)}
          maxLength={30}
        />
      </FieldRow>
      <TextArea
        label="Notes"
        value={f.notes}
        onChange={(e) => set('notes', e.target.value)}
        maxLength={1000}
        placeholder="Opening hours, access, who holds the keys"
      />
    </FormPanel>
  );
}

function ActivePanel({
  location,
  active,
  onClose,
}: {
  location: LocationRow;
  active: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = React.useState('');
  const { run, busy } = useRunner();
  return (
    <FormPanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={active ? 'Reopen Location' : 'Close Location'}
      subtitle={location.name}
      submitLabel={active ? 'Reopen' : 'Close Location'}
      danger={!active}
      busy={busy}
      onSubmit={() => run(() => setLocationActive(location.id, active, reason))}
    >
      <p className="bg-bg rounded-xl px-4 py-3 text-sm">
        {active
          ? 'Stock can be received here again.'
          : 'A location closes only once it is empty: move or issue its stock and move its equipment first.'}
      </p>
      <TextArea
        label="Why"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
      />
    </FormPanel>
  );
}
