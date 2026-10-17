'use client';

import type { Database, Json } from '@nexg/db';
import { Button, Card, Input, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  partnerGoLive,
  publishCuratedDay,
  publishEvent,
  saveCatalogueRecord,
  type CatalogueKind,
} from '@/app/experiences/actions';

type Tables = Database['public']['Tables'];
type City = Pick<Tables['city']['Row'], 'id' | 'name' | 'slug'>;
type PartnerRow = Pick<
  Tables['experience_partner']['Row'],
  | 'id'
  | 'name'
  | 'kind'
  | 'city_id'
  | 'status'
  | 'contact_name'
  | 'contact_phone'
  | 'contact_email'
  | 'preferred_channel'
  | 'can_answer_holds'
  | 'terms'
  | 'went_live_at'
>;
type PartnerOption = Pick<
  Tables['experience_partner']['Row'],
  'id' | 'name' | 'city_id' | 'status' | 'kind'
>;
type ComponentRow = Pick<
  Tables['experience_component']['Row'],
  | 'id'
  | 'partner_id'
  | 'city_id'
  | 'kind'
  | 'mood'
  | 'title'
  | 'subtitle'
  | 'description'
  | 'duration_min'
  | 'default_slot'
  | 'earliest_start'
  | 'latest_start'
  | 'price_kes'
  | 'price_basis'
  | 'min_party'
  | 'max_party'
  | 'party_types'
  | 'includes'
  | 'tags'
  | 'tier'
  | 'swap_group'
  | 'status'
  | 'booking_lead_hours'
  | 'capacity_per_day'
  | 'sort'
  | 'cover_path'
>;
type DayRow = Pick<
  Tables['curated_day']['Row'],
  | 'id'
  | 'city_id'
  | 'slug'
  | 'title'
  | 'tagline'
  | 'cover_path'
  | 'badge'
  | 'party_types'
  | 'duration'
  | 'price_per_person_kes'
  | 'status'
  | 'sort'
  | 'featured'
>;
type DayBlock = Pick<
  Tables['curated_day_block']['Row'],
  'id' | 'curated_day_id' | 'component_id' | 'slot' | 'start_time' | 'sort'
>;
type DayBlockDraft = {
  component_id: string;
  slot: Database['public']['Enums']['block_slot'];
  start_time: string;
};
type EventRow = Pick<
  Tables['event']['Row'],
  | 'id'
  | 'city_id'
  | 'name'
  | 'category'
  | 'venue_name'
  | 'venue_address'
  | 'starts_at'
  | 'ends_at'
  | 'doors_at'
  | 'organiser_name'
  | 'organiser_url'
  | 'ticket_url'
  | 'ticket_partner_id'
  | 'ticket_bands'
  | 'nexg_can_hold_tickets'
  | 'practical_note'
  | 'cover_path'
  | 'status'
  | 'featured'
  | 'anchor_slot'
  | 'suggested_blocks'
  | 'source'
  | 'submitted_by_partner_id'
  | 'submission_note'
  | 'rejected_reason'
>;

type Kind = 'curated' | 'components' | 'events' | 'partners';

interface Props {
  kind: Kind;
  cities: City[];
  partners?: PartnerRow[] | PartnerOption[];
  components?: ComponentRow[];
  days?: DayRow[];
  dayBlocks?: DayBlock[];
  events?: EventRow[];
  thinGroups?: { swap_group: string; tiers: number }[];
  canEdit: boolean;
  canManagePartners: boolean;
  canActivatePartners: boolean;
}

const SELECT_CLASS =
  'bg-surface border-border-strong focus:ring-gold h-11 w-full rounded-lg border px-3 text-sm font-semibold focus:outline-none focus:ring-2';

const BLOCK_SLOTS = [
  'early',
  'morning',
  'midday',
  'afternoon',
  'evening',
  'night',
  'late',
] as const;
const MOODS = ['wild', 'taste', 'night', 'slow', 'stay', 'events'];
const BLOCK_KINDS = ['activity', 'meal', 'venue', 'transport', 'stay', 'event', 'free'];
const PRICE_BASES = ['per_person', 'per_group', 'per_vehicle', 'per_night', 'face_value'];

function FieldSelect({
  id,
  label,
  name,
  value,
  options,
  required = false,
  controlled = false,
  onChange,
}: {
  id: string;
  label: string;
  name: string;
  value?: string;
  options: { value: string; label: string }[];
  required?: boolean;
  controlled?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-muted text-xs font-bold">
        {label}
      </label>
      <select
        id={id}
        name={name}
        {...(controlled ? { value: value ?? '' } : { defaultValue: value ?? '' })}
        required={required}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className={SELECT_CLASS}
      >
        {!required && <option value="">—</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function CheckField({
  id,
  label,
  name,
  checked,
}: {
  id: string;
  label: string;
  name: string;
  checked?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex min-h-11 items-center gap-2 text-sm font-semibold">
      <input
        id={id}
        type="checkbox"
        name={name}
        defaultChecked={checked}
        className="accent-gold h-4 w-4 rounded"
      />
      {label}
    </label>
  );
}

function FormActions({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <Button type="submit" size="sm" loading={busy} loadingText="Saving…">
        Save draft
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
    </div>
  );
}

function useSave(kind: CatalogueKind, id: string | null, onSaved: () => void) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const save = async (data: Json, blocks?: Json) => {
    setBusy(true);
    try {
      const result = await saveCatalogueRecord({ kind, id, data, blocks });
      toast({
        title: result.ok ? 'Saved' : 'Could not save',
        description: result.message,
        tone: result.ok ? 'success' : 'danger',
      });
      if (result.ok) {
        onSaved();
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return { busy, save };
}

function formData(form: HTMLFormElement) {
  return new FormData(form);
}

function field(data: FormData, key: string): string {
  return String(data.get(key) ?? '').trim();
}

function optionalNumber(data: FormData, key: string): number | null {
  const raw = field(data, key);
  return raw === '' ? null : Number(raw);
}

function stringList(data: FormData, key: string, fallback: string[] = []): string[] {
  const raw = field(data, key);
  return raw
    ? [
        ...new Set(
          raw
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean),
        ),
      ]
    : fallback;
}

function CitySelect({
  cities,
  value,
  controlled,
  onChange,
}: {
  cities: City[];
  value?: string;
  controlled?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <FieldSelect
      id="city_id"
      label="City"
      name="city_id"
      value={value}
      controlled={controlled}
      onChange={onChange}
      required
      options={cities.map((city) => ({ value: city.id, label: city.name }))}
    />
  );
}

function PartnerEditor({
  record,
  cities,
  onCancel,
}: {
  record: PartnerRow | null;
  cities: City[];
  onCancel: () => void;
}) {
  const { busy, save } = useSave('partner', record?.id ?? null, onCancel);
  const { toast } = useToast();
  const terms = (record?.terms ?? {}) as {
    cancellation_hours?: number;
    deposit_pct?: number;
    capacity_note?: string;
  };

  return (
    <form
      className="border-border mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = formData(event.currentTarget);
        if (!field(data, 'contact_phone') && !field(data, 'contact_email')) {
          toast({
            title: 'Contact details required',
            description: 'Add a phone number or an email address for this partner.',
            tone: 'danger',
          });
          return;
        }
        void save({
          name: field(data, 'name'),
          kind: field(data, 'kind'),
          city_id: field(data, 'city_id'),
          contact_name: field(data, 'contact_name') || null,
          contact_phone: field(data, 'contact_phone') || null,
          contact_email: field(data, 'contact_email') || null,
          preferred_channel: field(data, 'preferred_channel') || 'whatsapp',
          can_answer_holds: data.get('can_answer_holds') === 'on',
          terms: {
            cancellation_hours: optionalNumber(data, 'cancellation_hours'),
            deposit_pct: optionalNumber(data, 'deposit_pct'),
            capacity_note: field(data, 'capacity_note') || null,
          },
        });
      }}
    >
      <Input
        id="name"
        name="name"
        label="Partner name"
        defaultValue={record?.name ?? ''}
        required
      />
      <CitySelect cities={cities} value={record?.city_id} />
      <FieldSelect
        id="kind"
        name="kind"
        label="Partner type"
        value={record?.kind}
        required
        options={['operator', 'driver', 'venue', 'organiser', 'host', 'merchant_link'].map(
          (value) => ({ value, label: value.replace('_', ' ') }),
        )}
      />
      <Input
        id="contact_name"
        name="contact_name"
        label="Contact name"
        defaultValue={record?.contact_name ?? ''}
      />
      <Input
        id="contact_phone"
        name="contact_phone"
        label="Contact phone"
        type="tel"
        defaultValue={record?.contact_phone ?? ''}
      />
      <Input
        id="contact_email"
        name="contact_email"
        label="Contact email"
        type="email"
        defaultValue={record?.contact_email ?? ''}
      />
      <FieldSelect
        id="preferred_channel"
        name="preferred_channel"
        label="Preferred contact channel"
        value={record?.preferred_channel ?? 'whatsapp'}
        options={['whatsapp', 'phone', 'email', 'portal'].map((value) => ({
          value,
          label: value,
        }))}
      />
      <Input
        id="cancellation_hours"
        name="cancellation_hours"
        label="Cancellation notice (hours)"
        type="number"
        min={0}
        defaultValue={terms.cancellation_hours ?? ''}
      />
      <Input
        id="deposit_pct"
        name="deposit_pct"
        label="Deposit (%)"
        type="number"
        min={0}
        max={100}
        defaultValue={terms.deposit_pct ?? ''}
      />
      <Input
        id="capacity_note"
        name="capacity_note"
        label="Capacity note"
        defaultValue={terms.capacity_note ?? ''}
      />
      <CheckField
        id="can_answer_holds"
        name="can_answer_holds"
        label="Can answer booking holds"
        checked={record?.can_answer_holds ?? false}
      />
      <div className="sm:col-span-2">
        <FormActions busy={busy} onCancel={onCancel} />
      </div>
    </form>
  );
}

function ComponentEditor({
  record,
  cities,
  partners,
  onCancel,
}: {
  record: ComponentRow | null;
  cities: City[];
  partners: PartnerOption[];
  onCancel: () => void;
}) {
  const { busy, save } = useSave('component', record?.id ?? null, onCancel);
  const [cityId, setCityId] = React.useState(record?.city_id ?? cities[0]?.id ?? '');

  return (
    <form
      className="border-border mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = formData(event.currentTarget);
        void save({
          city_id: field(data, 'city_id'),
          partner_id: field(data, 'partner_id'),
          kind: field(data, 'kind'),
          mood: field(data, 'mood'),
          title: field(data, 'title'),
          subtitle: field(data, 'subtitle') || null,
          description: field(data, 'description') || null,
          duration_min: Number(field(data, 'duration_min')),
          default_slot: field(data, 'default_slot'),
          earliest_start: field(data, 'earliest_start') || null,
          latest_start: field(data, 'latest_start') || null,
          price_kes: optionalNumber(data, 'price_kes'),
          price_basis: field(data, 'price_basis'),
          min_party: optionalNumber(data, 'min_party') ?? 1,
          max_party: optionalNumber(data, 'max_party'),
          party_types: stringList(data, 'party_types', ['solo', 'couple', 'family', 'group']),
          includes: stringList(data, 'includes'),
          tags: stringList(data, 'tags'),
          tier: Number(field(data, 'tier')),
          swap_group: field(data, 'swap_group'),
          status: field(data, 'status'),
          booking_lead_hours: optionalNumber(data, 'booking_lead_hours') ?? 0,
          capacity_per_day: optionalNumber(data, 'capacity_per_day'),
          sort: optionalNumber(data, 'sort') ?? 0,
          cover_path: field(data, 'cover_path') || null,
        });
      }}
    >
      <CitySelect cities={cities} value={cityId} controlled onChange={setCityId} />
      <FieldSelect
        id="partner_id"
        name="partner_id"
        label="Partner · must be in this city"
        value={record?.partner_id}
        required
        options={partners
          .filter((partner) => partner.city_id === cityId)
          .map((partner) => ({
            value: partner.id,
            label: `${partner.name} · ${partner.status}`,
          }))}
      />
      <Input id="title" name="title" label="Title" defaultValue={record?.title ?? ''} required />
      <FieldSelect
        id="kind"
        name="kind"
        label="Block type"
        value={record?.kind}
        required
        options={BLOCK_KINDS.map((value) => ({ value, label: value.replace('_', ' ') }))}
      />
      <FieldSelect
        id="mood"
        name="mood"
        label="Mood"
        value={record?.mood}
        required
        options={MOODS.map((value) => ({ value, label: value }))}
      />
      <Input
        id="subtitle"
        name="subtitle"
        label="Short description"
        defaultValue={record?.subtitle ?? ''}
      />
      <div className="sm:col-span-2 lg:col-span-3">
        <Input
          id="description"
          name="description"
          label="Full description"
          defaultValue={record?.description ?? ''}
        />
      </div>
      <Input
        id="duration_min"
        name="duration_min"
        label="Duration (minutes)"
        type="number"
        min={1}
        max={4320}
        defaultValue={record?.duration_min ?? 90}
        required
      />
      <FieldSelect
        id="default_slot"
        name="default_slot"
        label="Default time of day"
        value={record?.default_slot}
        required
        options={BLOCK_SLOTS.map((value) => ({ value, label: value }))}
      />
      <FieldSelect
        id="price_basis"
        name="price_basis"
        label="Price basis"
        value={record?.price_basis ?? 'per_person'}
        required
        options={PRICE_BASES.map((value) => ({ value, label: value.replace('_', ' ') }))}
      />
      <Input
        id="price_kes"
        name="price_kes"
        label="Price (KES) · blank if not priced"
        type="number"
        min={1}
        defaultValue={record?.price_kes ?? ''}
      />
      <Input
        id="earliest_start"
        name="earliest_start"
        label="Earliest start"
        type="time"
        defaultValue={record?.earliest_start?.slice(0, 5) ?? ''}
      />
      <Input
        id="latest_start"
        name="latest_start"
        label="Latest start"
        type="time"
        defaultValue={record?.latest_start?.slice(0, 5) ?? ''}
      />
      <Input
        id="swap_group"
        name="swap_group"
        label="Swap group"
        defaultValue={record?.swap_group ?? ''}
        required
      />
      <Input
        id="tier"
        name="tier"
        label="Tier (1–5)"
        type="number"
        min={1}
        max={5}
        defaultValue={record?.tier ?? 3}
        required
      />
      <FieldSelect
        id="status"
        name="status"
        label="Catalogue status"
        value={record?.status ?? 'draft'}
        options={['draft', 'live', 'paused'].map((value) => ({ value, label: value }))}
      />
      <Input
        id="min_party"
        name="min_party"
        label="Minimum party size"
        type="number"
        min={1}
        defaultValue={record?.min_party ?? 1}
      />
      <Input
        id="max_party"
        name="max_party"
        label="Maximum party size"
        type="number"
        min={1}
        defaultValue={record?.max_party ?? ''}
      />
      <Input
        id="party_types"
        name="party_types"
        label="Party types (comma-separated)"
        defaultValue={record?.party_types.join(', ') ?? 'solo, couple, family, group'}
      />
      <Input
        id="includes"
        name="includes"
        label="What's included (comma-separated)"
        defaultValue={record?.includes.join(', ') ?? ''}
      />
      <Input
        id="tags"
        name="tags"
        label="Tags (comma-separated)"
        defaultValue={record?.tags.join(', ') ?? ''}
      />
      <Input
        id="booking_lead_hours"
        name="booking_lead_hours"
        label="Booking lead time (hours)"
        type="number"
        min={0}
        defaultValue={record?.booking_lead_hours ?? 0}
      />
      <Input
        id="capacity_per_day"
        name="capacity_per_day"
        label="Capacity per day"
        type="number"
        min={1}
        defaultValue={record?.capacity_per_day ?? ''}
      />
      <Input
        id="sort"
        name="sort"
        label="Display order"
        type="number"
        defaultValue={record?.sort ?? 0}
      />
      <Input
        id="cover_path"
        name="cover_path"
        label="Cover image path"
        defaultValue={record?.cover_path ?? ''}
      />
      <div className="sm:col-span-2 lg:col-span-3">
        <FormActions busy={busy} onCancel={onCancel} />
      </div>
    </form>
  );
}

function DayEditor({
  record,
  cities,
  components,
  dayBlocks,
  onCancel,
}: {
  record: DayRow | null;
  cities: City[];
  components: ComponentRow[];
  dayBlocks: DayBlock[];
  onCancel: () => void;
}) {
  const [cityId, setCityId] = React.useState(record?.city_id ?? cities[0]?.id ?? '');
  const [blocks, setBlocks] = React.useState<DayBlockDraft[]>(
    record
      ? dayBlocks
          .filter((block) => block.curated_day_id === record.id)
          .map((block) => ({
            component_id: block.component_id,
            slot: block.slot,
            start_time: block.start_time?.slice(0, 5) ?? '',
          }))
      : [],
  );
  const [componentId, setComponentId] = React.useState('');
  const [slot, setSlot] = React.useState<DayBlockDraft['slot']>('morning');
  const { busy, save } = useSave('curated_day', record?.id ?? null, onCancel);
  return (
    <form
      className="border-border mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = formData(event.currentTarget);
        const nextBlocks = blocks.map((block, index) => ({
          ...block,
          start_time: block.start_time || null,
          sort: index,
        }));
        void save(
          {
            city_id: field(data, 'city_id'),
            slug: field(data, 'slug'),
            title: field(data, 'title'),
            tagline: field(data, 'tagline') || null,
            cover_path: field(data, 'cover_path') || null,
            badge: field(data, 'badge') || null,
            party_types: stringList(data, 'party_types', ['solo', 'couple', 'family', 'group']),
            duration: field(data, 'duration'),
            price_per_person_kes: optionalNumber(data, 'price_per_person_kes'),
            sort: optionalNumber(data, 'sort') ?? 0,
            featured: data.get('featured') === 'on',
          },
          nextBlocks,
        );
      }}
    >
      <CitySelect cities={cities} value={cityId} controlled onChange={setCityId} />
      <Input id="slug" name="slug" label="URL slug" defaultValue={record?.slug ?? ''} required />
      <Input id="title" name="title" label="Title" defaultValue={record?.title ?? ''} required />
      <Input id="tagline" name="tagline" label="Tagline" defaultValue={record?.tagline ?? ''} />
      <FieldSelect
        id="duration"
        name="duration"
        label="Duration"
        value={record?.duration ?? 'day'}
        required
        options={['evening', 'day', 'weekend'].map((value) => ({ value, label: value }))}
      />
      <Input
        id="price_per_person_kes"
        name="price_per_person_kes"
        label="Price per person (KES)"
        type="number"
        min={1}
        defaultValue={record?.price_per_person_kes ?? ''}
      />
      <Input id="badge" name="badge" label="Badge" defaultValue={record?.badge ?? ''} />
      <Input
        id="cover_path"
        name="cover_path"
        label="Cover image path"
        defaultValue={record?.cover_path ?? ''}
      />
      <Input
        id="party_types"
        name="party_types"
        label="Party types (comma-separated)"
        defaultValue={record?.party_types.join(', ') ?? 'solo, couple, family, group'}
      />
      <Input
        id="sort"
        name="sort"
        label="Display order"
        type="number"
        defaultValue={record?.sort ?? 0}
      />
      <CheckField
        id="featured"
        name="featured"
        label="Feature on the experience home"
        checked={record?.featured ?? false}
      />
      <div className="space-y-3 sm:col-span-2">
        <div className="border-border rounded-xl border p-4">
          <p className="text-sm font-extrabold">Day blocks</p>
          <p className="text-muted-light mt-1 text-xs font-semibold">
            Publishing requires every day-block component to be live and priced.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
            <select
              aria-label="Component to add"
              className={SELECT_CLASS}
              value={componentId}
              onChange={(event) => setComponentId(event.target.value)}
            >
              <option value="">Choose a component</option>
              {components
                .filter((component) => {
                  return cityId ? component.city_id === cityId : true;
                })
                .map((component) => (
                  <option key={component.id} value={component.id}>
                    {component.title} · {component.status}
                  </option>
                ))}
            </select>
            <select
              aria-label="Block time of day"
              className={SELECT_CLASS}
              value={slot}
              onChange={(event) =>
                setSlot(BLOCK_SLOTS.find((value) => value === event.target.value) ?? 'morning')
              }
            >
              {BLOCK_SLOTS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!componentId}
              onClick={() => {
                setBlocks((current) => [
                  ...current,
                  { component_id: componentId, slot, start_time: '' },
                ]);
                setComponentId('');
              }}
            >
              Add block
            </Button>
          </div>
          {blocks.length === 0 ? (
            <p className="text-muted-light mt-3 text-xs font-semibold">No blocks added yet.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {blocks.map((block, index) => (
                <li
                  key={`${block.component_id}-${index}`}
                  className="bg-bg flex flex-wrap items-center gap-2 rounded-lg p-2"
                >
                  <span className="min-w-0 flex-1 text-xs font-bold">
                    {components.find((component) => component.id === block.component_id)?.title ??
                      'Unavailable component'}{' '}
                    · {block.slot}
                  </span>
                  <label className="text-muted text-xs font-semibold">
                    Starts at
                    <input
                      type="time"
                      aria-label={`Start time for block ${index + 1}`}
                      value={block.start_time}
                      onChange={(event) =>
                        setBlocks((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, start_time: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className="border-border-strong bg-surface ml-2 h-9 rounded border px-2"
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove block ${index + 1}`}
                    onClick={() => setBlocks((current) => current.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      <div className="sm:col-span-2">
        <FormActions busy={busy} onCancel={onCancel} />
      </div>
    </form>
  );
}

function dateInputValue(value: string | null): string {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

function dateInputIso(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}:00+03:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function ticketBandsValue(value: Json): string {
  return JSON.stringify(value ?? [], null, 2);
}

function EventEditor({
  record,
  cities,
  partners,
  onCancel,
}: {
  record: EventRow | null;
  cities: City[];
  partners: PartnerOption[];
  onCancel: () => void;
}) {
  const { busy, save } = useSave('event', record?.id ?? null, onCancel);
  const { toast } = useToast();

  return (
    <form
      className="border-border mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = formData(event.currentTarget);
        let bands: unknown;
        let suggested: unknown;
        try {
          bands = JSON.parse(field(data, 'ticket_bands'));
          suggested = JSON.parse(field(data, 'suggested_blocks'));
        } catch {
          toast({
            title: 'Check the event JSON',
            description: 'Ticket bands and suggested blocks must be valid JSON lists.',
            tone: 'danger',
          });
          return;
        }
        if (!Array.isArray(bands) || !Array.isArray(suggested)) {
          toast({
            title: 'Check the event JSON',
            description: 'Ticket bands and suggested blocks must each be a JSON list.',
            tone: 'danger',
          });
          return;
        }
        if (
          !bands.every(
            (band) =>
              typeof band === 'object' &&
              band !== null &&
              'label' in band &&
              typeof band.label === 'string' &&
              band.label.trim() !== '' &&
              'price_kes' in band &&
              typeof band.price_kes === 'number' &&
              Number.isFinite(band.price_kes) &&
              band.price_kes > 0,
          )
        ) {
          toast({
            title: 'Ticket bands need a check',
            description: 'Each band needs a label and a positive numeric price_kes.',
            tone: 'danger',
          });
          return;
        }
        const startsAt = dateInputIso(field(data, 'starts_at'));
        if (!startsAt) {
          toast({
            title: 'Start time required',
            description: 'Enter a valid event start time in Nairobi time.',
            tone: 'danger',
          });
          return;
        }
        const endsAt = dateInputIso(field(data, 'ends_at'));
        const doorsAt = dateInputIso(field(data, 'doors_at'));
        void save({
          city_id: field(data, 'city_id'),
          name: field(data, 'name'),
          category: field(data, 'category'),
          venue_name: field(data, 'venue_name') || null,
          venue_address: field(data, 'venue_address') || null,
          starts_at: startsAt,
          ends_at: endsAt,
          doors_at: doorsAt,
          organiser_name: field(data, 'organiser_name') || null,
          organiser_url: field(data, 'organiser_url') || null,
          ticket_url: field(data, 'ticket_url') || null,
          ticket_partner_id: field(data, 'ticket_partner_id') || null,
          ticket_bands: bands as Json,
          nexg_can_hold_tickets: data.get('nexg_can_hold_tickets') === 'on',
          practical_note: field(data, 'practical_note') || null,
          cover_path: field(data, 'cover_path') || null,
          featured: data.get('featured') === 'on',
          anchor_slot: field(data, 'anchor_slot'),
          suggested_blocks: suggested as Json,
        });
      }}
    >
      <CitySelect cities={cities} value={record?.city_id} />
      <Input id="name" name="name" label="Event name" defaultValue={record?.name ?? ''} required />
      <FieldSelect
        id="category"
        name="category"
        label="Category"
        value={record?.category ?? 'other'}
        required
        options={['sport', 'music', 'food_drink', 'culture', 'family', 'nightlife', 'other'].map(
          (value) => ({ value, label: value.replace('_', ' ') }),
        )}
      />
      <Input
        id="venue_name"
        name="venue_name"
        label="Venue"
        defaultValue={record?.venue_name ?? ''}
      />
      <Input
        id="venue_address"
        name="venue_address"
        label="Venue address"
        defaultValue={record?.venue_address ?? ''}
      />
      <Input
        id="starts_at"
        name="starts_at"
        label="Starts (Nairobi time)"
        type="datetime-local"
        defaultValue={dateInputValue(record?.starts_at ?? null)}
        required
      />
      <Input
        id="ends_at"
        name="ends_at"
        label="Ends (Nairobi time)"
        type="datetime-local"
        defaultValue={dateInputValue(record?.ends_at ?? null)}
      />
      <Input
        id="doors_at"
        name="doors_at"
        label="Doors open (Nairobi time)"
        type="datetime-local"
        defaultValue={dateInputValue(record?.doors_at ?? null)}
      />
      <Input
        id="organiser_name"
        name="organiser_name"
        label="Organiser"
        defaultValue={record?.organiser_name ?? ''}
      />
      <Input
        id="organiser_url"
        name="organiser_url"
        label="Organiser website"
        type="url"
        defaultValue={record?.organiser_url ?? ''}
      />
      <Input
        id="ticket_url"
        name="ticket_url"
        label="Ticket link"
        type="url"
        defaultValue={record?.ticket_url ?? ''}
      />
      <FieldSelect
        id="ticket_partner_id"
        name="ticket_partner_id"
        label="Ticket-holding partner"
        value={record?.ticket_partner_id ?? ''}
        options={partners.map((partner) => ({ value: partner.id, label: partner.name }))}
      />
      <FieldSelect
        id="anchor_slot"
        name="anchor_slot"
        label="Anchor time of day"
        value={record?.anchor_slot ?? 'evening'}
        required
        options={BLOCK_SLOTS.map((value) => ({ value, label: value }))}
      />
      <Input
        id="cover_path"
        name="cover_path"
        label="Cover image path"
        defaultValue={record?.cover_path ?? ''}
      />
      <div className="sm:col-span-2 lg:col-span-3">
        <Input
          id="practical_note"
          name="practical_note"
          label="Practical note"
          defaultValue={record?.practical_note ?? ''}
        />
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <label htmlFor="ticket_bands" className="text-muted text-xs font-bold">
          Ticket bands · JSON list of label, price_kes, and optional currency
        </label>
        <textarea
          id="ticket_bands"
          name="ticket_bands"
          rows={4}
          defaultValue={ticketBandsValue(record?.ticket_bands ?? [])}
          className="border-border-strong bg-surface focus:ring-gold mt-1 w-full rounded-lg border p-3 font-mono text-xs focus:outline-none focus:ring-2"
        />
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <label htmlFor="suggested_blocks" className="text-muted text-xs font-bold">
          Suggested blocks · JSON list for the day builder
        </label>
        <textarea
          id="suggested_blocks"
          name="suggested_blocks"
          rows={3}
          defaultValue={JSON.stringify(record?.suggested_blocks ?? [], null, 2)}
          className="border-border-strong bg-surface focus:ring-gold mt-1 w-full rounded-lg border p-3 font-mono text-xs focus:outline-none focus:ring-2"
        />
      </div>
      <CheckField
        id="nexg_can_hold_tickets"
        name="nexg_can_hold_tickets"
        label="NexG can request a ticket hold"
        checked={record?.nexg_can_hold_tickets ?? false}
      />
      <CheckField
        id="featured"
        name="featured"
        label="Feature this event"
        checked={record?.featured ?? false}
      />
      <div className="sm:col-span-2 lg:col-span-3">
        <FormActions busy={busy} onCancel={onCancel} />
      </div>
    </form>
  );
}

function WorkflowButton({
  label,
  action,
  variant = 'outline',
}: {
  label: string;
  action: () => Promise<{ ok: boolean; message?: string }>;
  variant?: 'outline' | 'black' | 'danger';
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const result = await action();
      toast({
        title: result.ok ? 'Done' : 'Not completed',
        description: result.message,
        tone: result.ok ? 'success' : 'danger',
      });
      if (result.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant={variant} loading={busy} onClick={run}>
      {label}
    </Button>
  );
}

function Status({ children }: { children: string }) {
  return (
    <span className="bg-bg text-muted rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold uppercase">
      {children.replace('_', ' ')}
    </span>
  );
}

export function ExperienceCatalogue(props: Props) {
  const { kind, cities, canEdit, canManagePartners } = props;
  const [editorId, setEditorId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const cityName = (cityId: string) =>
    cities.find((city) => city.id === cityId)?.name ?? 'Unknown city';

  const close = () => {
    setEditorId(null);
    setCreating(false);
  };

  const addButton = (label: string, allowed: boolean) => (
    <Button
      size="sm"
      disabled={!allowed}
      onClick={() => {
        setEditorId(null);
        setCreating(true);
      }}
    >
      {label}
    </Button>
  );

  if (kind === 'partners') {
    const partners = (props.partners ?? []) as PartnerRow[];
    return (
      <section className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted text-sm font-semibold">
            {partners.length} partner{partners.length === 1 ? '' : 's'} · go-live remains gated by
            verified essential documents.
          </p>
          {addButton('Add partner', canManagePartners)}
        </div>
        {creating && (
          <Card className="p-5">
            <h2 className="text-sm font-extrabold">New experience partner</h2>
            <PartnerEditor record={null} cities={cities} onCancel={close} />
          </Card>
        )}
        {partners.length === 0 && !creating ? (
          <Card tone="muted" className="p-6 text-sm font-semibold">
            No experience partners yet.
          </Card>
        ) : (
          <ul className="space-y-3">
            {partners.map((partner) => (
              <li key={partner.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-extrabold">{partner.name}</h2>
                      <p className="text-muted-light mt-1 text-xs font-semibold">
                        {partner.kind.replace('_', ' ')} · {cityName(partner.city_id)} ·{' '}
                        {partner.contact_phone ?? partner.contact_email ?? 'No contact'}
                      </p>
                    </div>
                    <Status>{partner.status}</Status>
                  </div>
                  {editorId === partner.id ? (
                    <PartnerEditor record={partner} cities={cities} onCancel={close} />
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canManagePartners}
                        onClick={() => {
                          setCreating(false);
                          setEditorId(partner.id);
                        }}
                      >
                        Edit profile
                      </Button>
                      {partner.status !== 'live' && props.canActivatePartners && (
                        <WorkflowButton
                          label="Verify documents & go live"
                          action={() => partnerGoLive(partner.id)}
                        />
                      )}
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  if (kind === 'events') {
    const events = props.events ?? [];
    const partners = (props.partners ?? []) as PartnerOption[];
    return (
      <section className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted text-sm font-semibold">
            {events.length} event{events.length === 1 ? '' : 's'} · only reviewed events can appear
            publicly.
          </p>
          {addButton('Add event', canEdit)}
        </div>
        {creating && (
          <Card className="p-5">
            <h2 className="text-sm font-extrabold">New event · saved as draft</h2>
            <EventEditor record={null} cities={cities} partners={partners} onCancel={close} />
          </Card>
        )}
        {events.length === 0 && !creating ? (
          <Card tone="muted" className="p-6 text-sm font-semibold">
            No events in the catalogue yet.
          </Card>
        ) : (
          <ul className="space-y-3">
            {events.map((item) => (
              <li key={item.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-extrabold">{item.name}</h2>
                      <p className="text-muted-light mt-1 text-xs font-semibold">
                        {cityName(item.city_id)} · {item.category.replace('_', ' ')} ·{' '}
                        {new Date(item.starts_at).toLocaleString('en-GB', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone: 'Africa/Nairobi',
                        })}{' '}
                        EAT
                      </p>
                      {item.submission_note && (
                        <p className="text-muted mt-2 text-xs">
                          Submission: {item.submission_note}
                        </p>
                      )}
                    </div>
                    <Status>{item.status}</Status>
                  </div>
                  {editorId === item.id ? (
                    <EventEditor
                      record={item}
                      cities={cities}
                      partners={partners}
                      onCancel={close}
                    />
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canEdit}
                        onClick={() => {
                          setCreating(false);
                          setEditorId(item.id);
                        }}
                      >
                        Edit event
                      </Button>
                      {item.status === 'draft' && canManagePartners && (
                        <WorkflowButton
                          label="Review & publish"
                          action={() => publishEvent(item.id)}
                        />
                      )}
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  if (kind === 'components') {
    const components = props.components ?? [];
    const partners = (props.partners ?? []) as PartnerOption[];
    return (
      <section className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted text-sm font-semibold">
            {components.length} component{components.length === 1 ? '' : 's'} · publishable
            components require a live partner and a price.
          </p>
          {addButton('Add component', canEdit)}
        </div>
        {creating && (
          <Card className="p-5">
            <h2 className="text-sm font-extrabold">New component · saved as draft</h2>
            <ComponentEditor record={null} cities={cities} partners={partners} onCancel={close} />
          </Card>
        )}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
          <ul className="space-y-3">
            {components.map((component) => (
              <li key={component.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-extrabold">{component.title}</h2>
                      <p className="text-muted-light mt-1 text-xs font-semibold">
                        {component.mood} · {component.swap_group} · tier {component.tier} ·{' '}
                        {cityName(component.city_id)} ·{' '}
                        {component.price_kes === null
                          ? 'KES [—]'
                          : `KES ${component.price_kes.toLocaleString('en-KE')}`}
                      </p>
                    </div>
                    <Status>{component.status}</Status>
                  </div>
                  {editorId === component.id ? (
                    <ComponentEditor
                      record={component}
                      cities={cities}
                      partners={partners}
                      onCancel={close}
                    />
                  ) : (
                    <div className="mt-4">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canEdit}
                        onClick={() => {
                          setCreating(false);
                          setEditorId(component.id);
                        }}
                      >
                        Edit component
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            ))}
            {components.length === 0 && !creating && (
              <li>
                <Card tone="muted" className="p-6 text-sm font-semibold">
                  No components yet.
                </Card>
              </li>
            )}
          </ul>
          <Card className="p-5">
            <h2 className="text-sm font-extrabold uppercase tracking-wide">Allocator health</h2>
            <p className="text-muted mt-2 text-xs font-semibold leading-[1.7]">
              Each live swap group needs at least three tiers for budget fitting and swaps to work.
            </p>
            <ul className="mt-3 space-y-2">
              {(props.thinGroups ?? []).length === 0 ? (
                <li className="text-success text-xs font-bold">
                  Every live group has three or more tiers.
                </li>
              ) : (
                props.thinGroups?.map((group) => (
                  <li key={group.swap_group} className="text-xs font-semibold">
                    <span className="text-warning font-extrabold">{group.swap_group}</span> ·{' '}
                    {group.tiers} tier{group.tiers === 1 ? '' : 's'} live
                  </li>
                ))
              )}
            </ul>
          </Card>
        </div>
      </section>
    );
  }

  const days = props.days ?? [];
  const components = props.components ?? [];
  return (
    <section className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted text-sm font-semibold">
          {days.length} curated day{days.length === 1 ? '' : 's'} · publication checks blocks and
          pricing.
        </p>
        {addButton('Add curated day', canEdit)}
      </div>
      {creating && (
        <Card className="p-5">
          <h2 className="text-sm font-extrabold">New curated day · saved as draft</h2>
          <DayEditor
            record={null}
            cities={cities}
            components={components}
            dayBlocks={props.dayBlocks ?? []}
            onCancel={close}
          />
        </Card>
      )}
      {days.length === 0 && !creating ? (
        <Card tone="muted" className="p-6 text-sm font-semibold">
          No curated days yet.
        </Card>
      ) : (
        <ul className="space-y-3">
          {days.map((day) => (
            <li key={day.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-extrabold">
                      {day.title}
                      {day.badge && (
                        <span className="bg-gold-soft text-gold-text ml-2 rounded px-1.5 py-0.5 text-[0.5625rem] font-extrabold">
                          {day.badge}
                        </span>
                      )}
                    </h2>
                    <p className="text-muted-light mt-1 text-xs font-semibold">
                      {cityName(day.city_id)} · {day.duration} · {day.slug} ·{' '}
                      {day.price_per_person_kes === null
                        ? 'KES [—]'
                        : `KES ${day.price_per_person_kes.toLocaleString('en-KE')} per person`}
                    </p>
                  </div>
                  <Status>{day.status}</Status>
                </div>
                {editorId === day.id ? (
                  <DayEditor
                    record={day}
                    cities={cities}
                    components={components}
                    dayBlocks={props.dayBlocks ?? []}
                    onCancel={close}
                  />
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canEdit}
                      onClick={() => {
                        setCreating(false);
                        setEditorId(day.id);
                      }}
                    >
                      Edit day & blocks
                    </Button>
                    {day.status !== 'live' && canEdit && (
                      <WorkflowButton
                        label="Check & publish"
                        action={() => publishCuratedDay(day.id)}
                      />
                    )}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
