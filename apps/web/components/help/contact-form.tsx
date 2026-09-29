'use client';

import { Button, Card, Input, Select } from '@nexg/ui';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import * as React from 'react';

import { submitTicket } from '@/app/help/actions';

type Role = 'guest' | 'rider' | 'merchant' | 'hotel';

const ROLES: { value: Role; label: string }[] = [
  { value: 'guest', label: 'I’m a guest' },
  { value: 'rider', label: 'Rider' },
  { value: 'merchant', label: 'Merchant' },
  { value: 'hotel', label: 'Hotel' },
];

/** What each kind of person is likely to be writing about. */
const TOPICS: Record<Role, { value: string; label: string }[]> = {
  guest: [
    { value: 'order_problem', label: 'Problem with an order' },
    { value: 'payment_or_refund', label: 'Payment or refund' },
    { value: 'concierge_request', label: 'A concierge request' },
    { value: 'account', label: 'My account or privacy' },
    { value: 'something_else', label: 'Something else' },
  ],
  rider: [
    { value: 'partner_rider', label: 'My application or account' },
    { value: 'payment_or_refund', label: 'Payouts and earnings' },
    { value: 'order_problem', label: 'A problem on a delivery' },
    { value: 'something_else', label: 'Something else' },
  ],
  merchant: [
    { value: 'partner_merchant', label: 'My registration or listing' },
    { value: 'payment_or_refund', label: 'Settlement and payouts' },
    { value: 'order_problem', label: 'A problem with an order' },
    { value: 'something_else', label: 'Something else' },
  ],
  hotel: [
    { value: 'hotel_partnership', label: 'Working with NexG' },
    { value: 'order_problem', label: 'A guest’s order' },
    { value: 'something_else', label: 'Something else' },
  ],
};

/**
 * "Send us a message" from the Help artboard.
 *
 * Every submission becomes a ticket the concierge desk sees. The artboard
 * also offers a photo attachment; that is not here yet, because a public
 * upload with no session needs its own bucket and abuse story, and a broken
 * attach button is worse than none.
 */
export function ContactForm() {
  const [role, setRole] = React.useState<Role>('guest');
  const [topic, setTopic] = React.useState<string>('order_problem');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reference, setReference] = React.useState<string | null>(null);

  // The topics change with the role; keep the selection valid.
  React.useEffect(() => {
    const allowed = TOPICS[role];
    if (!allowed.some((t) => t.value === topic)) setTopic(allowed[0]!.value);
  }, [role, topic]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const value = (key: string) => {
      const raw = form.get(key);
      return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
    };

    /*
     * A server action, not a direct RPC: the acknowledgement email has to be
     * sent with a provider key that must never reach the browser.
     */
    const result = await submitTicket({
      body: String(form.get('body') ?? ''),
      fromRole: role,
      topic,
      ...(value('full_name') ? { fullName: value('full_name')! } : {}),
      ...(value('email') ? { email: value('email')! } : {}),
      ...(value('phone') ? { phone: value('phone')! } : {}),
      ...(value('order_reference') ? { orderReference: value('order_reference')! } : {}),
    });

    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setReference(result.reference ?? null);
  };

  if (reference) {
    return (
      <Card className="p-6">
        <span
          aria-hidden="true"
          className="bg-success-bg text-success flex h-10 w-10 items-center justify-center rounded-xl"
        >
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-xl font-extrabold tracking-tight">We have it.</h2>
        <p className="text-muted mt-2 text-[0.9375rem] leading-[1.7]">
          Your reference is <span className="text-ink font-extrabold">{reference}</span>. Quote it
          if you call. A person reads every message — no bots — and we reply on the contact you gave
          us.
        </p>
        <Button variant="outline" className="mt-5" onClick={() => setReference(null)}>
          Send another
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-extrabold tracking-tight">Send us a message</h2>
      <p className="text-muted-light mt-1.5 text-xs font-semibold leading-[1.7]">
        A person replies — no bots. Include your order reference if you have one and we’ll answer
        faster.
      </p>

      <form onSubmit={submit} className="mt-5">
        <fieldset>
          <legend className="sr-only">Who are you?</legend>
          <div className="bg-bg grid grid-cols-2 gap-1 rounded-xl p-1 sm:grid-cols-4">
            {ROLES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRole(option.value)}
                aria-pressed={role === option.value}
                className={`rounded-lg py-2 text-xs font-extrabold transition-colors ${
                  role === option.value ? 'bg-ink text-gold' : 'text-ink hover:text-muted'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-4">
          <Select
            id="topic"
            label="What’s this about?"
            value={topic}
            onValueChange={setTopic}
            options={TOPICS[role]}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input id="full_name" name="full_name" label="Your name" placeholder="Your name" />
          <Input
            id="order_reference"
            name="order_reference"
            label="Reference"
            placeholder="NX-… (optional)"
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            id="phone"
            name="phone"
            label="Phone"
            placeholder="+254 7XX XXX XXX"
            hint="Either a phone or an email."
          />
          <Input id="email" name="email" type="email" label="Email" placeholder="you@example.com" />
        </div>

        <label className="mt-4 block">
          <span className="text-ink mb-1.5 block text-sm font-bold">Tell us what happened</span>
          <textarea
            name="body"
            required
            rows={5}
            maxLength={4000}
            placeholder="What did you expect, and what happened instead?"
            className="border-border bg-surface focus-visible:ring-gold w-full rounded-xl border px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
        </label>

        {error && <p className="text-danger mt-3 text-xs font-bold">{error}</p>}

        <Button
          type="submit"
          block
          size="lg"
          className="h-13 mt-5 rounded-xl"
          loading={pending}
          loadingText="Sending…"
          trailingIcon={<ArrowRight className="text-gold h-4 w-4" />}
        >
          Send message
        </Button>

        <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.6]">
          We use these details only to answer you. See our{' '}
          <a href="/legal/privacy" className="text-ink font-bold underline underline-offset-2">
            Privacy Policy
          </a>
          .
        </p>
      </form>
    </Card>
  );
}
