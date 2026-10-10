'use client';

import { readPositionOnce } from '@nexg/location';
import { Button, Input, useToast } from '@nexg/ui';
import { LocateFixed, MapPin as MapPinIcon, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

import { Chip } from './controls';
import { ContinueButton, FooterNote, OnboardingShell } from './shell';
import { useOnboarding } from './store';
import type { DraftBranch } from './types';
import { ZoneMap, type MapPin, type ZoneBounds } from './zone-map';

const BRANCH_BANDS = [
  { value: 'just_this_one', label: 'Just this one' },
  { value: '2_3', label: '2–3' },
  { value: '4_10', label: '4–10' },
  { value: 'more_than_10', label: 'More than 10' },
];

const PICKUP = [
  { value: 'front_counter', label: 'Front counter' },
  { value: 'side_kitchen', label: 'Side / kitchen door' },
  { value: 'ask_security', label: 'Ask security' },
  { value: 'call_on_arrival', label: 'Call on arrival' },
];

const PARKING = [
  { value: 'easy', label: 'Easy' },
  { value: 'tight', label: 'Tight — call ahead' },
  { value: 'none', label: 'None' },
];

/**
 * Step 3 — where a rider collects from.
 *
 * The zone is the gate on this whole flow: a merchant outside every zone
 * cannot be listed, because we would be promising a guest a delivery we
 * cannot make. So the pin is judged by the database the moment it moves, and
 * the answer is shown on the screen rather than saved up for a phone call
 * two days later.
 */
export function LocationStep() {
  const router = useRouter();
  const { toast } = useToast();
  const { draft, patch, setBranches } = useOnboarding();

  const [zones, setZones] = React.useState<ZoneBounds[]>([]);
  const [branches, setLocalBranches] = React.useState<DraftBranch[]>([]);
  const [locating, setLocating] = React.useState(false);
  const [outside, setOutside] = React.useState<{
    km: number;
    nearest: string;
    city: string;
  } | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  const draftId = draft?.id ?? null;
  const band = draft?.branch_count_band ?? 'just_this_one';
  const multi = band !== 'just_this_one';

  /* Zones for the diagram, and whatever branches are already saved. */
  React.useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    void (async () => {
      const [{ data: z }, { data: b }] = await Promise.all([
        supabase.from('zone_bounds').select('*').order('tier'),
        draftId
          ? supabase
              .from('merchant_branch')
              .select(
                'address_text, latitude, longitude, inherits_hours, source, zone:zone_id (name, tier, eta_min, eta_max, cod_allowed)',
              )
              .eq('merchant_id', draftId)
              .order('sort')
          : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;

      setZones((z as ZoneBounds[] | null) ?? []);

      const saved = (b as SavedBranch[] | null) ?? [];
      setLocalBranches(
        saved.length > 0
          ? saved.map((row) => ({
              address_text: row.address_text ?? '',
              lat: row.latitude,
              lng: row.longitude,
              inherits_hours: row.inherits_hours,
              source: row.source,
              zone: row.zone?.name ?? null,
              tier: row.zone?.tier ?? null,
              eta_min: row.zone?.eta_min ?? null,
              eta_max: row.zone?.eta_max ?? null,
              cod_allowed: row.zone?.cod_allowed ?? null,
            }))
          : [blank()],
      );
      setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [draftId]);

  const primary = branches[0];
  const hasPin = !!primary?.lat && !!primary?.lng;
  const inZone = !!primary?.zone;

  const persist = async (next: DraftBranch[]) => {
    const withPins = next.filter((b) => b.lat !== null && b.lng !== null);
    if (withPins.length === 0) {
      setLocalBranches(next);
      return;
    }
    const resolved = await setBranches(withPins);
    /* Rows still without a pin stay on screen, unsaved, so the merchant can
       see the one they have not finished. */
    setLocalBranches([...resolved, ...next.filter((b) => b.lat === null || b.lng === null)]);

    const first = resolved[0];
    if (first && !first.zone) {
      await lookUpDistance(first.lng!, first.lat!);
    } else {
      setOutside(null);
    }
  };

  const lookUpDistance = async (lng: number, lat: number) => {
    const supabase = createClient();
    const { data } = await supabase.rpc('distance_to_nearest_zone', { p_lng: lng, p_lat: lat });
    const row = (data as { km: number; zone_name: string; city_name: string }[] | null)?.[0];
    if (row) setOutside({ km: row.km, nearest: row.zone_name, city: row.city_name });
  };

  /*
   * The read goes through @nexg/location, which owns the only
   * call to the browser API in the codebase.
   *
   * This used to roll its own `getCurrentPosition`, and the
   * hand-rolled version was worse in three ways: every failure
   * became one generic sentence, so a merchant who had blocked
   * the permission was told to "pick an area" with no hint that
   * the padlock menu was the fix; `enableHighAccuracy` was
   * forced on, which on a laptop spends battery and seconds to
   * get the same wifi fix; and a position read moments ago was
   * re-requested from scratch. The shared helper handles all
   * three, and it is the call site the lint rule points at.
   */
  const pinFromBrowser = async () => {
    setLocating(true);
    const result = await readPositionOnce();
    setLocating(false);

    if (!result.ok) {
      toast({
        title:
          result.reason === 'denied'
            ? 'Location is blocked in your browser'
            : 'We could not read your location',
        /* The helper's message names the padlock when that is
           what will fix it. Pick-an-area stays as the way
           forward either way, because it always works. */
        description: `${result.message} You can also pick your area below and correct the pin later.`,
        tone: 'danger',
      });
      return;
    }

    const next = [...branches];
    next[0] = {
      ...(next[0] ?? blank()),
      lat: result.fix.lat,
      lng: result.fix.lng,
    };
    setLocalBranches(next);
    void persist(next);
  };

  /*
   * Without a geocoder, an address typed on a laptop cannot become a pin. So
   * the merchant says which of our areas they are in, and that is honest —
   * it is the same question the pin would have answered, asked directly.
   */
  const pickArea = (zone: ZoneBounds, index: number) => {
    const next = [...branches];
    next[index] = {
      ...(next[index] ?? blank()),
      lat: (zone.north + zone.south) / 2,
      lng: (zone.east + zone.west) / 2,
    };
    setLocalBranches(next);
    void persist(next);
  };

  const declareOutside = async () => {
    if (!draftId || !primary?.lat || !primary?.lng) return;
    const supabase = createClient();
    const { error } = await supabase.rpc('rpc_merchant_waitlist', {
      p_merchant_id: draftId,
      p_lng: primary.lng,
      p_lat: primary.lat,
      p_area: primary.address_text || undefined,
    });
    if (error) {
      toast({ title: 'We could not save that', description: error.message, tone: 'danger' });
      return;
    }
    toast({
      title: 'You are first in line',
      description: 'We keep everything you entered and message you when the zone opens.',
      tone: 'success',
    });
    router.push('/merchants/status');
  };

  const pins: MapPin[] = branches
    .filter((b) => b.lat !== null && b.lng !== null)
    .map((b, index) => ({
      lat: b.lat!,
      lng: b.lng!,
      label: draft?.trading_name || '[Your business]',
      sub: b.zone
        ? `${b.zone} · ${b.tier} zone ✓`
        : outside
          ? `${outside.km} km outside our zone`
          : undefined,
      outside: !b.zone,
      ...(branches.length > 1 ? { index: index + 1 } : {}),
    }));

  if (!loaded) return null;

  return (
    <OnboardingShell
      step={3}
      eyebrow="Location"
      title="Where do riders collect from?"
      intro="One pin and three taps. Delivery time on your card comes from where you are, not from a promise you have to type."
      footer={
        outside && hasPin && !inZone ? (
          <>
            <Button
              variant="outline"
              size="lg"
              onClick={() => router.push('/merchants/apply/category')}
            >
              Back
            </Button>
            <ContinueButton onClick={() => void declareOutside()}>
              Save my place &amp; finish later
            </ContinueButton>
            <FooterNote>Nothing is lost — we keep your answers</FooterNote>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              size="lg"
              onClick={() => router.push('/merchants/apply/category')}
            >
              Back
            </Button>
            <ContinueButton
              disabled={!inZone}
              onClick={() => {
                patch({}, 4);
                router.push('/merchants/apply/hours');
              }}
            >
              Continue
            </ContinueButton>
            <FooterNote>
              {multi && branches.length > 1
                ? `Branches 2${branches.length > 2 ? ` and ${branches.length}` : ''} inherit hours and menu until you edit them`
                : 'Riders are matched to the branch nearest the guest'}
            </FooterNote>
          </>
        )
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {/* --------------------------------------------------- main branch */}
        <div className="border-border bg-surface rounded-2xl border p-5">
          <p className="text-[0.9375rem] font-extrabold">Where is your main branch?</p>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button loading={locating} loadingText="Locating…" onClick={() => void pinFromBrowser()}>
              <span className="flex items-center gap-2">
                <LocateFixed className="h-4 w-4" aria-hidden="true" />
                Use my location
              </span>
            </Button>
            <Input
              id="address"
              label="Street address"
              labelHidden
              placeholder="Building, street, area"
              leadingIcon={<MapPinIcon className="h-4 w-4" />}
              value={primary?.address_text ?? ''}
              onChange={(event) => {
                const next = [...branches];
                next[0] = { ...(next[0] ?? blank()), address_text: event.target.value };
                setLocalBranches(next);
              }}
              onBlur={() => void persist(branches)}
              containerClassName="flex-1 min-w-[12rem]"
            />
          </div>

          <div className="mt-4">
            <p className="text-[0.8125rem] font-bold">Which area are you in?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {zones.map((zone) => (
                <Chip
                  key={zone.id}
                  selected={primary?.zone === zone.name}
                  onClick={() => pickArea(zone, 0)}
                >
                  {zone.name}
                </Chip>
              ))}
              <Chip
                selected={!!outside}
                onClick={() => {
                  /* Somewhere we do not cover: a point far enough outside
                     that zone_for_point will say so, and the merchant can
                     correct it with a real pin if they are on a phone. */
                  const next = [...branches];
                  next[0] = { ...(next[0] ?? blank()), lat: -1.47, lng: 36.96 };
                  setLocalBranches(next);
                  void persist(next);
                }}
              >
                Somewhere else
              </Chip>
            </div>
            <p className="text-muted-light mt-3 text-xs font-semibold leading-[1.7]">
              On a phone, “Use my location” sets the pin exactly. On a laptop, pick the area — the
              merchant team confirms the exact spot on the onboarding call.
            </p>
          </div>
        </div>

        {/* ------------------------------------------------------- how many */}
        <div className="border-border bg-surface rounded-2xl border p-5">
          <p className="text-[0.9375rem] font-extrabold">How many branches?</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {BRANCH_BANDS.map((option) => (
              <Chip
                key={option.value}
                selected={band === option.value}
                onClick={() => patch({ branch_count_band: option.value }, 3)}
              >
                {option.label}
              </Chip>
            ))}
          </div>
          <p className="text-muted-light mt-4 text-xs font-semibold leading-[1.7]">
            Each branch gets its own hours, menu and orders. Add the addresses now or later — one is
            enough to go live.
          </p>
        </div>
      </div>

      {/* --------------------------------------------------------- branches */}
      {multi && (
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[0.9375rem] font-extrabold">Your branches</h2>
          </div>

          <ul className="mt-4 space-y-3">
            {branches.map((branch, index) => (
              <li
                key={index}
                className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 ${
                  index === 0 ? 'border-gold bg-surface' : 'border-border bg-surface'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="bg-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold text-white"
                >
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  {/*
                    The main branch's address is typed in the card above. The
                    others need their own field here, or a rider gets sent to
                    a zone with no street to find.
                  */}
                  {index > 0 ? (
                    <Input
                      id={`branch_address_${index}`}
                      label={`Address of branch ${index + 1}`}
                      labelHidden
                      placeholder="Building, street, area"
                      value={branch.address_text}
                      onChange={(event) => {
                        const next = [...branches];
                        next[index] = { ...branch, address_text: event.target.value };
                        setLocalBranches(next);
                      }}
                      onBlur={() => void persist(branches)}
                    />
                  ) : (
                    <p className="text-[0.9375rem] font-extrabold">
                      {branch.address_text || 'New branch'}
                      <span className="text-gold-text ml-2 text-[0.6875rem] uppercase tracking-wide">
                        · Main
                      </span>
                    </p>
                  )}
                  <p
                    className={`mt-0.5 text-xs font-bold ${
                      branch.tier === 'extended' || branch.tier === 'trial'
                        ? 'text-warning'
                        : branch.zone
                          ? 'text-success'
                          : 'text-muted-light'
                    }`}
                  >
                    {branch.zone
                      ? `${branch.tier === 'core' ? 'Core' : branch.tier === 'extended' ? 'Extended' : 'Trial'} zone · ${branch.eta_min}–${branch.eta_max} min${
                          branch.cod_allowed === false ? ' · cash-on-delivery limited' : ''
                        }`
                      : 'No zone yet — pick an area'}
                  </p>
                </div>

                {index === 0 ? (
                  <span className="border-border-strong text-ink shrink-0 rounded-full border px-4 py-2 text-[0.8125rem] font-extrabold">
                    Sets the hours
                  </span>
                ) : (
                  <Chip
                    selected={branch.inherits_hours}
                    onClick={() => {
                      const next = [...branches];
                      next[index] = { ...branch, inherits_hours: !branch.inherits_hours };
                      setLocalBranches(next);
                      void persist(next);
                    }}
                  >
                    Same hours as main
                  </Chip>
                )}

                {index > 0 && (
                  <button
                    type="button"
                    aria-label={`Remove branch ${index + 1}`}
                    onClick={() => {
                      const next = branches.filter((_, i) => i !== index);
                      setLocalBranches(next);
                      void persist(next);
                    }}
                    className="text-muted hover:text-danger shrink-0 p-1.5"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setLocalBranches([...branches, blank()])}
            className="border-border-strong text-muted hover:border-ink hover:text-ink mt-3 flex w-full items-center gap-3 rounded-2xl border border-dashed p-4 text-left text-[0.9375rem] font-bold transition-colors"
          >
            <span className="border-border-strong flex h-9 w-9 items-center justify-center rounded-lg border border-dashed">
              <Plus className="h-4 w-4" aria-hidden="true" />
            </span>
            Add branch {branches.length + 1} · or skip and add it from the dashboard
          </button>

          {/* A branch row that has no pin yet needs its own area picker. */}
          {branches.map((branch, index) =>
            index > 0 && !branch.zone ? (
              <div key={`picker-${index}`} className="mt-3">
                <p className="text-[0.8125rem] font-bold">Area for branch {index + 1}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {zones.map((zone) => (
                    <Chip key={zone.id} selected={false} onClick={() => pickArea(zone, index)}>
                      {zone.name}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : null,
          )}
        </div>
      )}

      {/* -------------------------------------------------------------- map */}
      <div className="mt-6">
        <ZoneMap
          zones={zones}
          pins={pins}
          note={
            !hasPin ? (
              'Pick your area or use your location, and we will tell you straight away whether we can reach you.'
            ) : inZone ? (
              branches.length > 1 ? (
                'Riders are matched to the branch nearest the guest · each branch shows its own delivery time'
              ) : (
                <>
                  Inside our {outside?.city ?? 'Nairobi'} {primary?.tier} zone — guests in{' '}
                  {zones
                    .filter((z) => z.tier === primary?.tier && z.name !== primary?.zone)
                    .map((z) => z.name)
                    .join(', ')}{' '}
                  can order from you
                </>
              )
            ) : outside ? (
              <>
                We do not deliver from {primary?.address_text || 'there'} yet. {outside.city} Core
                reaches as far as{' '}
                {zones
                  .filter((z) => z.tier === 'extended')
                  .map((z) => z.name)
                  .join(' and ')}
                . We are adding zones every month — you can save your details and be first in line.
              </>
            ) : null
          }
        />
      </div>

      {/* ---------------------------------------------------- out of zone */}
      {outside && hasPin && !inZone && (
        <div className="border-ink bg-surface mt-6 rounded-2xl border-2 p-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">
                Save my place for when the zone opens
              </h2>
              <p className="text-muted mt-2 text-[0.9375rem] leading-[1.8]">
                Keeps everything you have entered. When {primary?.address_text || 'your area'} or a
                nearer zone goes live we message you first and you finish the last steps in five
                minutes.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button onClick={() => void declareOutside()}>Save my place</Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    patch({ branch_count_band: '2_3' }, 3);
                    setLocalBranches([...branches, blank()]);
                  }}
                >
                  I also have a branch inside Nairobi
                </Button>
              </div>
            </div>

            <div className="border-warning/40 bg-warning-bg rounded-xl border p-4">
              <p className="text-warning text-[0.8125rem] font-extrabold">Why the zone matters</p>
              <p className="text-warning mt-2 text-[0.8125rem] font-semibold leading-[1.7]">
                Riders are matched by distance to your counter. Outside a zone we cannot promise a
                guest a delivery time, so we would rather not list you than list you badly.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------- pickup, parking, landmark */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="border-border bg-surface rounded-2xl border p-5">
          <p className="text-[0.9375rem] font-extrabold">Pickup instructions · main branch</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {PICKUP.map((option) => (
              <Chip
                key={option.value}
                selected={draft?.pickup_instructions === option.value}
                onClick={() => patch({ pickup_instructions: option.value }, 3)}
              >
                {option.label}
              </Chip>
            ))}
          </div>
          <p className="text-muted-light mt-4 text-xs font-semibold leading-[1.7]">
            Other branches copy this until you change it.
          </p>
        </div>

        <div className="border-border bg-surface rounded-2xl border p-5">
          <p className="text-[0.9375rem] font-extrabold">Rider parking</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {PARKING.map((option) => (
              <Chip
                key={option.value}
                selected={draft?.rider_parking === option.value}
                onClick={() => patch({ rider_parking: option.value }, 3)}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="border-border bg-surface rounded-2xl border p-5">
          <p className="text-[0.9375rem] font-extrabold">Landmark riders know</p>
          <div className="mt-4">
            <Input
              id="landmark"
              label="Landmark"
              labelHidden
              placeholder="e.g. opposite Sarit Centre"
              defaultValue={draft?.landmark ?? ''}
              onBlur={(event) => patch({ landmark: event.target.value }, 3)}
            />
          </div>
        </div>
      </div>
    </OnboardingShell>
  );
}

interface SavedBranch {
  address_text: string | null;
  latitude: number | null;
  longitude: number | null;
  inherits_hours: boolean;
  source: 'manual' | 'google';
  zone: {
    name: string;
    tier: 'core' | 'extended' | 'trial';
    eta_min: number;
    eta_max: number;
    cod_allowed: boolean;
  } | null;
}

function blank(): DraftBranch {
  return {
    address_text: '',
    lat: null,
    lng: null,
    inherits_hours: true,
    source: 'manual',
  };
}
