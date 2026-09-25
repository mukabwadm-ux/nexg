'use client';

import { Button, ChipGroup, Input, PhoneInput, Tag } from '@nexg/ui';
import { ArrowRight, Bike, Car, Footprints, Truck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

export interface CityOption {
  id: string;
  name: string;
  slug: string;
  status: string;
}

const VEHICLES = [
  { value: 'motorbike', label: 'Motorbike', icon: <Bike className="h-4 w-4" /> },
  { value: 'bicycle', label: 'Bicycle', icon: <Footprints className="h-4 w-4" /> },
  { value: 'car', label: 'Car', icon: <Car className="h-4 w-4" /> },
  { value: 'tuktuk', label: 'Tuk-tuk', icon: <Truck className="h-4 w-4" /> },
];

/**
 * The "Become a rider" card on /riders — step 1 of the application, inline on
 * the marketing page as the artboard shows. Continuing carries the answers
 * into /riders/apply rather than making the rider retype them.
 */
export function RiderApplyCard({ cities }: { cities: CityOption[] }) {
  const router = useRouter();
  const [firstName, setFirstName] = React.useState('');
  const [phone, setPhone] = React.useState<string | null>(null);
  const [city, setCity] = React.useState<string | null>(cities[0]?.id ?? null);
  const [vehicle, setVehicle] = React.useState<string | null>('motorbike');

  const cityOptions = cities.map((c) => ({ value: c.id, label: c.name }));
  const ready = firstName.trim().length > 0 && phone !== null && city !== null && vehicle !== null;

  const onContinue = () => {
    const params = new URLSearchParams();
    if (firstName) params.set('first_name', firstName);
    if (phone) params.set('phone', phone);
    if (city) params.set('city', city);
    if (vehicle) params.set('vehicle', vehicle);
    router.push(`/riders/apply?${params.toString()}`);
  };

  return (
    <div className="border-border bg-surface shadow-raised rounded-2xl border p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight">Become a rider</h2>
          <p className="text-muted-light mt-0.5 text-xs">Takes about two minutes.</p>
        </div>
        <Tag tone="gold" size="sm" className="shrink-0 uppercase tracking-wide">
          Step 1 of 3
        </Tag>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Input
          id="apply_first_name"
          label="First name"
          placeholder="Your first name"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          required
        />
        <PhoneInput
          id="apply_phone"
          label="Phone (M-Pesa)"
          value={phone}
          onChange={setPhone}
          required
        />
      </div>

      <div className="mt-4">
        <ChipGroup
          id="apply_city"
          label="Where will you ride?"
          options={cityOptions}
          value={city}
          onChange={setCity}
          required
          emptyMessage="No cities are open for applications yet"
        />
      </div>

      <div className="mt-4">
        <ChipGroup
          id="apply_vehicle"
          label="What will you ride?"
          options={VEHICLES}
          value={vehicle}
          onChange={setVehicle}
          required
        />
      </div>

      <div className="mt-5">
        <Button
          block
          size="lg"
          disabled={!ready}
          onClick={onContinue}
          trailingIcon={<ArrowRight className="h-4 w-4" />}
        >
          Continue
        </Button>
      </div>

      <p className="text-muted-light mt-2 text-center text-[0.6875rem]">
        Next: your documents, then a short onboarding session.
      </p>
    </div>
  );
}
