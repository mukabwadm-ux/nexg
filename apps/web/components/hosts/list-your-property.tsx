'use client';

import { Input, PhoneInput, Select, useToast } from '@nexg/ui';
import {
  ArrowRight,
  BarChart3,
  Building,
  Building2,
  Check,
  ChevronRight,
  FileText,
  Headset,
  Home,
  ImagePlus,
  MapPin,
  RefreshCw,
  ShieldCheck,
  CircleCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';
import * as React from 'react';

import { applyAsHost, type HostPropertyType } from '@/app/(customer)/hosts/actions';
import {
  CODE_PATTERN,
  EMAIL_PATTERN,
  HostEmailError,
  sendHostEmailCode,
  verifyHostEmailCode,
} from '@/lib/host-email';
import { createClient } from '@/lib/supabase/client';
import nairobi from '@/public/images/cities/nairobi.jpg';
import sunset from '@/public/images/hero/stay-sunset.jpg';
import bedroom from '@/public/images/stays/bedroom-white.jpg';
import lounge from '@/public/images/stays/lounge-window.jpg';
import terrace from '@/public/images/stays/terrace-deck.jpg';

import { HostWelcome, useHostWelcome } from './host-welcome';

/**
 * The top of /hosts, from the owner's "List Your Property" mockup: the dark
 * hero, the form card floating over it, and "What can you list on NEXG?"
 * with the three steps. One client component because the property-type
 * cards and the form's Property Type share one value.
 *
 * The card is the same application as the long form further down: the email
 * is verified with a code (it becomes the host's login), then `applyAsHost`
 * runs `rpc_host_apply`, which creates the host, its first unit and the desk
 * ticket staff work from.
 */

const PROPERTY_TYPES: readonly {
  value: HostPropertyType;
  label: string;
  sub?: string;
  icon: LucideIcon;
  photo: StaticImageData;
}[] = [
  { value: 'vacation_home', label: 'Airbnb / Vacation Homes', icon: Home, photo: terrace },
  {
    value: 'apartment',
    label: 'Apartments',
    sub: '(Serviced or Private)',
    icon: Building2,
    photo: lounge,
  },
  { value: 'hotel', label: 'Hotels & Boutique Stays', icon: Building, photo: bedroom },
  {
    value: 'portfolio',
    label: 'Property Management Portfolios',
    icon: Building2,
    photo: nairobi,
  },
];

const TYPE_OPTIONS = PROPERTY_TYPES.map((t) => ({
  value: t.value,
  label: t.sub ? `${t.label} ${t.sub}` : t.label,
}));

/* The same bands the long form and rpc_host_apply use. */
const UNIT_BANDS = [
  { value: '1', label: '1' },
  { value: '2_5', label: '2–5' },
  { value: '6_20', label: '6–20' },
  { value: '20_plus', label: '20+' },
];

const BENEFITS: readonly { icon: LucideIcon; label: string }[] = [
  { icon: BarChart3, label: 'Increase occupancy & revenue' },
  { icon: Users, label: 'Access a global base of quality guests' },
  { icon: ShieldCheck, label: 'Secure & reliable payments' },
  { icon: Headset, label: 'Dedicated partner support' },
];

const STEPS: readonly { icon: LucideIcon; label: string }[] = [
  { icon: FileText, label: 'Tell us about your property' },
  { icon: ImagePlus, label: 'Add details & photos' },
  { icon: CircleCheck, label: 'Go live on NEXG Stay' },
];

const GOLD_BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-[linear-gradient(180deg,#F2D27A_0%,#E0B95A_100%)] font-bold text-black shadow-[0_8px_20px_rgba(224,185,90,0.25)] transition-[filter,transform] hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#F2C94C] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none';

export function ListYourProperty() {
  const [type, setType] = React.useState<HostPropertyType | ''>('');
  const nameRef = React.useRef<HTMLInputElement>(null);

  function goToForm() {
    const card = document.getElementById('list');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    card?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    nameRef.current?.focus({ preventScroll: true });
  }

  return (
    <div className="relative">
      {/* ─────────────────────────────────────────────── hero */}
      <section aria-labelledby="hosts-hero-title" className="relative isolate overflow-hidden">
        <Image
          src={sunset}
          alt=""
          fill
          priority
          placeholder="blur"
          sizes="100vw"
          className="-z-20 object-cover object-[70%_center]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(10,9,8,0.94)_0%,rgba(10,9,8,0.82)_40%,rgba(10,9,8,0.45)_70%,rgba(10,9,8,0.35)_100%)]"
        />
        <div className="mx-auto max-w-[120rem] px-4 pb-12 pt-14 sm:px-[30px] lg:pb-14 lg:pr-[470px] lg:pt-20 xl:pr-[500px]">
          <p className="text-[0.8125rem] font-bold uppercase tracking-[0.12em] text-[#E8C46A]">
            NEXG Stay Partners
          </p>
          <h1
            id="hosts-hero-title"
            className="mt-4 max-w-[40rem] text-[2.5rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-white sm:text-[3.25rem] xl:text-[3.75rem]"
          >
            List Your Property on <span className="text-[#E8C46A]">NEXG</span>
          </h1>
          <p className="mt-5 max-w-[34rem] text-[1.0625rem] font-medium leading-[1.6] text-white/85">
            Turn your space into consistent income. Join NexG Stay and get your property in front of
            modern travelers, corporate guests and long-term guests worldwide.
          </p>
          <button
            type="button"
            onClick={goToForm}
            className={`${GOLD_BUTTON} mt-8 px-7 py-4 text-base`}
          >
            List My Property <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </button>

          <ul className="mt-12 grid grid-cols-2 gap-y-6 sm:grid-cols-4 sm:gap-y-0">
            {BENEFITS.map(({ icon: Icon, label }, i) => (
              <li
                key={label}
                className={`flex items-center gap-3 pr-4 sm:px-4 ${i === 0 ? 'sm:pl-0' : ''} ${
                  i > 0 ? 'sm:border-l sm:border-white/20' : ''
                }`}
              >
                <Icon
                  className="h-8 w-8 shrink-0 text-[#E8C46A]"
                  strokeWidth={1.4}
                  aria-hidden="true"
                />
                <span className="text-[0.8125rem] font-medium leading-snug text-white/90">
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ───────────────────────────────────────── form card */}
      {/* In the flow on a phone (under the hero); floated over the hero and
          the next section from lg up. */}
      <div className="px-4 py-8 sm:px-[30px] lg:pointer-events-none lg:absolute lg:inset-x-0 lg:top-0 lg:z-10 lg:p-0">
        <div className="mx-auto max-w-[120rem] lg:flex lg:justify-end lg:px-[30px] lg:pt-12">
          <div className="lg:pointer-events-auto lg:w-[420px] xl:w-[440px]">
            <ListPropertyForm type={type} onTypeChange={setType} nameRef={nameRef} />
          </div>
        </div>
      </div>

      {/* ───────────────────────────── what can you list + steps */}
      <section aria-labelledby="what-to-list-title" className="band-surface">
        <div className="mx-auto max-w-[120rem] px-4 pb-14 pt-4 sm:px-[30px] lg:pr-[470px] lg:pt-10 xl:pr-[500px]">
          <h2
            id="what-to-list-title"
            className="text-ink text-[1.625rem] font-extrabold tracking-[-0.01em] sm:text-[1.875rem]"
          >
            What can you list on NEXG?
          </h2>
          <p id="what-to-list-hint" className="sr-only">
            Choosing one fills in Property Type on the form.
          </p>
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {PROPERTY_TYPES.map((t) => {
              const Icon = t.icon;
              const selected = type === t.value;
              return (
                <li key={t.value}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-describedby="what-to-list-hint"
                    onClick={() => setType(t.value)}
                    className={`group relative flex h-full w-full flex-col rounded-xl border bg-white p-3 text-left transition-[border-color,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B8901F] ${
                      selected
                        ? 'border-[#D4A84B] shadow-[0_0_0_1px_#D4A84B,0_10px_24px_rgba(180,140,40,0.15)]'
                        : 'border-[#E7E2D6] hover:border-[#CFC6B0]'
                    }`}
                  >
                    {selected ? (
                      <span
                        aria-hidden="true"
                        className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-[#C99A3E] text-white"
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    ) : null}
                    <Icon className="h-7 w-7 text-[#141414]" strokeWidth={1.5} aria-hidden="true" />
                    <span className="mb-3 mt-2 block min-h-[2.75rem] pr-6 text-[0.9375rem] font-bold leading-tight text-[#141414]">
                      {t.label}
                      {t.sub ? (
                        <span className="block text-[0.8125rem] font-medium text-[#4A4436]">
                          {t.sub}
                        </span>
                      ) : null}
                    </span>
                    <span className="relative mt-auto block aspect-[16/10] overflow-hidden rounded-lg">
                      <Image
                        src={t.photo}
                        alt=""
                        fill
                        placeholder="blur"
                        sizes="(min-width: 1280px) 220px, 45vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transform-none"
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-8 rounded-2xl bg-[#F7F1E6] px-5 py-6 sm:px-8 lg:flex lg:items-center lg:gap-8">
            <h3 className="text-ink text-[1.375rem] font-extrabold leading-tight sm:text-[1.5rem] lg:w-44 lg:shrink-0">
              Get listed in 3 simple steps
            </h3>
            <ol className="mt-5 grid gap-4 sm:flex sm:items-center sm:justify-between sm:gap-2 lg:mt-0 lg:flex-1">
              {STEPS.map(({ icon: Icon, label }, i) => (
                <React.Fragment key={label}>
                  {i > 0 ? (
                    <li aria-hidden="true" className="hidden sm:block">
                      <ChevronRight className="h-5 w-5 text-[#141414]" />
                    </li>
                  ) : null}
                  <li className="flex items-center gap-3 sm:flex-1 sm:flex-col sm:gap-2 sm:text-center">
                    <Icon
                      className="h-8 w-8 shrink-0 text-[#141414]"
                      strokeWidth={1.4}
                      aria-hidden="true"
                    />
                    <span className="text-[0.875rem] font-semibold leading-snug text-[#141414]">
                      {i + 1}. {label}
                    </span>
                  </li>
                </React.Fragment>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}

const errorText = (error: unknown, fallback: string) =>
  error instanceof HostEmailError ? error.message : fallback;

type Stage =
  | { kind: 'details' }
  | { kind: 'code'; userId: string; email: string }
  | { kind: 'checking'; userId: string; email: string };

function ListPropertyForm({
  type,
  onTypeChange,
  nameRef,
}: {
  type: HostPropertyType | '';
  onTypeChange: (value: HostPropertyType) => void;
  nameRef: React.RefObject<HTMLInputElement>;
}) {
  const { toast } = useToast();
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState<string | null>(null);
  const [location, setLocation] = React.useState('');
  const [band, setBand] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [stage, setStage] = React.useState<Stage>({ kind: 'details' });
  const [code, setCode] = React.useState('');
  const [codeMessage, setCodeMessage] = React.useState('');
  const [sentAt, setSentAt] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const { done, start: sendWelcome } = useHostWelcome();
  const codeRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (stage.kind === 'code') codeRef.current?.focus();
  }, [stage.kind]);

  async function apply(loginEmail: string, codeSentAt: number) {
    const result = await applyAsHost({
      contact_name: name.trim(),
      display_name: name.trim(),
      phone: phone!,
      listing_link: null,
      address: location.trim(),
      units_band: band || '1',
      property_type: type || null,
    });
    if (!result.ok) {
      toast({ title: 'That did not save', description: result.message });
      setStage({ kind: 'details' });
      return;
    }
    void sendWelcome(
      {
        email: loginEmail,
        welcome: 'sending',
        ...(result.ticketReference ? { reference: result.ticketReference } : {}),
      },
      codeSentAt,
    );
  }

  async function submitDetails(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next['name'] = 'Enter your full name.';
    if (!EMAIL_PATTERN.test(email.trim())) next['email'] = 'Enter a valid email address.';
    if (!phone) next['phone'] = 'Enter a valid phone number.';
    if (!type) next['type'] = 'Choose a property type.';
    if (!location.trim()) next['location'] = 'Where is the property?';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      const clean = email.trim().toLowerCase();
      const sent = await sendHostEmailCode(createClient().auth, clean);
      if (sent.verified) {
        await apply(clean, 0);
        return;
      }
      setSentAt(Date.now());
      setCode('');
      setCodeMessage('');
      setStage({ kind: 'code', userId: sent.userId, email: clean });
    } catch (error) {
      setErrors({ email: errorText(error, 'We could not send a code. Try again.') });
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    if (stage.kind !== 'code') return;
    if (!CODE_PATTERN.test(code)) {
      setCodeMessage('Enter the 6- or 8-digit code from the email.');
      return;
    }
    const { userId, email: clean } = stage;
    setStage({ kind: 'checking', userId, email: clean });
    setCodeMessage('');
    try {
      await verifyHostEmailCode(createClient().auth, userId, clean, code);
    } catch (error) {
      setStage({ kind: 'code', userId, email: clean });
      setCodeMessage(errorText(error, 'That code did not work. Send a new one.'));
      return;
    }
    await apply(clean, sentAt);
  }

  async function resend() {
    if (stage.kind !== 'code') return;
    setCodeMessage('');
    try {
      const sent = await sendHostEmailCode(createClient().auth, stage.email);
      setSentAt(Date.now());
      setStage({ kind: 'code', userId: sent.userId, email: stage.email });
      setCodeMessage('We sent a new code.');
    } catch (error) {
      setCodeMessage(errorText(error, 'We could not send a code. Try again in a minute.'));
    }
  }

  const card =
    'scroll-mt-24 rounded-2xl bg-white p-6 shadow-[0_24px_60px_rgba(0,0,0,0.28)] ring-1 ring-black/5 sm:p-7';

  if (done) {
    return (
      <div id="list" className={card}>
        <HostWelcome done={done} className="" />
      </div>
    );
  }

  if (stage.kind !== 'details') {
    return (
      <form id="list" onSubmit={submitCode} className={card} noValidate>
        <h2 className="text-[1.5rem] font-extrabold leading-tight tracking-[-0.01em] text-[#141414]">
          Check your email
        </h2>
        <p className="mt-2 text-[0.9375rem] font-medium leading-relaxed text-[#4A4436]">
          We sent a code to <strong className="text-[#141414]">{stage.email}</strong>. Enter it to
          confirm your email. It becomes your host login.
        </p>
        <div className="mt-5">
          <Input
            ref={codeRef}
            id="list_code"
            label="Code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={8}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            {...(codeMessage ? { error: codeMessage } : {})}
          />
        </div>
        <button
          type="submit"
          disabled={stage.kind === 'checking'}
          className={`${GOLD_BUTTON} mt-5 h-12 w-full text-[1rem]`}
        >
          {stage.kind === 'checking' ? 'Creating your account…' : 'Confirm & create my account'}
        </button>
        <div className="mt-4 flex flex-wrap justify-between gap-3 text-[0.8125rem] font-bold text-[#4A4436]">
          <button
            type="button"
            onClick={() => void resend()}
            className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Send a new code
          </button>
          <button
            type="button"
            onClick={() => setStage({ kind: 'details' })}
            className="underline-offset-4 hover:underline"
          >
            Change my details
          </button>
        </div>
      </form>
    );
  }

  return (
    <form id="list" onSubmit={submitDetails} className={card} noValidate>
      <h2 className="text-[1.625rem] font-extrabold leading-tight tracking-[-0.01em] text-[#141414]">
        List Your Property
      </h2>
      <p className="mt-1 text-[0.9375rem] font-medium text-[#4A4436]">
        Get started in just a few steps.
      </p>

      <div className="mt-5 space-y-4">
        <Input
          ref={nameRef}
          id="list_name"
          label="Full Name"
          required
          placeholder="Enter your name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          {...(errors['name'] ? { error: errors['name'] } : {})}
        />
        <Input
          id="list_email"
          type="email"
          label="Email Address"
          required
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          {...(errors['email'] ? { error: errors['email'] } : {})}
        />
        <PhoneInput
          id="list_phone"
          label="Phone Number"
          required
          value={phone}
          onChange={setPhone}
          {...(errors['phone'] ? { error: errors['phone'] } : {})}
        />
        <Select
          id="list_type"
          label="Property Type"
          required
          placeholder="Select property type"
          options={TYPE_OPTIONS}
          {...(type ? { value: type } : {})}
          onValueChange={(value) => onTypeChange(value as HostPropertyType)}
          {...(errors['type'] ? { error: errors['type'] } : {})}
        />
        <Input
          id="list_location"
          label="Property Location"
          required
          placeholder="Area and city, e.g. Kilimani, Nairobi"
          autoComplete="street-address"
          leadingIcon={<MapPin className="h-4 w-4" aria-hidden="true" />}
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          {...(errors['location'] ? { error: errors['location'] } : {})}
        />
        <Select
          id="list_count"
          label="Number of Properties"
          placeholder="Select"
          options={UNIT_BANDS}
          {...(band ? { value: band } : {})}
          onValueChange={setBand}
        />
      </div>

      <button
        type="submit"
        disabled={busy}
        className={`${GOLD_BUTTON} mt-6 h-12 w-full text-[1rem]`}
      >
        {busy ? 'Sending your code…' : 'Submit & Get Started'}
      </button>
      <p className="mt-3 text-[0.75rem] font-medium leading-relaxed text-[#5B5548]">
        By continuing, you agree to NexG&rsquo;s{' '}
        <Link
          href="/legal#legal-group-partners"
          className="font-bold text-[#141414] underline underline-offset-2"
        >
          Partner Terms
        </Link>{' '}
        and{' '}
        <Link
          href="/legal/privacy"
          className="font-bold text-[#141414] underline underline-offset-2"
        >
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}
