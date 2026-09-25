'use client';

import { MOTORISED_VEHICLES, type RiderStatus } from '@nexg/db';
import {
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardSkeleton,
  CardTitle,
  ChipGroup,
  type ColumnDef,
  DataTable,
  DetailPanel,
  DetailRow,
  EmptyState,
  FileDrop,
  Input,
  KpiTile,
  PhoneInput,
  Select,
  StatusBadge,
  STATUS_LABELS,
  type StatusKey,
  Stepper,
  Tag,
  useToast,
  VALUE_PLACEHOLDER,
} from '@nexg/ui';
import { Bike, Inbox, Mail, Search, Utensils, WifiOff } from 'lucide-react';
import { useState } from 'react';

import { Row, Section, slugFor, State, UI_KIT_SECTIONS } from './section';

/* ------------------------------------------------------------------ fixtures */

const CITIES = [
  { value: 'nairobi', label: 'Nairobi' },
  { value: 'mombasa', label: 'Mombasa' },
  { value: 'kisumu', label: 'Kisumu' },
  { value: 'nakuru', label: 'Nakuru' },
  { value: 'kampala', label: 'Kampala', disabled: true },
];

const VEHICLES = [
  { value: 'motorbike', label: 'Motorbike', icon: <Bike className="h-4 w-4" /> },
  { value: 'bicycle', label: 'Bicycle' },
  { value: 'car', label: 'Car' },
  { value: 'tuktuk', label: 'Tuk-tuk' },
];

const CATEGORIES = [
  { value: 'restaurant', label: 'Restaurant', icon: <Utensils className="h-4 w-4" /> },
  { value: 'bar_liquor', label: 'Bar & liquor' },
  { value: 'laundry', label: 'Laundry' },
  { value: 'pharmacy', label: 'Pharmacy' },
];

const APPLICATION_STEPS = [
  { label: 'About you', description: 'Name, phone, city' },
  { label: 'Your documents', description: 'ID, licence, insurance' },
  { label: 'Done', description: 'We verify and reply' },
];

const ALL_STATUSES: StatusKey[] = Object.keys(STATUS_LABELS) as StatusKey[];

interface RiderRow {
  name: string;
  city: string;
  vehicle: string;
  status: RiderStatus;
  daysInStage: number;
  pendingDocs: number;
}

const RIDER_ROWS: RiderRow[] = [
  {
    name: '[Rider A]',
    city: 'Nairobi',
    vehicle: 'motorbike',
    status: 'under_review',
    daysInStage: 3,
    pendingDocs: 0,
  },
  {
    name: '[Rider B]',
    city: 'Mombasa',
    vehicle: 'bicycle',
    status: 'documents_pending',
    daysInStage: 6,
    pendingDocs: 2,
  },
  {
    name: '[Rider C]',
    city: 'Kisumu',
    vehicle: 'car',
    status: 'active',
    daysInStage: 21,
    pendingDocs: 0,
  },
  {
    name: '[Rider D]',
    city: 'Nairobi',
    vehicle: 'tuktuk',
    status: 'applied',
    daysInStage: 1,
    pendingDocs: 6,
  },
  {
    name: '[Rider E]',
    city: 'Nakuru',
    vehicle: 'motorbike',
    status: 'suspended',
    daysInStage: 14,
    pendingDocs: 1,
  },
];

const RIDER_COLUMNS: ColumnDef<RiderRow, unknown>[] = [
  { accessorKey: 'name', header: 'Rider' },
  { accessorKey: 'city', header: 'City' },
  {
    accessorKey: 'vehicle',
    header: 'Vehicle',
    cell: ({ row }) => (
      <span className="flex items-center gap-1.5">
        {row.original.vehicle}
        {MOTORISED_VEHICLES.includes(row.original.vehicle as never) && (
          <Tag size="sm">plate required</Tag>
        )}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  { accessorKey: 'daysInStage', header: 'Days in stage' },
  {
    accessorKey: 'pendingDocs',
    header: 'Pending docs',
    cell: ({ row }) =>
      row.original.pendingDocs === 0 ? (
        <span className="text-muted-light">—</span>
      ) : (
        row.original.pendingDocs
      ),
  },
];

/* ---------------------------------------------------------------------- page */

export default function UiKitPage() {
  const { toast } = useToast();

  const [phone, setPhone] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>('nairobi');
  const [categories, setCategories] = useState<string[]>(['restaurant']);
  const [step, setStep] = useState(2);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [panel, setPanel] = useState<null | 'default' | 'loading' | 'error' | 'empty'>(null);

  return (
    <div className="bg-bg min-h-dvh">
      <header className="border-border bg-bg/90 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">NexG UI kit</h1>
            <p className="text-muted mt-0.5 text-sm">
              Every component from spec section 2, in every state. Resize to 390&nbsp;px to check
              the mobile layout.
            </p>
          </div>
          <nav aria-label="Components" className="-mx-1 overflow-x-auto">
            <ul className="flex gap-1 px-1 pb-1">
              {UI_KIT_SECTIONS.map((name) => (
                <li key={name}>
                  <a
                    href={`#${slugFor(name)}`}
                    className="border-border-strong bg-surface text-muted hover:border-ink/40 hover:text-ink inline-block whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold"
                  >
                    {name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-8 sm:px-6">
        {/* ---------------------------------------------------------- Button */}
        <Section
          name="Button"
          summary="Black, gold and outline, plus ghost and danger for review actions."
        >
          <State label="Variants">
            <Row>
              <Button variant="black">Place your Order</Button>
              <Button variant="gold">View menu</Button>
              <Button variant="outline">Directory</Button>
              <Button variant="ghost">Cancel</Button>
              <Button variant="danger">Reject with reason</Button>
            </Row>
          </State>

          <State
            label="Sizes"
            note="44px is the default touch target; 36px is for dense console rows."
          >
            <Row>
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" aria-label="Search">
                <Search className="h-4 w-4" />
              </Button>
            </Row>
          </State>

          <State label="With icons">
            <Row>
              <Button leadingIcon={<Mail className="h-4 w-4" />}>Email the merchant</Button>
              <Button variant="outline" trailingIcon={<span aria-hidden="true">→</span>}>
                Explore all merchants
              </Button>
            </Row>
          </State>

          <State label="Loading" note="Interaction is blocked and aria-busy is set.">
            <Row>
              <Button loading>Verify</Button>
              <Button variant="gold" loading loadingText="Sending…">
                Send code
              </Button>
              <Button variant="outline" loading />
            </Row>
          </State>

          <State label="Disabled">
            <Row>
              <Button disabled>Activate rider</Button>
              <Button variant="gold" disabled>
                Go live
              </Button>
              <Button variant="outline" disabled>
                Export
              </Button>
              <Button variant="danger" disabled>
                Reject
              </Button>
            </Row>
          </State>

          <State label="Full width" note="The mobile default for primary actions.">
            <div className="max-w-sm">
              <Button block size="lg">
                Continue
              </Button>
            </div>
          </State>
        </Section>

        {/* ----------------------------------------------------------- Input */}
        <Section name="Input" summary="Text entry with label, hint, error and loading states.">
          <State label="Default, hint, and leading icon">
            <div className="grid max-w-xl gap-4">
              <Input id="k-legal" label="Legal name" placeholder="As registered" required />
              <Input
                id="k-trading"
                label="Trading name"
                hint="The name customers will see on your card."
                placeholder="e.g. Mama Oliech"
              />
              <Input
                id="k-search"
                label="Search"
                labelHidden
                placeholder="Search riders"
                leadingIcon={<Search className="h-4 w-4" />}
              />
            </div>
          </State>

          <State label="Error">
            <div className="max-w-xl">
              <Input
                id="k-email"
                label="Contact email"
                defaultValue="not-an-email"
                error="Enter a valid email address."
                required
              />
            </div>
          </State>

          <State label="Loading and disabled">
            <div className="grid max-w-xl gap-4">
              <Input id="k-plate" label="Plate number" defaultValue="KMC 123A" loading />
              <Input id="k-kra" label="KRA PIN" defaultValue="A000000000X" disabled />
            </div>
          </State>
        </Section>

        {/* ------------------------------------------------------ PhoneInput */}
        <Section name="PhoneInput" summary="Defaults to +254, accepts a leading zero, emits E.164.">
          <State
            label="Interactive"
            note={phone ? `Emitting ${phone}` : 'Emitting null until valid'}
          >
            <div className="max-w-md">
              <PhoneInput
                id="k-phone"
                label="Phone (M-Pesa)"
                hint="We send a verification code to this number."
                required
                onChange={setPhone}
              />
            </div>
          </State>

          <State label="Prefilled from a stored E.164 value">
            <div className="max-w-md">
              <PhoneInput id="k-phone-filled" label="Phone" value="+254712345678" />
            </div>
          </State>

          <State label="Error, loading and disabled">
            <div className="grid max-w-md gap-4">
              <PhoneInput id="k-phone-err" label="Phone" error="Enter a valid M-Pesa number." />
              <PhoneInput id="k-phone-load" label="Phone" value="+254712345678" loading />
              <PhoneInput id="k-phone-dis" label="Phone" value="+254712345678" disabled />
            </div>
          </State>
        </Section>

        {/* ---------------------------------------------------------- Select */}
        <Section name="Select" summary="Single choice from a list, with descriptions where useful.">
          <State label="Default and with descriptions">
            <div className="grid max-w-md gap-4">
              <Select id="k-city" label="City" options={CITIES} placeholder="Choose a city" />
              <Select
                id="k-reason"
                label="Rejection reason"
                required
                options={[
                  { value: 'unreadable', label: 'Unreadable', description: 'Blurred or cropped' },
                  { value: 'expired', label: 'Expired', description: 'Past its expiry date' },
                  {
                    value: 'mismatch',
                    label: 'Name mismatch',
                    description: 'Does not match the applicant',
                  },
                  { value: 'other', label: 'Other', description: 'Give a written reason' },
                ]}
              />
            </div>
          </State>

          <State label="Error, loading, disabled and empty">
            <div className="grid max-w-md gap-4">
              <Select
                id="k-sel-err"
                label="City"
                options={CITIES}
                error="Choose a city to continue."
              />
              <Select id="k-sel-load" label="City" options={CITIES} loading />
              <Select
                id="k-sel-dis"
                label="City"
                options={CITIES}
                defaultValue="nairobi"
                disabled
              />
              <Select
                id="k-sel-empty"
                label="Zone"
                options={[]}
                emptyMessage="No zones configured yet"
              />
            </div>
          </State>
        </Section>

        {/* ------------------------------------------------------- ChipGroup */}
        <Section
          name="ChipGroup"
          summary="City, vehicle and category pickers. Arrow keys move and wrap."
        >
          <State label="Single select" note={city ? `Selected: ${city}` : 'Nothing selected'}>
            <ChipGroup
              id="k-chip-city"
              label="Which city?"
              required
              options={CITIES}
              value={city}
              onChange={setCity}
              hint="Kampala is on the waitlist, so it is disabled here."
            />
          </State>

          <State label="Multiple select" note={`Selected: ${categories.join(', ') || 'none'}`}>
            <ChipGroup
              id="k-chip-cat"
              label="Categories"
              multiple
              options={CATEGORIES}
              value={categories}
              onChange={setCategories}
            />
          </State>

          <State label="Error, disabled, loading and empty">
            <div className="grid gap-5">
              <ChipGroup
                id="k-chip-err"
                label="Vehicle"
                options={VEHICLES}
                error="Choose the vehicle you will ride."
              />
              <ChipGroup id="k-chip-dis" label="Vehicle" options={VEHICLES} value="car" disabled />
              <ChipGroup id="k-chip-load" label="City" options={[]} loading />
              <ChipGroup
                id="k-chip-empty"
                label="City"
                options={[]}
                emptyMessage="No cities are open for applications yet"
              />
            </div>
          </State>
        </Section>

        {/* --------------------------------------------------------- Stepper */}
        <Section name="Stepper" summary="Application progress. Collapses to a counter under 640px.">
          {[1, 2, 3].map((position) => (
            <State key={position} label={`Step ${position} of 3`}>
              <Stepper steps={APPLICATION_STEPS} current={position} />
            </State>
          ))}

          <State label="Error on the current step">
            <Stepper steps={APPLICATION_STEPS} current={2} error />
          </State>

          <State label="Interactive">
            <Stepper steps={APPLICATION_STEPS} current={step} />
            <Row className="mt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={step === 1}
                onClick={() => setStep(step - 1)}
              >
                Back
              </Button>
              <Button size="sm" disabled={step === 3} onClick={() => setStep(step + 1)}>
                Continue
              </Button>
            </Row>
          </State>
        </Section>

        {/* -------------------------------------------------------- FileDrop */}
        <Section
          name="FileDrop"
          summary="Photo or PDF up to 10 MB. Photos are compressed in the browser."
        >
          <State label="Interactive" note="Click, keyboard, or drag and drop.">
            <div className="max-w-md">
              <FileDrop
                id="k-file"
                label="National ID"
                hint="Both sides, readable, no glare."
                required
                file={file}
                error={fileError}
                onFileSelect={(next) => {
                  setFile(next);
                  setFileError(undefined);
                }}
                onRemove={() => setFile(null)}
                onValidationError={setFileError}
              />
            </div>
          </State>

          <State label="Empty, filled, uploading">
            <div className="grid max-w-md gap-4">
              <FileDrop id="k-file-empty" label="Good conduct certificate" />
              <FileDrop
                id="k-file-filled"
                label="Business permit"
                existing={{ name: 'permit-2026.pdf', sizeBytes: 482_000, mime: 'application/pdf' }}
                onRemove={() => undefined}
              />
              <FileDrop
                id="k-file-loading"
                label="Insurance"
                existing={{ name: 'insurance.jpg', sizeBytes: 1_240_000, mime: 'image/jpeg' }}
                loading
              />
            </div>
          </State>

          <State label="Error and disabled">
            <div className="grid max-w-md gap-4">
              <FileDrop
                id="k-file-err"
                label="Driving licence"
                error="That file is 14.2 MB. The limit is 10.0 MB."
              />
              <FileDrop
                id="k-file-dis"
                label="Logbook"
                disabled
                hint="Available once a vehicle is chosen."
              />
            </div>
          </State>
        </Section>

        {/* ----------------------------------------------------- StatusBadge */}
        <Section name="StatusBadge" summary="Lifecycle status, keyed to the section 3.1 enums.">
          <State label="Every status">
            <Row>
              {ALL_STATUSES.map((status) => (
                <StatusBadge key={status} status={status} />
              ))}
            </Row>
          </State>

          <State label="Tones and custom labels">
            <Row>
              <StatusBadge tone="success">Valid</StatusBadge>
              <StatusBadge tone="warning">Expiring</StatusBadge>
              <StatusBadge tone="danger">Expired · Paused</StatusBadge>
              <StatusBadge tone="neutral">Verify</StatusBadge>
              <StatusBadge tone="ink">Sponsored</StatusBadge>
            </Row>
          </State>

          <State label="Loading" note="While a verify or activate decision is in flight.">
            <Row>
              <StatusBadge status="under_review" loading />
              <StatusBadge tone="success" loading>
                Activating
              </StatusBadge>
            </Row>
          </State>
        </Section>

        {/* ------------------------------------------------------------- Tag */}
        <Section
          name="Tag"
          summary="Neutral metadata — category, city, filter. No lifecycle meaning."
        >
          <State label="Tones and sizes">
            <Row>
              <Tag>Restaurant</Tag>
              <Tag tone="gold">Featured</Tag>
              <Tag tone="ink">Nairobi</Tag>
              <Tag size="sm">plate required</Tag>
            </Row>
            <Row className="bg-ink mt-3 rounded-lg p-3">
              <Tag tone="sponsored">Sponsored</Tag>
            </Row>
          </State>

          <State label="Removable" note="Used for active filters.">
            <Row>
              <Tag onRemove={() => undefined} removeLabel="Remove Nairobi filter">
                Nairobi
              </Tag>
              <Tag tone="gold" onRemove={() => undefined} removeLabel="Remove motorbike filter">
                Motorbike
              </Tag>
            </Row>
          </State>
        </Section>

        {/* ------------------------------------------------------------ Card */}
        <Section name="Card" summary="Surface, muted, gold and ink panels.">
          <State label="Tones" className="bg-bg">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardTitle>Surface</CardTitle>
                <CardDescription className="mt-1">White panel on the cream page.</CardDescription>
                <CardFooter>
                  <Button size="sm" variant="outline">
                    Open
                  </Button>
                </CardFooter>
              </Card>
              <Card tone="muted">
                <CardTitle>Muted</CardTitle>
                <CardDescription className="mt-1">Cream panel, for nesting.</CardDescription>
              </Card>
              <Card tone="gold">
                <CardTitle>Ask in a sentence</CardTitle>
                <CardDescription className="text-ink/70 mt-1">
                  Type or voice-note what you need. No forms, no menus to dig through.
                </CardDescription>
              </Card>
              <Card tone="ink">
                <CardTitle>Host, ride, list or join.</CardTitle>
                <CardDescription className="mt-1 text-white/70">
                  A small team builds it.
                </CardDescription>
              </Card>
            </div>
          </State>

          <State label="Interactive and loading" className="bg-bg">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card interactive>
                <CardTitle>Interactive</CardTitle>
                <CardDescription className="mt-1">Lifts on hover, ring on focus.</CardDescription>
              </Card>
              <CardSkeleton />
            </div>
          </State>
        </Section>

        {/* --------------------------------------------------------- KpiTile */}
        <Section
          name="KpiTile"
          summary={`Console figures. Unset values render ${VALUE_PLACEHOLDER} — never an invented number.`}
        >
          <State label="With and without a value" className="bg-bg">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiTile label="In onboarding" value={14} caption="5 waiting on merchant · 3 on us" />
              <KpiTile label="Merchants total" caption={`across ${VALUE_PLACEHOLDER} cities`} />
              <KpiTile
                label="Blocked > 5 days"
                value={2}
                caption="oldest 6 d · [Florist]"
                captionTone="danger"
              />
              <KpiTile label="Avg time to live" unit="d" caption="target 7 d from application" />
            </div>
          </State>

          <State label="Caption tones, loading and error" className="bg-bg">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiTile
                label="Live & accepting"
                value={31}
                caption="1 paused"
                captionTone="success"
              />
              <KpiTile
                label="Expiring ≤ 30 days"
                value={5}
                caption="insurance ×3 · licence ×2"
                captionTone="warning"
              />
              <KpiTile label="Documents on file" loading />
              <KpiTile label="Avg prep / delivery" error="Unavailable" />
            </div>
          </State>
        </Section>

        {/* ------------------------------------------------------- DataTable */}
        <Section
          name="DataTable"
          summary="Sortable, filterable, row-select. Scrolls sideways inside its own box."
        >
          <State label="Full featured" note="Sort any column, search, select rows, paginate.">
            <DataTable
              caption="Riders"
              columns={RIDER_COLUMNS}
              data={RIDER_ROWS}
              searchable
              selectable
              searchPlaceholder="Search riders"
              pageSize={3}
              onRowClick={() => setPanel('default')}
              toolbar={
                <Button variant="outline" size="sm">
                  Export
                </Button>
              }
            />
          </State>

          <State label="Loading">
            <DataTable caption="Riders loading" columns={RIDER_COLUMNS} data={[]} loading />
          </State>

          <State label="Error">
            <DataTable
              caption="Riders error"
              columns={RIDER_COLUMNS}
              data={[]}
              error="The connection timed out."
              onRetry={() => undefined}
            />
          </State>

          <State label="Empty">
            <DataTable
              caption="Riders empty"
              columns={RIDER_COLUMNS}
              data={[]}
              emptyTitle="No riders yet"
              emptyDescription="Applications appear here as soon as someone applies."
            />
          </State>
        </Section>

        {/* ------------------------------------------------------ DetailPanel */}
        <Section
          name="DetailPanel"
          summary="Right-side drawer for document review. Full width under 640px."
        >
          <State label="Open a panel" note="Escape closes it and focus returns to the button.">
            <Row>
              <Button onClick={() => setPanel('default')}>Default</Button>
              <Button variant="outline" onClick={() => setPanel('loading')}>
                Loading
              </Button>
              <Button variant="outline" onClick={() => setPanel('error')}>
                Error
              </Button>
              <Button variant="outline" onClick={() => setPanel('empty')}>
                Empty
              </Button>
            </Row>
          </State>

          <DetailPanel
            open={panel !== null}
            onOpenChange={(open) => !open && setPanel(null)}
            title="[Rider A]"
            subtitle="Boda · Westlands · applied 3 days ago"
            meta={
              <>
                <StatusBadge status="under_review" />
                <Tag size="sm">Motorbike</Tag>
                <Tag size="sm">Nairobi</Tag>
              </>
            }
            loading={panel === 'loading'}
            {...(panel === 'error'
              ? { error: 'The signed URL expired. Reopen the document.' }
              : {})}
            {...(panel === 'empty' ? { empty: 'No documents uploaded yet' } : {})}
            footer={
              <>
                <Button variant="danger" size="sm">
                  Reject with reason
                </Button>
                <Button size="sm">Verify</Button>
                <Button variant="gold" size="sm" disabled>
                  Activate rider
                </Button>
              </>
            }
          >
            <div className="border-border-strong bg-bg text-muted-light flex h-40 items-center justify-center rounded-lg border border-dashed text-sm">
              [DOCUMENT PREVIEW]
            </div>
            <dl className="divide-border mt-4 divide-y">
              <DetailRow label="Document">National ID</DetailRow>
              <DetailRow label="Issued">{VALUE_PLACEHOLDER}</DetailRow>
              <DetailRow label="Expires">—</DetailRow>
              <DetailRow label="Uploaded">2 days ago</DetailRow>
              <DetailRow label="Status">
                <StatusBadge status="uploaded" />
              </DetailRow>
            </dl>
          </DetailPanel>
        </Section>

        {/* ----------------------------------------------------------- Toast */}
        <Section name="Toast" summary="Transient feedback. Radix announces it in a live region.">
          <State
            label="Every tone"
            note="Appears bottom-right; swipe or Escape to dismiss. Trigger several in a row to compare the tones side by side."
          >
            <Row>
              <Button
                variant="outline"
                onClick={() =>
                  toast({
                    title: 'Request received',
                    description: 'A concierge will reply on WhatsApp shortly.',
                    tone: 'info',
                  })
                }
              >
                Info
              </Button>
              <Button
                variant="outline"
                onClick={() => toast({ title: 'Document verified', tone: 'success' })}
              >
                Success
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  toast({
                    title: 'Insurance expires in 12 days',
                    description: 'Remind the rider before it lapses.',
                    tone: 'warning',
                  })
                }
              >
                Warning
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  toast({
                    title: 'Could not save',
                    description: 'Check your connection and try again.',
                    tone: 'danger',
                    action: { label: 'Retry', onClick: () => undefined },
                  })
                }
              >
                Danger
              </Button>
              <Button
                variant="outline"
                onClick={() => toast({ title: 'Uploading document…', tone: 'loading' })}
              >
                Loading
              </Button>
            </Row>
          </State>
        </Section>

        {/* ------------------------------------------------------ EmptyState */}
        <Section name="EmptyState" summary="Nothing to show, or something went wrong.">
          <State label="Empty, with and without an action">
            <div className="grid gap-4 lg:grid-cols-2">
              <EmptyState
                icon={<Inbox className="h-5 w-5" />}
                title="No documents to review"
                description="Uploads appear here the moment an applicant submits one."
              />
              <EmptyState
                icon={<Inbox className="h-5 w-5" />}
                title="No riders in Nairobi"
                description="Clear the city filter to see everyone."
                action={{ label: 'Clear filters', onClick: () => undefined }}
              />
            </div>
          </State>

          <State label="Error and compact">
            <div className="grid gap-4 lg:grid-cols-2">
              <EmptyState
                tone="error"
                icon={<WifiOff className="h-5 w-5" />}
                title="Could not load the pipeline"
                description="The request timed out after 30 seconds."
                action={{ label: 'Try again', onClick: () => undefined }}
              />
              <EmptyState size="sm" title="Nothing here yet" />
            </div>
          </State>
        </Section>
      </main>
    </div>
  );
}
