'use client';

import { Button, Input, PhoneInput, useToast } from '@nexg/ui';
import { MessageCircle, Monitor, Phone, Plus, X, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

import { Chip } from './controls';
import { ContinueButton, OnboardingShell } from './shell';
import { useOnboarding } from './store';
import type { DraftFleetRider, WeekHours } from './types';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
const WEEKEND = ['sat', 'sun'] as const;

const CHANNELS = [
  { value: 'dashboard', label: 'Merchant dashboard', icon: Monitor },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { value: 'phone', label: 'Phone call', icon: Phone },
  { value: 'pos', label: 'My POS system', icon: Zap },
];

const BUSY = [
  { value: 'pause', label: 'Pause new orders with one tap' },
  { value: 'extend_prep', label: 'Extend prep time automatically' },
  { value: 'never_pause', label: 'Never pause — we cope' },
];

const PACKAGING = [
  { value: 'we_pack', label: 'We pack for delivery' },
  { value: 'need_bags', label: 'Need NexG-branded bags' },
  { value: 'not_sure', label: 'Not sure yet' },
];

const VEHICLES = [
  { value: 'motorbike', label: 'Motorbike' },
  { value: 'bicycle', label: 'Bicycle' },
  { value: 'car', label: 'Car' },
  { value: 'tuktuk', label: 'Tuk-tuk' },
] as const;

/**
 * Step 4 — hours, speed, and who rides.
 *
 * Hours are chosen as a pattern rather than typed fourteen times, and the
 * pattern is kept alongside the seven rows it produces: a merchant who said
 * "weekdays vs weekend" should be able to edit two ranges next month, not
 * fourteen times they never entered.
 */
export function HoursStep() {
  const router = useRouter();
  const { toast } = useToast();
  const { draft, patch } = useOnboarding();

  const pattern = draft?.hours_pattern ?? null;
  const hours = (draft?.hours ?? {}) as WeekHours;
  const channels = draft?.order_channels ?? ['dashboard'];

  const [fleetOpen, setFleetOpen] = React.useState(draft?.has_own_riders ?? false);
  const [riders, setRiders] = React.useState<DraftFleetRider[]>([]);
  const [savingFleet, setSavingFleet] = React.useState(false);

  const draftId = draft?.id ?? null;

  React.useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('merchant_fleet_rider')
        .select('id, name, phone, vehicle, plate_no, invite_status')
        .eq('merchant_id', draftId);
      if (cancelled) return;
      const rows = (data as DraftFleetRider[] | null) ?? [];
      setRiders(rows.length > 0 ? rows : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  const setPattern = (next: 'same_daily' | 'weekday_weekend' | 'custom') => {
    /* Choosing a pattern fills the week from it, so the seven rows exist
       before anyone touches a time. A merchant who changes nothing still has
       usable hours. */
    const week: WeekHours = {};
    if (next === 'same_daily') {
      for (const day of DAYS) week[day] = { open: '10:00', close: '23:00' };
    } else if (next === 'weekday_weekend') {
      for (const day of WEEKDAYS) week[day] = { open: '10:00', close: '23:00' };
      for (const day of WEEKEND) week[day] = { open: '10:00', close: '23:00' };
    } else {
      for (const day of DAYS) week[day] = hours[day] ?? { open: '10:00', close: '23:00' };
    }
    patch({ hours_pattern: next, hours: week }, 4);
  };

  const setRange = (days: readonly (typeof DAYS)[number][], open: string, close: string) => {
    const week: WeekHours = { ...hours };
    for (const day of days) week[day] = { open, close };
    patch({ hours: week }, 4);
  };

  const saveFleet = async () => {
    if (!draftId) return;
    const valid = riders.filter(
      (r) => r.name.trim() && r.phone && (r.vehicle === 'bicycle' || r.plate_no.trim()),
    );
    setSavingFleet(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('rpc_merchant_declare_fleet', {
      p_merchant_id: draftId,
      p_riders: valid.map((r) => ({
        name: r.name,
        phone: r.phone,
        vehicle: r.vehicle,
        plate_no: r.plate_no || null,
      })),
      p_preference: draft?.fleet_dispatch_preference ?? 'own_first',
    });
    setSavingFleet(false);

    if (error) {
      toast({ title: 'We could not save your riders', description: error.message, tone: 'danger' });
      return;
    }

    const result = (data as { name: string; already_a_rider: boolean }[] | null) ?? [];
    const linked = result.filter((r) => r.already_a_rider);
    toast({
      title: `${result.length} rider${result.length === 1 ? '' : 's'} saved`,
      description:
        linked.length > 0
          ? `${linked.map((r) => r.name).join(', ')} ${linked.length === 1 ? 'is' : 'are'} already a NexG rider — we have linked them rather than inviting them again.`
          : 'We have their invites ready. Nothing is sent until an SMS sender is connected.',
      tone: 'success',
    });
  };

  const sameOpen = hours['mon']?.open ?? '10:00';
  const sameClose = hours['mon']?.close ?? '23:00';

  return (
    <OnboardingShell
      step={4}
      eyebrow="How you work"
      title="When are you open, and how fast are you?"
      intro="Choose a pattern instead of typing 14 times. Everything here is editable from your dashboard, any day."
      footer={
        <>
          <Button
            variant="outline"
            size="lg"
            onClick={() => router.push('/merchants/apply/location')}
          >
            Back
          </Button>
          <ContinueButton
            disabled={!pattern}
            onClick={async () => {
              if (fleetOpen && riders.length > 0) await saveFleet();
              patch({}, 5);
              router.push('/merchants/apply/documents');
            }}
          >
            Continue
          </ContinueButton>
        </>
      }
    >
      {/* ------------------------------------------------------- hours pattern */}
      <div className="grid gap-4 lg:grid-cols-3">
        <PatternCard
          title="Same every day"
          subtitle="One opening and closing time"
          selected={pattern === 'same_daily'}
          onClick={() => setPattern('same_daily')}
          rows={[
            {
              label: 'Mon – Sun',
              open: sameOpen,
              close: sameClose,
              onChange: (o, c) => setRange(DAYS, o, c),
            },
          ]}
        />
        <PatternCard
          title="Weekdays vs weekend"
          subtitle="Two sets of hours"
          selected={pattern === 'weekday_weekend'}
          onClick={() => setPattern('weekday_weekend')}
          rows={[
            {
              label: 'Mon – Fri',
              open: hours['mon']?.open ?? '',
              close: hours['mon']?.close ?? '',
              onChange: (o, c) => setRange(WEEKDAYS, o, c),
            },
            {
              label: 'Sat – Sun',
              open: hours['sat']?.open ?? '',
              close: hours['sat']?.close ?? '',
              onChange: (o, c) => setRange(WEEKEND, o, c),
            },
          ]}
        />
        <PatternCard
          title="Custom"
          subtitle="Set each day, add a break"
          selected={pattern === 'custom'}
          onClick={() => setPattern('custom')}
          rows={
            pattern === 'custom'
              ? DAYS.map((day) => ({
                  label: day.charAt(0).toUpperCase() + day.slice(1),
                  open: hours[day]?.open ?? '',
                  close: hours[day]?.close ?? '',
                  onChange: (o: string, c: string) => setRange([day], o, c),
                }))
              : [{ label: '7 days', open: '', close: '', onChange: () => undefined }]
          }
        />
      </div>

      {/* ---------------------------------------------------------- late night */}
      <div className="border-border bg-surface mt-4 rounded-2xl border p-5">
        <p className="text-[0.9375rem] font-extrabold">Open late for guests?</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { value: '23:00', label: 'We close by 23:00' },
            { value: '02:00', label: 'Until 02:00' },
            { value: '23:59', label: '24 hours' },
          ].map((option) => (
            <Chip
              key={option.value}
              selected={draft?.late_night_until?.slice(0, 5) === option.value}
              onClick={() => patch({ late_night_until: option.value }, 4)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
        <p className="text-muted-light mt-4 text-xs font-semibold leading-[1.7]">
          Late-night is where guests order most. Late orders carry a night fee paid by the guest,
          not by you.
        </p>
      </div>

      {/* ------------------------------------------------------ prep, channels */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="border-border bg-surface rounded-2xl border p-5">
          <p className="text-[0.9375rem] font-extrabold">How long to prepare a typical order?</p>
          <input
            type="range"
            min={5}
            max={60}
            step={5}
            value={draft?.prep_minutes ?? 20}
            onChange={(event) => patch({ prep_minutes: Number(event.target.value) }, 4)}
            aria-label="Preparation time in minutes"
            className="accent-gold mt-5 w-full"
          />
          <div className="text-muted-light mt-2 flex justify-between text-xs font-bold">
            <span>5 min</span>
            <span className="text-ink text-sm">{draft?.prep_minutes ?? 20} minutes</span>
            <span>60 min</span>
          </div>
          <p className="text-muted-light mt-4 text-xs font-semibold leading-[1.7]">
            We tell the guest “ready in about {draft?.prep_minutes ?? 20} min” and send the rider to
            arrive just as it is ready.
          </p>
        </div>

        <div className="border-border bg-surface rounded-2xl border p-5">
          <p className="text-[0.9375rem] font-extrabold">How will you receive orders?</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {CHANNELS.map((channel) => (
              <Chip
                key={channel.value}
                selected={channels.includes(channel.value)}
                onClick={() =>
                  patch(
                    {
                      order_channels: channels.includes(channel.value)
                        ? channels.filter((c) => c !== channel.value)
                        : [...channels, channel.value],
                    },
                    4,
                  )
                }
              >
                <span className="flex items-center gap-2">
                  <channel.icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {channel.label}
                </span>
              </Chip>
            ))}
          </div>
          <p className="text-muted-light mt-4 text-xs font-semibold leading-[1.7]">
            Pick all that apply. New orders ring on every channel you choose; accept from any of
            them.
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------ busy, packaging */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="border-border bg-surface rounded-2xl border p-5">
          <p className="text-[0.9375rem] font-extrabold">When you are slammed</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {BUSY.map((option) => (
              <Chip
                key={option.value}
                selected={draft?.when_busy === option.value}
                onClick={() => patch({ when_busy: option.value }, 4)}
              >
                {option.label}
              </Chip>
            ))}
          </div>
          <p className="text-muted-light mt-4 text-xs font-semibold leading-[1.7]">
            You can change this any night from the dashboard.
          </p>
        </div>

        <div className="border-border bg-surface rounded-2xl border p-5">
          <p className="text-[0.9375rem] font-extrabold">Packaging</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {PACKAGING.map((option) => (
              <Chip
                key={option.value}
                selected={draft?.packaging === option.value}
                onClick={() => patch({ packaging: option.value }, 4)}
              >
                {option.label}
              </Chip>
            ))}
          </div>
          <p className="text-muted-light mt-4 text-xs font-semibold leading-[1.7]">
            Branded bags and seals are optional and charged at cost.
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------- own riders */}
      <div className="border-border bg-surface mt-4 rounded-2xl border p-5">
        <p className="text-[0.9375rem] font-extrabold">Do you have your own delivery riders?</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Chip
            selected={!fleetOpen}
            onClick={() => {
              setFleetOpen(false);
              patch({ has_own_riders: false }, 4);
            }}
          >
            No — use NexG riders
          </Chip>
          <Chip
            selected={fleetOpen}
            onClick={() => {
              setFleetOpen(true);
              patch({ has_own_riders: true }, 4);
              if (riders.length === 0) setRiders([blankRider()]);
            }}
          >
            Yes, I have my own
          </Chip>
        </div>

        {fleetOpen && (
          <div className="animate-in fade-in slide-in-from-bottom-2 mt-5 duration-200">
            <ul className="space-y-3">
              {riders.map((rider, index) => (
                <li
                  key={index}
                  className="border-border bg-bg grid gap-3 rounded-xl border p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <Input
                    id={`rider_name_${index}`}
                    label="Name"
                    value={rider.name}
                    onChange={(event) => {
                      const next = [...riders];
                      next[index] = { ...rider, name: event.target.value };
                      setRiders(next);
                    }}
                  />
                  <PhoneInput
                    id={`rider_phone_${index}`}
                    label="Phone"
                    value={rider.phone}
                    onChange={(value) => {
                      const next = [...riders];
                      next[index] = { ...rider, phone: value };
                      setRiders(next);
                    }}
                  />
                  <div className="flex items-end">
                    <button
                      type="button"
                      aria-label={`Remove ${rider.name || 'this rider'}`}
                      onClick={() => setRiders(riders.filter((_, i) => i !== index))}
                      className="text-muted hover:text-danger p-2.5"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="lg:col-span-3">
                    <div className="flex flex-wrap gap-2">
                      {VEHICLES.map((vehicle) => (
                        <Chip
                          key={vehicle.value}
                          selected={rider.vehicle === vehicle.value}
                          onClick={() => {
                            const next = [...riders];
                            next[index] = { ...rider, vehicle: vehicle.value };
                            setRiders(next);
                          }}
                        >
                          {vehicle.label}
                        </Chip>
                      ))}
                    </div>
                  </div>

                  {rider.vehicle !== 'bicycle' && (
                    <div className="lg:col-span-2">
                      <Input
                        id={`rider_plate_${index}`}
                        label="Number plate"
                        hint="Guests see this on the rider card and check it at the door."
                        value={rider.plate_no}
                        onChange={(event) => {
                          const next = [...riders];
                          next[index] = { ...rider, plate_no: event.target.value };
                          setRiders(next);
                        }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setRiders([...riders, blankRider()])}
              className="border-border-strong text-muted hover:border-ink hover:text-ink mt-3 flex w-full items-center gap-3 rounded-xl border border-dashed p-3.5 text-left text-[0.875rem] font-bold transition-colors"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add another rider
            </button>

            <div className="border-border bg-bg mt-4 rounded-xl border p-4">
              <p className="text-[0.875rem] font-extrabold">When an order comes in</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { value: 'own_first', label: 'Offer my riders first, then NexG riders' },
                  { value: 'pool_only', label: 'Only my riders' },
                  { value: 'mixed', label: 'Whoever is closest' },
                ].map((option) => (
                  <Chip
                    key={option.value}
                    selected={draft?.fleet_dispatch_preference === option.value}
                    onClick={() => patch({ fleet_dispatch_preference: option.value }, 4)}
                  >
                    {option.label}
                  </Chip>
                ))}
              </div>
              <p className="text-muted-light mt-3 text-xs font-semibold leading-[1.7]">
                Your riders still go through NexG verification — ID, licence, plate and a short
                onboarding — so guests see the same plate-verified rider card. We text each one an
                invite.
              </p>
            </div>

            <p className="border-warning/40 bg-warning-bg text-warning mt-3 rounded-xl border p-3 text-xs font-bold leading-[1.7]">
              Delivery pay for your own riders is credited to your Friday settlement; you pay your
              staff — policy assumption, confirm.
            </p>

            <Button
              variant="outline"
              className="mt-3"
              loading={savingFleet}
              loadingText="Saving…"
              onClick={() => void saveFleet()}
            >
              Save my riders
            </Button>
          </div>
        )}
      </div>
    </OnboardingShell>
  );
}

function PatternCard({
  title,
  subtitle,
  selected,
  onClick,
  rows,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  onClick: () => void;
  rows: { label: string; open: string; close: string; onChange: (o: string, c: string) => void }[];
}) {
  return (
    <div
      className={`rounded-2xl border p-5 transition-colors ${
        selected ? 'border-ink bg-ink text-white' : 'border-border bg-surface'
      }`}
    >
      <button type="button" aria-pressed={selected} onClick={onClick} className="w-full text-left">
        <p className="text-[0.9375rem] font-extrabold">{title}</p>
        <p className={`mt-1 text-xs font-semibold ${selected ? 'text-white/65' : 'text-muted'}`}>
          {subtitle}
        </p>
      </button>

      <ul className="mt-4 space-y-2">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-3">
            <span
              className={`text-[0.8125rem] font-semibold ${selected ? 'text-white/80' : 'text-muted'}`}
            >
              {row.label}
            </span>
            {selected && row.open ? (
              <span className="flex items-center gap-1">
                <TimeBox value={row.open} onChange={(v) => row.onChange(v, row.close)} />
                <span className="text-xs text-white/60">–</span>
                <TimeBox value={row.close} onChange={(v) => row.onChange(row.open, v)} />
              </span>
            ) : (
              <span
                className={`text-[0.8125rem] font-extrabold ${selected ? 'text-white' : 'text-muted-light'}`}
              >
                {row.open && row.close ? `${row.open} – ${row.close}` : '—'}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TimeBox({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="text-ink w-[5.5rem] rounded-md bg-white px-2 py-1 text-[0.8125rem] font-extrabold"
    />
  );
}

function blankRider(): DraftFleetRider {
  return { name: '', phone: null, vehicle: 'motorbike', plate_no: '' };
}
