'use client';

import { Button, ChipGroup, Input, PhoneInput, useToast } from '@nexg/ui';
import { ArrowRight, Bike, Car, Truck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

export interface CityOption {
  id: string;
  name: string;
  slug: string;
  status: string;
}

/**
 * The "Become a rider" card from the `Riders` artboard — step one of the
 * application, inline on the marketing page.
 *
 * Measured off the artboard: 498px wide, 28px padding, inputs on a bg-bg/40
 * fill (which resolves to the artboard's #FBFAF7 over white), city chips as
 * pills that fill gold when chosen, vehicles as 70px tiles that go ink with a
 * gold glyph, and a 56px ink button with a gold arrow.
 */

/** lucide has no motorbike, so it is drawn: two wheels, engine, handlebar. */
function MotorbikeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="5" cy="17" r="3.2" />
      <circle cx="19" cy="17" r="3.2" />
      <path d="M8.2 17h7.2l-3.6-5.4H8.4" />
      <path d="M12 11.6 14.2 8h2.6" />
      <path d="m15.4 17 2.2-5.4h-3.1" />
    </svg>
  );
}

const VEHICLES = [
  { value: 'motorbike', label: 'Motorbike', icon: <MotorbikeIcon className="h-5 w-5" /> },
  { value: 'bicycle', label: 'Bicycle', icon: <Bike className="h-5 w-5" /> },
  { value: 'car', label: 'Car', icon: <Car className="h-5 w-5" /> },
  { value: 'tuktuk', label: 'Tuk-tuk', icon: <Truck className="h-5 w-5" /> },
];

/** For a rider whose city is not open yet; the apply flow captures them. */
const OTHER_CITY = '__other__';

export function RiderApplyCard({ cities }: { cities: CityOption[] }) {
  const router = useRouter();
  const { toast } = useToast();

  const [firstName, setFirstName] = React.useState('');
  const [phone, setPhone] = React.useState<string | null>(null);
  const [city, setCity] = React.useState<string | null>(cities[0]?.id ?? null);
  const [vehicle, setVehicle] = React.useState<string | null>('motorbike');
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const cityOptions = [
    ...cities.map((c) => ({ value: c.id, label: c.name })),
    { value: OTHER_CITY, label: 'Other' },
  ];

  /*
   * The button stays enabled and validates on click. The artboard draws it
   * black and ready; a card that opens with a greyed-out action reads as
   * broken before anyone has typed anything.
   */
  const onContinue = () => {
    const next: Record<string, string> = {};
    if (!firstName.trim()) next['firstName'] = 'Enter your first name.';
    if (!phone) next['phone'] = 'Enter a valid M-Pesa number.';
    if (!city) next['city'] = 'Choose where you will ride.';
    setErrors(next);

    if (Object.keys(next).length > 0) {
      toast({
        title: 'Almost there',
        description: 'Fill in the highlighted fields to continue.',
        tone: 'warning',
      });
      return;
    }

    if (city === OTHER_CITY) {
      toast({
        title: 'We are not in your city yet',
        description: 'Carry on and we will add you to the list for when we arrive.',
        tone: 'info',
      });
    }

    const params = new URLSearchParams();
    params.set('first_name', firstName);
    if (phone) params.set('phone', phone);
    if (city && city !== OTHER_CITY) params.set('city', city);
    if (vehicle) params.set('vehicle', vehicle);
    router.push(`/riders/apply?${params.toString()}`);
  };

  return (
    <div className="bg-surface shadow-raised rounded-2xl p-6 sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.1875rem] font-extrabold tracking-tight">Become a rider</h2>
          <p className="text-muted-light mt-0.5 text-[0.8125rem]">Takes about two minutes.</p>
        </div>
        <span className="bg-gold text-ink shrink-0 rounded-full px-3 py-1.5 text-[0.6875rem] font-extrabold uppercase tracking-[0.06em]">
          Step 1 of 3
        </span>
      </div>

      {/* The artboard shows no required markers here; /riders/apply is where
          the fields are formally required. */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Input
          id="apply_first_name"
          label="First name"
          placeholder="Your first name"
          className="bg-bg/40 border-border"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          {...(errors['firstName'] ? { error: errors['firstName'] } : {})}
        />
        <PhoneInput
          id="apply_phone"
          label="Phone (M-Pesa)"
          fixedCountry
          wrapperClassName="bg-bg/40 border-border"
          value={phone}
          onChange={setPhone}
          {...(errors['phone'] ? { error: errors['phone'] } : {})}
        />
      </div>

      <div className="mt-5">
        <ChipGroup
          id="apply_city"
          label="Where will you ride?"
          options={cityOptions}
          value={city}
          onChange={setCity}
          selectedTone="gold"
          {...(errors['city'] ? { error: errors['city'] } : {})}
          emptyMessage="No cities are open for applications yet"
        />
      </div>

      <div className="mt-5">
        <ChipGroup
          id="apply_vehicle"
          label="What will you ride?"
          variant="tile"
          options={VEHICLES}
          value={vehicle}
          onChange={setVehicle}
        />
      </div>

      <div className="mt-6">
        <Button
          block
          onClick={onContinue}
          className="h-14 rounded-xl text-base"
          trailingIcon={<ArrowRight className="text-gold h-4 w-4" />}
        >
          Continue
        </Button>
      </div>

      <p className="text-muted-light mt-3 text-center text-[0.75rem]">
        Next: your documents, then a short onboarding session.
      </p>
    </div>
  );
}
