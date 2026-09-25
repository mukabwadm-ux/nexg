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
import { ArrowRight, CheckCircle2, Info, MapPin } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { type ApplyResult, submitMerchantApplication } from '@/app/merchants/apply/actions';
import { MERCHANT_CATEGORIES } from './merchant-register-card';

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

const STEPS = [
  { label: 'Business', description: 'Who you are' },
  { label: 'Location', description: 'Where to collect' },
  { label: 'Documents', description: 'Permit and licences' },
  { label: 'Done', description: 'We get in touch' },
];

/** Mirrors fn_merchant_required_docs so the list is right before a row exists. */
function appliesTo(requirement: RequirementRow, category: string): boolean {
  const when = requirement.applies_when as Record<string, string[]> | null;
  if (!when || Object.keys(when).length === 0) return true;
  const categories = when['category'];
  if (!categories) return true;
  return categories.includes(category);
}

export function MerchantApplyFlow({
  cities,
  requirements,
  prefill,
}: {
  cities: CityOption[];
  requirements: RequirementRow[];
  prefill: {
    tradingName: string;
    contactName: string;
    phone: string | null;
    email: string;
    category: string;
    cityId: string | null;
  };
}) {
  const { toast } = useToast();

  const [step, setStep] = React.useState(1);
  const [pending, setPending] = React.useState(false);

  const [legalName, setLegalName] = React.useState('');
  const [tradingName, setTradingName] = React.useState(prefill.tradingName);
  const [category, setCategory] = React.useState<string | null>(prefill.category);
  const [categoryOther, setCategoryOther] = React.useState('');
  const [contactName, setContactName] = React.useState(prefill.contactName);
  const [phone, setPhone] = React.useState<string | null>(prefill.phone);
  const [email, setEmail] = React.useState(prefill.email);
  const [cityId, setCityId] = React.useState<string | null>(
    prefill.cityId ?? cities[0]?.id ?? null,
  );
  const [address, setAddress] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [files, setFiles] = React.useState<Record<string, File>>({});

  const applicable = requirements.filter((r) => appliesTo(r, category ?? 'restaurant'));

  const submitStepOne = async () => {
    const next: Record<string, string> = {};
    if (!legalName.trim()) next['legalName'] = 'Enter the registered legal name.';
    if (!tradingName.trim()) next['tradingName'] = 'Enter the name customers know you by.';
    if (!contactName.trim()) next['contactName'] = 'Enter a contact person.';
    if (!phone) next['phone'] = 'Enter a valid phone number.';
    if (!email.trim()) next['email'] = 'Enter a valid email address.';
    if (!cityId) next['city'] = 'Choose your city.';
    if (category === 'other' && !categoryOther.trim()) {
      next['categoryOther'] = 'Tell us what your business sells.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    const formData = new FormData();
    formData.set('legal_name', legalName);
    formData.set('trading_name', tradingName);
    formData.set('category', category!);
    if (categoryOther) formData.set('category_other', categoryOther);
    formData.set('contact_name', contactName);
    formData.set('contact_phone', phone!);
    formData.set('contact_email', email);
    formData.set('city_id', cityId!);

    const result: ApplyResult = await submitMerchantApplication(null, formData);
    setPending(false);

    if (!result.ok) {
      toast({ title: 'We could not save that', description: result.message, tone: 'danger' });
      return;
    }

    toast({
      title: 'Registration started',
      description: 'Now tell us where a rider collects from.',
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
          <h1 className="text-2xl font-extrabold tracking-tight">Your business</h1>
          <p className="text-muted mt-1 text-sm">
            The legal name goes on the settlement; the trading name is what guests see.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Input
              id="legal_name"
              label="Registered legal name"
              placeholder="As on your business permit"
              value={legalName}
              onChange={(event) => setLegalName(event.target.value)}
              {...(errors['legalName'] ? { error: errors['legalName'] } : {})}
              required
            />
            <Input
              id="trading_name"
              label="Trading name"
              hint="What guests will see on your card."
              value={tradingName}
              onChange={(event) => setTradingName(event.target.value)}
              {...(errors['tradingName'] ? { error: errors['tradingName'] } : {})}
              required
            />
          </div>

          <div className="mt-5">
            <ChipGroup
              id="category"
              label="What do you sell?"
              options={MERCHANT_CATEGORIES}
              value={category}
              onChange={setCategory}
              required
            />
          </div>

          {category === 'other' && (
            <div className="mt-4">
              <Input
                id="category_other"
                label="Tell us what you sell"
                value={categoryOther}
                onChange={(event) => setCategoryOther(event.target.value)}
                {...(errors['categoryOther'] ? { error: errors['categoryOther'] } : {})}
                required
              />
            </div>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Input
              id="contact_name"
              label="Contact person"
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              {...(errors['contactName'] ? { error: errors['contactName'] } : {})}
              required
            />
            <PhoneInput
              id="contact_phone"
              label="Phone"
              value={phone}
              onChange={setPhone}
              {...(errors['phone'] ? { error: errors['phone'] } : {})}
              required
            />
          </div>

          <div className="mt-4">
            <Input
              id="contact_email"
              type="email"
              label="Email"
              hint="We send a verification link here to confirm the business is yours."
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              {...(errors['email'] ? { error: errors['email'] } : {})}
              required
            />
          </div>

          <div className="mt-5">
            <ChipGroup
              id="city"
              label="City"
              options={cities.map((c) => ({ value: c.id, label: c.name }))}
              value={cityId}
              onChange={setCityId}
              {...(errors['city'] ? { error: errors['city'] } : {})}
              required
              emptyMessage="No cities are open for onboarding yet"
            />
          </div>

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
          <h1 className="text-2xl font-extrabold tracking-tight">Where do riders collect?</h1>
          <p className="text-muted mt-1 text-sm">
            This becomes your primary branch. A guest never sees it until you are live.
          </p>

          <div className="mt-6">
            <Input
              id="address"
              label="Street address"
              placeholder="Building, street, area"
              leadingIcon={<MapPin className="h-4 w-4" />}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              required
            />
          </div>

          <Card tone="muted" className="mt-4 flex items-start gap-3">
            <Info className="text-gold-text mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="text-muted text-xs leading-relaxed">
              The map pin comes with the Google Maps key, which is still being set up. For now the
              address text is enough — the merchant team confirms the exact pin on the call.
            </p>
          </Card>

          <div
            aria-hidden="true"
            className="border-border-strong bg-bg text-muted-light mt-4 flex h-44 items-center justify-center rounded-xl border border-dashed text-xs uppercase tracking-widest"
          >
            [Map pin — Phase 1]
          </div>

          <div className="mt-6 flex gap-2">
            <Button variant="outline" size="lg" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button block size="lg" disabled={!address.trim()} onClick={() => setStep(3)}>
              Continue
            </Button>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------- step three */}
      {step === 3 && (
        <section className="mt-8">
          <h1 className="text-2xl font-extrabold tracking-tight">Your documents</h1>
          <p className="text-muted mt-1 text-sm">
            {applicable.length} documents for a{' '}
            {MERCHANT_CATEGORIES.find((c) => c.value === category)?.label.toLowerCase()} business.
            Category-specific licences appear automatically.
          </p>

          <Card tone="muted" className="mt-5 flex items-start gap-3">
            <Info className="text-gold-text mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="text-muted text-xs leading-relaxed">
              Uploading needs the verification link we send to your email. Your registration is
              already saved — the merchant team will send it when they call.
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
            <Button variant="outline" size="lg" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button block size="lg" onClick={() => setStep(4)}>
              Done for now
            </Button>
          </div>
        </section>
      )}

      {/* -------------------------------------------------------- step four */}
      {step === 4 && (
        <section className="mt-8">
          <EmptyState
            icon={<CheckCircle2 className="h-5 w-5" />}
            title="We get in touch within two working days"
            description="A member of the merchant team will call to confirm your details, check your permit, and walk you through the dashboard."
            action={{ label: 'Back to merchants', href: '/merchants' }}
          />

          <Card className="mt-5">
            <h2 className="text-sm font-bold">What happens next</h2>
            <ol className="text-muted mt-3 space-y-2 text-sm">
              <li>1. We verify your permit and licences.</li>
              <li>2. You build your catalogue — or send a PDF and we load it.</li>
              <li>3. You switch on &quot;Accepting orders&quot; and go live.</li>
            </ol>
            <p className="text-muted-light mt-4 text-xs">
              Your store is not public until every document is verified and you go live.{' '}
              <Link href="/help" className="font-bold underline underline-offset-4">
                Talk to the merchant team
              </Link>
              .
            </p>
          </Card>
        </section>
      )}
    </div>
  );
}
