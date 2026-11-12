'use client';

import { Button, ChipGroup, Input, PhoneInput, useToast } from '@nexg/ui';
import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

export interface CityOption {
  id: string;
  name: string;
  slug: string;
  status: string;
}

/** A row of category_config: the categories the registration form offers. */
export interface CategoryOption {
  category: string;
  label: string;
}

/** For a merchant whose city is not open yet; the apply flow captures them. */
const OTHER_CITY = '__other__';

/**
 * The inline "Register your business" card from the `Merchants` artboard.
 * Continuing carries the answers into /merchants/apply, which passes them on
 * to the registration form so they are already filled in there; the location
 * pin and documents are collected in that form.
 *
 * The categories are the ones the registration form itself offers
 * (category_config), so the choice made here is the one it opens with.
 */
export function MerchantRegisterCard({
  cities,
  categories,
}: {
  cities: CityOption[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [tradingName, setTradingName] = React.useState('');
  const [contactName, setContactName] = React.useState('');
  const [phone, setPhone] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState('');
  const [category, setCategory] = React.useState<string | null>(categories[0]?.category ?? null);
  const [cityId, setCityId] = React.useState<string | null>(cities[0]?.id ?? null);

  const [errors, setErrors] = React.useState<Record<string, string>>({});

  /*
   * Validate on click rather than disabling the button. The artboard draws it
   * black and ready; a card that opens with a greyed-out action reads as
   * broken before anyone has typed.
   */
  const onContinue = () => {
    const next: Record<string, string> = {};
    if (!tradingName.trim()) next['tradingName'] = 'Enter your business name.';
    if (!contactName.trim()) next['contactName'] = 'Enter a contact person.';
    if (!phone) next['phone'] = 'Enter a valid phone number.';
    if (!email.trim()) next['email'] = 'Enter a valid email address.';
    if (!cityId) next['city'] = 'Choose your city.';
    setErrors(next);

    if (Object.keys(next).length > 0) {
      toast({
        title: 'Almost there',
        description: 'Fill in the highlighted fields to continue.',
        tone: 'warning',
      });
      return;
    }

    const params = new URLSearchParams();
    params.set('trading_name', tradingName);
    params.set('contact_name', contactName);
    if (phone) params.set('phone', phone);
    params.set('email', email);
    if (category) params.set('category', category);
    if (cityId && cityId !== OTHER_CITY) {
      params.set('city', cityId);
      const town = cities.find((c) => c.id === cityId)?.name;
      if (town) params.set('town', town);
    }
    router.push(`/merchants/apply?${params.toString()}`);
  };

  return (
    /* The artboard draws no required markers here, so the fields carry none:
       /merchants/apply is where they are formally required, and onContinue
       validates every one of them on click. */
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          id="reg_trading_name"
          {...(errors['tradingName'] ? { error: errors['tradingName'] } : {})}
          label="Business name"
          placeholder="Your registered business name"
          value={tradingName}
          onChange={(event) => setTradingName(event.target.value)}
        />
        <Input
          id="reg_contact_name"
          {...(errors['contactName'] ? { error: errors['contactName'] } : {})}
          label="Contact person"
          placeholder="Your name"
          value={contactName}
          onChange={(event) => setContactName(event.target.value)}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <PhoneInput
          id="reg_phone"
          {...(errors['phone'] ? { error: errors['phone'] } : {})}
          label="Phone"
          value={phone}
          onChange={setPhone}
        />
        <Input
          id="reg_email"
          {...(errors['email'] ? { error: errors['email'] } : {})}
          type="email"
          label="Email"
          placeholder="you@business.co.ke"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="mt-4">
        <ChipGroup
          id="reg_category"
          label="What do you sell?"
          options={categories.map((c) => ({ value: c.category, label: c.label }))}
          value={category}
          onChange={setCategory}
          selectedTone="gold"
        />
      </div>

      <div className="mt-4">
        <ChipGroup
          id="reg_city"
          {...(errors['city'] ? { error: errors['city'] } : {})}
          label="City"
          options={[
            ...cities.map((c) => ({ value: c.id, label: c.name })),
            { value: OTHER_CITY, label: 'Other' },
          ]}
          value={cityId}
          onChange={setCityId}
          selectedTone="gold"
          emptyMessage="No cities are open for onboarding yet"
        />
      </div>

      <div className="mt-5">
        <Button
          block
          size="lg"
          onClick={onContinue}
          trailingIcon={<ArrowRight className="text-gold h-4 w-4" />}
        >
          Register Your Business
        </Button>
      </div>

      <p className="text-muted-light mt-2 text-center text-[0.6875rem] font-semibold">
        By registering you agree to the NexG merchant terms.
      </p>
    </div>
  );
}
