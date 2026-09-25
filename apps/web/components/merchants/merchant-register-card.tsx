'use client';

import { Button, ChipGroup, Input, PhoneInput } from '@nexg/ui';
import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

export interface CityOption {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export const MERCHANT_CATEGORIES = [
  { value: 'restaurant', label: 'Food' },
  { value: 'bar_liquor', label: 'Drinks' },
  { value: 'laundry', label: 'Laundry' },
  { value: 'florist', label: 'Flowers' },
  { value: 'beauty_fashion', label: 'Beauty & Fashion' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'supermarket', label: 'Supermarket' },
  { value: 'gift_shop', label: 'Gift shop' },
  { value: 'other', label: 'Other' },
];

/**
 * The inline "Register your business" card from the `Merchants` artboard.
 * Continuing carries the answers into /merchants/apply, where the location pin
 * and documents are collected.
 */
export function MerchantRegisterCard({ cities }: { cities: CityOption[] }) {
  const router = useRouter();
  const [tradingName, setTradingName] = React.useState('');
  const [contactName, setContactName] = React.useState('');
  const [phone, setPhone] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState('');
  const [category, setCategory] = React.useState<string | null>('restaurant');
  const [cityId, setCityId] = React.useState<string | null>(cities[0]?.id ?? null);

  const ready =
    tradingName.trim() && contactName.trim() && phone && email.trim() && category && cityId;

  const onContinue = () => {
    const params = new URLSearchParams();
    params.set('trading_name', tradingName);
    params.set('contact_name', contactName);
    if (phone) params.set('phone', phone);
    params.set('email', email);
    if (category) params.set('category', category);
    if (cityId) params.set('city', cityId);
    router.push(`/merchants/apply?${params.toString()}`);
  };

  return (
    <div className="border-border bg-surface shadow-raised rounded-2xl border p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          id="reg_trading_name"
          label="Business name"
          placeholder="Your registered business name"
          value={tradingName}
          onChange={(event) => setTradingName(event.target.value)}
          required
        />
        <Input
          id="reg_contact_name"
          label="Contact person"
          placeholder="Your name"
          value={contactName}
          onChange={(event) => setContactName(event.target.value)}
          required
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <PhoneInput id="reg_phone" label="Phone" value={phone} onChange={setPhone} required />
        <Input
          id="reg_email"
          type="email"
          label="Email"
          placeholder="you@business.co.ke"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>

      <div className="mt-4">
        <ChipGroup
          id="reg_category"
          label="What do you sell?"
          options={MERCHANT_CATEGORIES}
          value={category}
          onChange={setCategory}
          required
        />
      </div>

      <div className="mt-4">
        <ChipGroup
          id="reg_city"
          label="City"
          options={cities.map((c) => ({ value: c.id, label: c.name }))}
          value={cityId}
          onChange={setCityId}
          required
          emptyMessage="No cities are open for onboarding yet"
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
          Register Your Business
        </Button>
      </div>

      <p className="text-muted-light mt-2 text-center text-[0.6875rem]">
        By registering you agree to the NexG merchant terms.
      </p>
    </div>
  );
}
