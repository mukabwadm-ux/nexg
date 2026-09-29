'use client';

import { Button, Input, PhoneInput, useToast } from '@nexg/ui';
import { Check, Clock, Link2, MessageCircle, Pencil, Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { prefillFromUrl, type PrefillResult } from '@/app/merchants/apply/actions';
import { createClient } from '@/lib/supabase/client';
import { ensureApplicantSession } from '@/lib/uploads';

import { Chip, OptionTile } from './controls';
import { ContinueButton, FooterNote, OnboardingShell } from './shell';
import { useOnboarding } from './store';
import { pathForStep, type Draft } from './types';

/**
 * Step 1 — where the draft is created.
 *
 * Two ways in. Pasting a link is faster when there is one to paste; typing
 * three things is faster than arguing with a link that does not resolve.
 * Either way the step ends the same: a merchant row, owned by this session,
 * with a phone number we have checked.
 */
export function StartStep({
  prefill,
}: {
  prefill?: { tradingName: string; contactName: string; phone: string | null; email: string };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { draft, setDraft, patch } = useOnboarding();

  /* Arriving with details already typed on the marketing page means the
     merchant has chosen "from scratch" without being asked. */
  const [method, setMethod] = React.useState<'link' | 'scratch' | null>(
    draft
      ? (draft.onboarding_source as 'link' | 'scratch' | null)
      : prefill?.tradingName
        ? 'scratch'
        : null,
  );

  const [url, setUrl] = React.useState('');
  const [found, setFound] = React.useState<PrefillResult | null>(null);
  const [fetching, setFetching] = React.useState(false);

  const [tradingName, setTradingName] = React.useState(
    draft?.trading_name ?? prefill?.tradingName ?? '',
  );
  const [contactName, setContactName] = React.useState(
    draft?.contact_name ?? prefill?.contactName ?? '',
  );
  const [phone, setPhone] = React.useState<string | null>(
    draft?.contact_phone ?? prefill?.phone ?? null,
  );
  const [email, setEmail] = React.useState(draft?.contact_email ?? prefill?.email ?? '');
  const [emailChoice, setEmailChoice] = React.useState<'add' | 'whatsapp' | 'skip' | null>(
    draft?.contact_email || prefill?.email ? 'add' : null,
  );

  const [starting, setStarting] = React.useState(false);
  const [code, setCode] = React.useState('');
  const [devCode, setDevCode] = React.useState<string | null>(null);
  const [verified, setVerified] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);

  const fetchLink = async () => {
    setFetching(true);
    const result = await prefillFromUrl(url);
    setFetching(false);
    setFound(result);
    if (!result.ok) {
      toast({ title: 'We could not read that link', description: result.message, tone: 'danger' });
    }
  };

  /** Creates the draft and asks for a code. Both paths land here. */
  const start = async (source: 'link' | 'scratch') => {
    if (!tradingName.trim()) {
      toast({ title: 'We need a name', description: 'What should guests see?', tone: 'danger' });
      return;
    }
    if (!phone) {
      toast({
        title: 'We need a phone number',
        description: 'This is how riders and the merchant team reach you.',
        tone: 'danger',
      });
      return;
    }

    setStarting(true);

    /*
     * Identity before anything else: the draft has an owner from the moment
     * it exists, which is what makes every later step safe to save without
     * asking who is asking.
     */
    const session = await ensureApplicantSession();
    if (!session) {
      setStarting(false);
      toast({
        title: 'We could not start a secure session',
        description: 'Check your connection and try again.',
        tone: 'danger',
      });
      return;
    }

    const supabase = createClient();
    const { data: merchantId, error } = await supabase.rpc('rpc_merchant_start', {
      p_trading_name: tradingName,
      p_contact_name: contactName,
      p_contact_phone: phone,
      p_contact_email: email || undefined,
      p_source: source,
      p_source_url: source === 'link' ? url : undefined,
    });

    if (error || !merchantId) {
      setStarting(false);
      toast({
        title: 'We could not save that',
        description: error?.message ?? 'Try again.',
        tone: 'danger',
      });
      return;
    }

    const { data: row } = await supabase
      .from('merchant')
      .select('*')
      .eq('id', merchantId as string)
      .maybeSingle();
    if (row) setDraft(row as Draft);

    const { data: sent } = await supabase.rpc('rpc_merchant_request_phone_code', {
      p_merchant_id: merchantId as string,
    });
    setStarting(false);

    const result = sent as { verified?: boolean; delivered?: boolean; code?: string } | null;
    if (result?.verified) {
      setVerified(true);
      return;
    }
    setDevCode(result?.code ?? null);
  };

  const verify = async () => {
    if (!draft) return;
    setVerifying(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('rpc_merchant_verify_phone_code', {
      p_merchant_id: draft.id,
      p_code: code,
    });
    setVerifying(false);

    if (error) {
      toast({ title: 'That did not work', description: error.message, tone: 'danger' });
      return;
    }

    /*
     * Proving the number can hand back a different id: an application this
     * merchant started on another device, which verification has just made
     * it safe to give them. Pick it up where they left it rather than making
     * them do the first four steps again.
     */
    const result = data as { merchant_id: string; resumed_step?: number } | null;
    if (result?.merchant_id && result.merchant_id !== draft.id) {
      const { data: row } = await supabase
        .from('merchant')
        .select('*')
        .eq('id', result.merchant_id)
        .maybeSingle();
      if (row) setDraft(row as unknown as Draft);

      toast({
        title: 'We found your earlier registration',
        description: 'Everything you saved on your other device is still here.',
        tone: 'success',
      });
      setVerified(true);
      if (result.resumed_step && result.resumed_step > 2) {
        router.push(pathForStep(result.resumed_step));
      }
      return;
    }

    setVerified(true);
  };

  const started = !!draft;
  const canContinue = started && verified;

  return (
    <OnboardingShell
      step={1}
      eyebrow="Welcome to NexG"
      title="Let’s get your business in front of guests."
      intro={
        method === 'scratch'
          ? 'No listing to paste? No problem. Give us a name and a phone number and we build everything else together, one tap at a time.'
          : 'Pick the quickest way to start. Whatever you choose, most merchants finish in under ten minutes and can keep editing later from the dashboard.'
      }
      footer={
        <>
          <ContinueButton
            disabled={!canContinue}
            onClick={() => {
              patch({}, 2);
              router.push('/merchants/apply/category');
            }}
          >
            {method === 'link' ? 'Use these details' : 'Start · what do you sell?'}
          </ContinueButton>
          <FooterNote>
            {method === 'link'
              ? 'You can switch method any time'
              : 'The name is all that shows on your card for now'}
          </FooterNote>
        </>
      }
    >
      {/* ------------------------------------------------------ the two tiles */}
      <div className="grid gap-5 sm:grid-cols-2">
        <OptionTile
          icon={<Link2 className="h-5 w-5" />}
          badge="Fastest · ~3 min"
          title="Paste a link"
          description="Your Google Maps, Instagram or Jumia Food page. We pull your name, photos, hours and menu — you just confirm."
          selected={method === 'link'}
          onClick={() => setMethod('link')}
        />
        <OptionTile
          icon={<Pencil className="h-5 w-5" />}
          badge="~8 min"
          title="Start from scratch"
          description="Answer a few taps at a time. No long forms — we only ask what applies to you."
          selected={method === 'scratch'}
          onClick={() => setMethod('scratch')}
        />
      </div>

      {/* --------------------------------------------------------- link panel */}
      {method === 'link' && (
        <div className="border-border-strong bg-surface animate-in fade-in zoom-in-95 mt-5 rounded-2xl border p-6 duration-200">
          <p className="text-[0.9375rem] font-extrabold">Paste your link</p>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <Input
              id="source_url"
              label="Link"
              labelHidden
              placeholder="maps.app.goo.gl/[your-place]"
              leadingIcon={<Link2 className="h-4 w-4" />}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              containerClassName="flex-1"
            />
            <Button
              variant="gold"
              loading={fetching}
              loadingText="Reading…"
              disabled={!url.trim()}
              onClick={() => void fetchLink()}
            >
              Fetch my details
            </Button>
          </div>

          {found?.ok && (
            <div className="border-success/30 bg-success-bg mt-4 flex flex-wrap items-center gap-3 rounded-xl border p-3">
              <Check className="text-success h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="text-success min-w-0 flex-1 text-[0.8125rem] font-bold leading-[1.6]">
                Found <strong>{found.name}</strong>
                {found.area ? ` · ${found.area}` : ''}
                {found.rating ? ` · ${found.rating} ★` : ''}
                {found.photoCount ? ` · ${found.photoCount} photos` : ''}
                {found.openNow ? ' · open now' : ''} — is this you?
              </p>
              <div className="flex shrink-0 gap-2">
                <Chip
                  selected
                  onClick={() => {
                    setTradingName(found.name ?? '');
                    setMethod('link');
                  }}
                >
                  Yes, that is me
                </Chip>
                <Chip selected={false} onClick={() => setFound(null)}>
                  No, search again
                </Chip>
              </div>
            </div>
          )}

          {tradingName && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Input
                id="link_trading_name"
                label="Business name — as guests should see it"
                value={tradingName}
                onChange={(event) => setTradingName(event.target.value)}
              />
              <Input
                id="link_contact_name"
                label="Your name"
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
              />
              <PhoneInput id="link_phone" label="Phone" value={phone} onChange={setPhone} />
              {!started && (
                <div className="flex items-end">
                  <Button
                    block
                    loading={starting}
                    loadingText="Saving…"
                    onClick={() => void start('link')}
                  >
                    Send me a code
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------ scratch panel */}
      {method === 'scratch' && (
        <div className="border-border-strong bg-surface animate-in fade-in zoom-in-95 mt-5 rounded-2xl border p-6 duration-200">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[0.9375rem] font-extrabold">Three things, then we start tapping</p>
            <p className="text-muted-light text-xs font-semibold">
              No documents yet · no passwords ever
            </p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input
              id="trading_name"
              label="Business name — as guests should see it"
              value={tradingName}
              onChange={(event) => setTradingName(event.target.value)}
              required
            />
            <Input
              id="contact_name"
              label="Your name"
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              required
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <PhoneInput
              id="contact_phone"
              label="Phone — we text a code, no password to remember"
              value={phone}
              onChange={setPhone}
              disabled={started}
              required
            />

            {started && !verified && (
              <CodeEntry
                code={code}
                onChange={setCode}
                onVerify={() => void verify()}
                verifying={verifying}
                onResend={() => void start('scratch')}
              />
            )}
          </div>

          {!started && (
            <Button
              className="mt-4"
              loading={starting}
              loadingText="Saving…"
              disabled={!tradingName.trim() || !contactName.trim() || !phone}
              onClick={() => void start('scratch')}
            >
              Send me a code
            </Button>
          )}

          {devCode && !verified && (
            <p className="border-warning/40 bg-warning-bg text-warning mt-4 rounded-xl border p-3 text-xs font-bold leading-[1.7]">
              SMS is not connected on this environment, so we cannot text you. Your code is{' '}
              <strong className="font-mono text-sm tracking-widest">{devCode}</strong>. Once an SMS
              sender is configured this code only ever exists in the message.
            </p>
          )}

          <div className="mt-5">
            <p className="text-[0.8125rem] font-bold">
              Email — for your weekly statement (optional now)
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip selected={emailChoice === 'add'} onClick={() => setEmailChoice('add')}>
                Add an email
              </Chip>
              <Chip
                selected={emailChoice === 'whatsapp'}
                onClick={() => {
                  setEmailChoice('whatsapp');
                  setEmail('');
                  if (started) patch({ contact_email: null });
                }}
              >
                <span className="flex items-center gap-2">
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Use WhatsApp for everything
                </span>
              </Chip>
              <Chip
                selected={emailChoice === 'skip'}
                onClick={() => {
                  setEmailChoice('skip');
                  setEmail('');
                  if (started) patch({ contact_email: null });
                }}
              >
                Skip for now
              </Chip>
            </div>

            {emailChoice === 'add' && (
              <div className="mt-3 max-w-sm">
                <Input
                  id="contact_email"
                  type="email"
                  label="Email"
                  labelHidden
                  placeholder="you@yourbusiness.co.ke"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onBlur={() => started && patch({ contact_email: email || null })}
                />
              </div>
            )}
          </div>

          {verified && (
            <p className="border-success/30 bg-success-bg text-success mt-5 flex items-center gap-2 rounded-xl border p-3 text-[0.8125rem] font-bold">
              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
              Phone verified. Your progress saves automatically from here — close the tab any time
              and come back.
            </p>
          )}
        </div>
      )}

      {/* ----------------------------------------------------- reassurance row */}
      <ul className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { icon: Shield, text: 'Nothing goes public until our team verifies you' },
          {
            icon: Clock,
            text:
              method === 'scratch'
                ? 'About 8 minutes · 6 short steps'
                : 'Stop any time — we save as you go',
          },
          { icon: MessageCircle, text: 'Finish on WhatsApp if that is easier' },
        ].map((item) => (
          <li key={item.text} className="flex items-start gap-2.5">
            <item.icon className="text-gold-text mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="text-muted text-[0.8125rem] font-semibold leading-[1.6]">
              {item.text}
            </span>
          </li>
        ))}
      </ul>
    </OnboardingShell>
  );
}

/** Six boxes, one code. Pasting the whole thing fills them all. */
function CodeEntry({
  code,
  onChange,
  onVerify,
  verifying,
  onResend,
}: {
  code: string;
  onChange: (next: string) => void;
  onVerify: () => void;
  verifying: boolean;
  onResend: () => void;
}) {
  const digits = code.padEnd(6, ' ').slice(0, 6).split('');

  React.useEffect(() => {
    if (code.length === 6) onVerify();
    // Verifying as soon as the sixth digit lands: nobody wants to press a
    // button after typing a code they were just given.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor="otp" className="text-[0.8125rem] font-bold">
          Code sent by SMS
        </label>
        <button
          type="button"
          onClick={onResend}
          className="text-gold-text text-xs font-bold underline underline-offset-4"
        >
          resend
        </button>
      </div>

      <div className="relative mt-2">
        <input
          id="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          disabled={verifying}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
          className="absolute inset-0 h-full w-full cursor-pointer text-transparent caret-transparent opacity-0"
          aria-label="Six digit code"
        />
        <div aria-hidden="true" className="pointer-events-none flex gap-2">
          {digits.map((digit, index) => (
            <span
              key={index}
              className={`border-border-strong bg-surface flex h-12 w-full max-w-[3rem] items-center justify-center rounded-xl border text-lg font-extrabold ${
                index === code.length ? 'border-ink' : ''
              }`}
            >
              {digit.trim()}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
