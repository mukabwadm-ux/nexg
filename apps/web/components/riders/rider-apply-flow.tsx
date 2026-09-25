'use client';

import {
  Button,
  Card,
  ChipGroup,
  EmptyState,
  FileDrop,
  Input,
  PhoneInput,
  Stepper,
  useToast,
} from '@nexg/ui';
import { ArrowRight, CheckCircle2, Info } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { type ApplyResult, submitRiderApplication } from '@/app/riders/apply/actions';

export interface CityOption {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export interface RequirementRow {
  id: string;
  kind: string;
  label: string;
  help_text: string | null;
  has_expiry: boolean;
  applies_when: unknown;
  sort: number;
}

const VEHICLES = [
  { value: 'motorbike', label: 'Motorbike' },
  { value: 'bicycle', label: 'Bicycle' },
  { value: 'car', label: 'Car' },
  { value: 'tuktuk', label: 'Tuk-tuk' },
];

const STEPS = [
  { label: 'About you', description: 'Name, phone, city' },
  { label: 'Your documents', description: 'ID, licence, insurance' },
  { label: 'Done', description: 'We verify and reply' },
];

/**
 * Which requirements apply to this vehicle. The same rule as
 * fn_rider_required_docs in the database, evaluated here so the applicant sees
 * the right list before a rider row exists. The database remains the authority:
 * the status gate counts the same requirements server-side.
 */
function appliesTo(requirement: RequirementRow, vehicle: string): boolean {
  const when = requirement.applies_when as Record<string, string[]> | null;
  if (!when || Object.keys(when).length === 0) return true;
  const vehicles = when['vehicle'];
  if (!vehicles) return true;
  return vehicles.includes(vehicle);
}

export function RiderApplyFlow({
  cities,
  requirements,
  prefill,
}: {
  cities: CityOption[];
  requirements: RequirementRow[];
  prefill: { firstName: string; phone: string | null; cityId: string | null; vehicle: string };
}) {
  const { toast } = useToast();

  const [step, setStep] = React.useState(1);
  const [pending, setPending] = React.useState(false);

  const [firstName, setFirstName] = React.useState(prefill.firstName);
  const [lastName, setLastName] = React.useState('');
  const [phone, setPhone] = React.useState<string | null>(prefill.phone);
  const [cityId, setCityId] = React.useState<string | null>(
    prefill.cityId ?? cities[0]?.id ?? null,
  );
  const [vehicle, setVehicle] = React.useState<string | null>(prefill.vehicle);
  const [plate, setPlate] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [files, setFiles] = React.useState<Record<string, File>>({});

  const needsPlate = vehicle !== null && vehicle !== 'bicycle';
  const applicable = requirements.filter((r) => appliesTo(r, vehicle ?? 'motorbike'));

  const submitStepOne = async () => {
    const next: Record<string, string> = {};
    if (!firstName.trim()) next['firstName'] = 'Enter your first name.';
    if (!lastName.trim()) next['lastName'] = 'Enter your last name.';
    if (!phone) next['phone'] = 'Enter a valid M-Pesa number.';
    if (!cityId) next['city'] = 'Choose where you will ride.';
    if (needsPlate && !plate.trim()) next['plate'] = 'Enter your number plate.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    const formData = new FormData();
    formData.set('first_name', firstName);
    formData.set('last_name', lastName);
    formData.set('phone', phone!);
    formData.set('city_id', cityId!);
    formData.set('vehicle', vehicle!);
    if (plate) formData.set('plate_no', plate);

    const result: ApplyResult = await submitRiderApplication(null, formData);
    setPending(false);

    if (!result.ok) {
      toast({ title: 'We could not save that', description: result.message, tone: 'danger' });
      return;
    }

    toast({
      title: 'Application started',
      description: 'Now add your documents. You can leave and come back to finish.',
      tone: 'success',
    });
    setStep(2);
  };

  return (
    <div>
      <Stepper steps={STEPS} current={step} />

      {/* --------------------------------------------------------- step one */}
      {step === 1 && (
        <section className="mt-8">
          <h1 className="text-2xl font-extrabold tracking-tight">About you</h1>
          <p className="text-muted mt-1 text-sm">
            Use the name on your national ID and the M-Pesa line you want to be paid on.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Input
              id="first_name"
              label="First name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              {...(errors['firstName'] ? { error: errors['firstName'] } : {})}
              required
            />
            <Input
              id="last_name"
              label="Last name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              {...(errors['lastName'] ? { error: errors['lastName'] } : {})}
              required
            />
          </div>

          <div className="mt-4">
            <PhoneInput
              id="phone"
              label="Phone (M-Pesa)"
              hint="This is the number we pay you on, and how the concierge reaches you."
              value={phone}
              onChange={setPhone}
              {...(errors['phone'] ? { error: errors['phone'] } : {})}
              required
            />
          </div>

          <div className="mt-5">
            <ChipGroup
              id="city"
              label="Where will you ride?"
              options={cities.map((c) => ({ value: c.id, label: c.name }))}
              value={cityId}
              onChange={setCityId}
              {...(errors['city'] ? { error: errors['city'] } : {})}
              required
              emptyMessage="No cities are open for applications yet"
            />
          </div>

          <div className="mt-5">
            <ChipGroup
              id="vehicle"
              label="What will you ride?"
              options={VEHICLES}
              value={vehicle}
              onChange={setVehicle}
              required
            />
          </div>

          {needsPlate && (
            <div className="mt-4">
              <Input
                id="plate"
                label="Number plate"
                placeholder="KMC 123A"
                hint="Must match the logbook you upload next."
                value={plate}
                onChange={(event) => setPlate(event.target.value)}
                {...(errors['plate'] ? { error: errors['plate'] } : {})}
                required
              />
            </div>
          )}

          <div className="mt-6">
            <Button
              block
              size="lg"
              loading={pending}
              loadingText="Saving…"
              onClick={submitStepOne}
              trailingIcon={<ArrowRight className="h-4 w-4" />}
            >
              Continue
            </Button>
          </div>
        </section>
      )}

      {/* --------------------------------------------------------- step two */}
      {step === 2 && (
        <section className="mt-8">
          <h1 className="text-2xl font-extrabold tracking-tight">Your documents</h1>
          <p className="text-muted mt-1 text-sm">
            {applicable.length} documents for a{' '}
            {VEHICLES.find((v) => v.value === vehicle)?.label.toLowerCase()}. Each one saves on its
            own — you can leave and come back.
          </p>

          <Card tone="muted" className="mt-5 flex items-start gap-3">
            <Info className="text-gold-text mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="text-muted text-xs leading-relaxed">
              Uploading needs a verified phone number, and SMS verification is not switched on yet —
              the provider account is still being set up. Your application is saved; come back here
              once we have sent you a code.
            </p>
          </Card>

          <ul className="mt-5 space-y-4">
            {applicable.map((requirement) => (
              <li key={requirement.id}>
                <FileDrop
                  id={`doc_${requirement.kind}`}
                  label={requirement.label}
                  {...(requirement.help_text ? { hint: requirement.help_text } : {})}
                  {...(files[requirement.kind] ? { file: files[requirement.kind]! } : {})}
                  onFileSelect={(file) =>
                    setFiles((current) => ({ ...current, [requirement.kind]: file }))
                  }
                  onRemove={() =>
                    setFiles((current) => {
                      const next = { ...current };
                      delete next[requirement.kind];
                      return next;
                    })
                  }
                  onValidationError={(message) =>
                    toast({
                      title: 'That file will not work',
                      description: message,
                      tone: 'danger',
                    })
                  }
                  required
                />
                {requirement.has_expiry && (
                  <div className="mt-2">
                    <Input
                      id={`expiry_${requirement.kind}`}
                      type="date"
                      label={`${requirement.label} — expiry date`}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-6 flex gap-2">
            <Button variant="outline" size="lg" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button block size="lg" onClick={() => setStep(3)}>
              Done for now
            </Button>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------- step three */}
      {step === 3 && (
        <section className="mt-8">
          <EmptyState
            icon={<CheckCircle2 className="h-5 w-5" />}
            title="We verify and come back to you"
            description="We check every document by hand, usually within two working days. You will get an SMS the moment there is a decision, and you can follow progress on your status page."
            action={{ label: 'Back to riders', href: '/riders' }}
          />

          <Card className="mt-5">
            <h2 className="text-sm font-bold">What happens next</h2>
            <ol className="text-muted mt-3 space-y-2 text-sm">
              <li>1. We review your documents and come back with anything missing.</li>
              <li>2. A short onboarding session on how NexG works with hotels and guests.</li>
              <li>3. Your kit, then you go online and take your first request.</li>
            </ol>
            <p className="text-muted-light mt-4 text-xs">
              Questions in the meantime?{' '}
              <Link href="/help" className="font-bold underline underline-offset-4">
                Talk to the rider team
              </Link>
              .
            </p>
          </Card>
        </section>
      )}
    </div>
  );
}
