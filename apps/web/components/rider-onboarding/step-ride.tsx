'use client';

import { Button, Input, PhoneInput, useToast } from '@nexg/ui';
import { Bike, Camera, Car, Check, Truck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { BecauseTag, Chip, DocumentsNote } from '@/components/onboarding/controls';
import { ContinueButton, FooterNote } from '@/components/onboarding/shell-frame';
import { createClient } from '@/lib/supabase/client';

import { RiderShell } from './rider-shell';
import { useRiderOnboarding } from './store';
import { looksKenyan, VEHICLES, YEARS, type Vehicle } from './types';

/**
 * Step 2 — the vehicle, and everything it implies.
 *
 * This is the step that decides the size of the rest of the application. A
 * bicycle rider is asked for three documents and never sees a question about
 * insurance; a rider on a rented motorbike is asked for seven. Getting that
 * right here is why a bicycle rider does not abandon at the documents screen.
 */
export function RiderRideStep() {
  const router = useRouter();
  const { toast } = useToast();
  const { draft, patch, setVehicle, flushNow } = useRiderOnboarding();
  const [docs, setDocs] = React.useState<{ label: string; kind: string }[]>([]);

  const draftId = draft?.id ?? null;
  const vehicle = draft?.vehicle ?? null;
  const motorised = vehicle !== null && vehicle !== 'bicycle';

  /*
   * The count is asked of the database, so the number promised here is the
   * number the documents step will show and the reviewer will see.
   *
   * It has to wait for the answers to land first. Reading it on its own
   * timer raced the debounced save, so a rider who picked third-party cover
   * was told "5 documents" here and shown 6 on the next screen — the query
   * ran against a row that did not yet know about the insurance.
   */
  const signature = `${vehicle}-${draft?.ownership}-${draft?.insurance}`;
  React.useEffect(() => {
    if (!draftId || !vehicle) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        await flushNow();
        if (cancelled) return;
        const supabase = createClient();
        const { data } = await supabase.rpc('fn_rider_required_docs', { p_rider_id: draftId });
        if (!cancelled) setDocs((data as { label: string; kind: string }[] | null) ?? []);
      })();
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draftId, vehicle, signature, flushNow]);

  const plateWarning =
    motorised && draft?.plate_no && !looksKenyan(draft.plate_no)
      ? 'That is not a Kenyan plate format. We will still take it — the team checks it at the hub.'
      : undefined;

  const ready =
    vehicle !== null &&
    (vehicle === 'bicycle'
      ? !!draft?.ownership
      : !!draft?.plate_no && !!draft?.ownership && !!draft?.insurance);

  return (
    <RiderShell
      step={2}
      eyebrow="Your ride"
      title="What will you ride?"
      intro="Your vehicle decides which documents we need. A bicycle needs none of the vehicle papers."
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => router.push('/riders/apply/start')}>
            Back
          </Button>
          <ContinueButton
            disabled={!ready}
            onClick={async () => {
              await flushNow();
              router.push('/riders/apply/areas');
            }}
          >
            Continue
          </ContinueButton>
          <FooterNote>Your answers decide which documents we ask for</FooterNote>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {VEHICLES.map((v) => (
          <VehicleTile
            key={v.value}
            vehicle={v.value}
            label={v.label}
            blurb={v.blurb}
            selected={vehicle === v.value}
            onClick={() => void setVehicle(v.value)}
          />
        ))}
      </div>

      {/* ------------------------------------------------------- motorised */}
      {motorised && (
        <div className="animate-in fade-in slide-in-from-bottom-2 mt-6 grid gap-4 duration-300 lg:grid-cols-2">
          <div className="border-border bg-surface rounded-2xl border p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[0.9375rem] font-extrabold">Number plate</h3>
              <BecauseTag />
            </div>
            <div className="mt-4 flex flex-wrap items-start gap-3">
              <input
                id="plate_no"
                aria-label="Number plate"
                value={draft?.plate_no ?? ''}
                placeholder="KMDA 421K"
                onChange={(event) => patch({ plate_no: event.target.value.toUpperCase() }, 2)}
                className="border-ink bg-surface focus-visible:ring-gold w-full max-w-[13rem] rounded-xl border-2 px-4 py-3 text-lg font-extrabold tracking-[0.18em] focus:outline-none focus-visible:ring-2"
              />
              <Button
                variant="outline"
                onClick={() =>
                  toast({
                    title: 'Snap it on the documents step',
                    description:
                      'The camera opens there, reads the plate off the logbook and checks it against this one.',
                  })
                }
              >
                <span className="flex items-center gap-2">
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  Snap the plate
                </span>
              </Button>
            </div>
            <p
              className={`mt-3 text-xs font-semibold leading-[1.7] ${
                plateWarning ? 'text-warning' : 'text-muted-light'
              }`}
            >
              {plateWarning ??
                'Shown to guests on their tracking screen so they know it is you at the gate.'}
            </p>
          </div>

          <div className="border-border bg-surface rounded-2xl border p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[0.9375rem] font-extrabold">
                The {vehicle === 'car' ? 'car' : vehicle === 'tuktuk' ? 'tuk-tuk' : 'bike'} is
              </h3>
              <BecauseTag />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { value: 'own', label: 'Mine' },
                { value: 'rented', label: 'Rented / employer' },
                { value: 'family', label: 'Family' },
              ].map((o) => (
                <Chip
                  key={o.value}
                  selected={draft?.ownership === o.value}
                  onClick={() => patch({ ownership: o.value as 'own' }, 2)}
                >
                  {o.label}
                </Chip>
              ))}
            </div>
            <p className="text-muted-light mt-4 text-xs font-semibold leading-[1.7]">
              If rented, the logbook can be in the owner’s name — we ask for a short permission
              letter from them.
            </p>

            {draft?.ownership && draft.ownership !== 'own' && (
              <div className="animate-in fade-in mt-4 grid gap-3 duration-200 sm:grid-cols-2">
                <Input
                  id="owner_name"
                  label="Owner’s name, as on the logbook"
                  defaultValue={draft.owner_name ?? ''}
                  onBlur={(event) => patch({ owner_name: event.target.value }, 2)}
                />
                <PhoneInput
                  id="owner_phone"
                  label="Owner’s phone"
                  value={draft.owner_phone}
                  onChange={(value) => patch({ owner_phone: value }, 2)}
                />
              </div>
            )}
          </div>

          <div className="border-border bg-surface rounded-2xl border p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[0.9375rem] font-extrabold">Insurance</h3>
              <BecauseTag />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { value: 'comprehensive', label: 'Comprehensive' },
                { value: 'third_party', label: 'Third party' },
                { value: 'none', label: 'Not yet' },
              ].map((o) => (
                <Chip
                  key={o.value}
                  selected={draft?.insurance === o.value}
                  onClick={() => patch({ insurance: o.value as 'none' }, 2)}
                >
                  {o.label}
                </Chip>
              ))}
            </div>
            <p className="text-muted-light mt-4 text-xs font-semibold leading-[1.7]">
              Third party is the minimum. We ask for the certificate on the documents step and
              remind you before it expires.
            </p>
            {draft?.insurance === 'none' && (
              <p className="border-warning/40 bg-warning-bg text-warning mt-3 rounded-lg border p-3 text-xs font-bold leading-[1.7]">
                You can finish the application, but we cannot activate you without cover. Bring the
                certificate to the hub.
              </p>
            )}
          </div>

          <YearsCard
            value={draft?.years_riding ?? null}
            onPick={(v) => patch({ years_riding: v }, 2)}
          />
        </div>
      )}

      {/* --------------------------------------------------------- bicycle */}
      {vehicle === 'bicycle' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 mt-6 grid gap-4 duration-300 lg:grid-cols-2">
          <div className="border-success/30 bg-success-bg rounded-2xl border p-5 lg:col-span-2">
            <p className="text-success flex items-center gap-2 text-[0.9375rem] font-extrabold">
              <Check className="h-4 w-4" aria-hidden="true" />
              Good news
            </p>
            <p className="text-success mt-2 text-[0.875rem] font-semibold leading-[1.7]">
              No licence, logbook or insurance needed. Just your ID, a selfie and a good conduct
              certificate — 3 documents instead of 6.
            </p>
          </div>

          <div className="border-border bg-surface rounded-2xl border p-5">
            <h3 className="text-[0.9375rem] font-extrabold">The bicycle is</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { value: 'own', label: 'Mine' },
                { value: 'family', label: 'Borrowed' },
              ].map((o) => (
                <Chip
                  key={o.value}
                  selected={draft?.ownership === o.value}
                  onClick={() => patch({ ownership: o.value as 'own' }, 2)}
                >
                  {o.label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="border-border bg-surface rounded-2xl border p-5">
            <h3 className="text-[0.9375rem] font-extrabold">
              How far are you happy to ride per trip?
            </h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { km: 3, label: 'Up to 3 km' },
                { km: 5, label: 'Up to 5 km' },
                { km: 100, label: 'Any distance' },
              ].map((o) => (
                <Chip
                  key={o.km}
                  selected={draft?.bike_max_km === o.km}
                  onClick={() => patch({ bike_max_km: o.km }, 2)}
                >
                  {o.label}
                </Chip>
              ))}
            </div>
            <p className="text-muted-light mt-4 text-xs font-semibold leading-[1.7]">
              We only send you requests inside this range.
            </p>
          </div>

          <YearsCard
            value={draft?.years_riding ?? null}
            onPick={(v) => patch({ years_riding: v }, 2)}
          />
        </div>
      )}

      {vehicle && docs.length > 0 && (
        <div className="mt-6">
          <DocumentsNote>
            Because you ride{' '}
            <strong>
              {draft?.ownership === 'own'
                ? 'your own'
                : draft?.ownership
                  ? 'a ' + draft.ownership
                  : 'a'}{' '}
              {vehicle === 'tuktuk' ? 'tuk-tuk' : vehicle}
              {draft?.insurance === 'third_party'
                ? ' with third-party insurance'
                : draft?.insurance === 'comprehensive'
                  ? ' with comprehensive insurance'
                  : ''}
            </strong>{' '}
            we need {docs.length} documents. A bicycle rider needs 3.
          </DocumentsNote>
        </div>
      )}
    </RiderShell>
  );
}

function YearsCard({ value, onPick }: { value: string | null; onPick: (v: string) => void }) {
  return (
    <div className="border-border bg-surface rounded-2xl border p-5">
      <h3 className="text-[0.9375rem] font-extrabold">Years riding for work</h3>
      <div className="mt-4 flex flex-wrap gap-2">
        {YEARS.map((y) => (
          <Chip key={y.value} selected={value === y.value} onClick={() => onPick(y.value)}>
            {y.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function VehicleTile({
  vehicle,
  label,
  blurb,
  selected,
  onClick,
}: {
  vehicle: Vehicle;
  label: string;
  blurb: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`focus-visible:ring-gold flex flex-col items-center gap-2 rounded-2xl border p-5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        selected
          ? 'border-ink bg-ink text-white'
          : 'border-border bg-surface hover:border-border-strong'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-11 w-11 items-center justify-center rounded-xl ${
          selected ? 'bg-gold text-ink' : 'bg-bg text-ink'
        }`}
      >
        <VehicleIcon vehicle={vehicle} />
      </span>
      <span className="text-[0.8125rem] font-extrabold">{label}</span>
      <span
        className={`text-[0.6875rem] font-semibold ${selected ? 'text-white/60' : 'text-muted-light'}`}
      >
        {blurb}
      </span>
    </button>
  );
}

/**
 * lucide has a bicycle, a car and a truck but no motorbike, and a bicycle
 * standing in for a motorbike on the tile a rider taps to say which one they
 * have would be a poor joke. So the motorbike is drawn.
 */
function VehicleIcon({ vehicle }: { vehicle: Vehicle }) {
  if (vehicle === 'bicycle') return <Bike className="h-5 w-5" />;
  if (vehicle === 'car') return <Car className="h-5 w-5" />;
  if (vehicle === 'tuktuk') return <Truck className="h-5 w-5" />;

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="5" cy="17" r="3.2" />
      <circle cx="19" cy="17" r="3.2" />
      <path d="M8 17h5l3.5-6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 11h4l1.5 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 7.5h3" strokeLinecap="round" />
    </svg>
  );
}
