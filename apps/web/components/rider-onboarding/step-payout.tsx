'use client';

import { Button, PhoneInput, useToast } from '@nexg/ui';
import { Check, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Chip } from '@/components/onboarding/controls';
import { ContinueButton } from '@/components/onboarding/shell-frame';
import { createClient } from '@/lib/supabase/client';

import { RiderShell } from './rider-shell';
import { useRiderOnboarding } from './store';
import type { SlotOption } from './types';

/**
 * Step 5 — where Friday's pay goes, and when they collect their kit.
 *
 * The three cards at the bottom are the ones riders actually ask about
 * before they sign up: who sees my number, what happens to cash I collect,
 * and am I on the hook for hours. Answering them here, in their words, is
 * worth more than anything else on this screen.
 */
export function RiderPayoutStep({ slots }: { slots: SlotOption[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const { draft, patch, refresh, flushNow } = useRiderOnboarding();

  const [useOwn, setUseOwn] = React.useState(
    !draft?.payout_msisdn || draft.payout_msisdn === draft.phone,
  );
  const [other, setOther] = React.useState<string | null>(
    draft?.payout_msisdn && draft.payout_msisdn !== draft.phone ? draft.payout_msisdn : null,
  );
  const [submitting, setSubmitting] = React.useState(false);

  const lookup = draft?.payout_name_lookup ?? null;

  /* "Same as my phone" is pre-selected, so it has to be written — a
     pre-selected option nobody stored is a lie the ring would repeat. */
  React.useEffect(() => {
    if (draft && useOwn && draft.payout_msisdn !== draft.phone) {
      patch({ payout_msisdn: draft.phone }, 5);
    }
  }, [draft, useOwn, patch]);

  const book = async (slotId: string) => {
    if (!draft) return;
    const supabase = createClient();
    const { error } = await supabase.rpc('rpc_book_slot', {
      p_rider_id: draft.id,
      p_slot_id: slotId,
    });
    if (error) {
      toast({ title: 'We could not book that', description: error.message, tone: 'danger' });
      return;
    }
    await refresh();
  };

  const submit = async () => {
    if (!draft) return;
    setSubmitting(true);
    await flushNow();
    const supabase = createClient();
    await supabase.rpc('rpc_rider_payout_name_check', { p_rider_id: draft.id });
    const { error } = await supabase.rpc('rpc_rider_submit', { p_rider_id: draft.id });
    setSubmitting(false);

    if (error) {
      toast({ title: 'Not quite ready', description: error.message, tone: 'danger' });
      return;
    }
    router.push('/riders/status');
  };

  return (
    <RiderShell
      step={5}
      eyebrow="Getting paid"
      title="Where should Friday’s pay go?"
      intro="Every delivery you complete is added to your balance. We pay the balance to M-Pesa every Friday with a breakdown per delivery."
      footer={
        <>
          <Button
            variant="outline"
            size="lg"
            onClick={() => router.push('/riders/apply/documents')}
          >
            Back
          </Button>
          <ContinueButton loading={submitting} loadingText="Sending…" onClick={() => void submit()}>
            I agree · submit for review
          </ContinueButton>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="border-border bg-surface rounded-2xl border p-5">
          <h3 className="text-[0.9375rem] font-extrabold">M-Pesa number for Friday payouts</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip
              selected={useOwn}
              onClick={() => {
                setUseOwn(true);
                if (draft) patch({ payout_msisdn: draft.phone }, 5);
              }}
            >
              Same as my phone · {mask(draft?.phone ?? '')}
            </Chip>
            <Chip selected={!useOwn} onClick={() => setUseOwn(false)}>
              A different number
            </Chip>
          </div>

          {!useOwn && (
            <div className="mt-4 max-w-xs">
              <PhoneInput
                id="payout_msisdn"
                label="M-Pesa number"
                value={other}
                onChange={(value) => {
                  setOther(value);
                  if (value) patch({ payout_msisdn: value }, 5);
                }}
              />
            </div>
          )}

          <p className="text-muted-light mt-4 text-xs font-semibold leading-[1.7]">
            The M-Pesa name must match your ID. We check it before your first payout.
          </p>
        </div>

        {/*
          The artboard shows a green "matches your national ID" here. Nothing
          can check that yet — no name-lookup provider is connected — and a
          green tick nothing verified would tell rider ops this was checked.
        */}
        <div className="border-warning/40 bg-warning-bg rounded-2xl border p-5">
          <p className="text-warning flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Registered name
          </p>
          <p className="text-warning mt-2 text-[0.875rem] font-bold leading-[1.7]">
            {lookup?.matched
              ? `${lookup.name} — matches your national ID`
              : 'We check this against your ID at the hub before your first payout.'}
          </p>
          <p className="text-warning mt-2 text-xs font-semibold leading-[1.7]">
            Payouts only go to a line in your own name, so nobody else can claim your money.
            Automatic name lookup is not connected yet, so a person does it.
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------- kit */}
      <div className="border-border bg-surface mt-4 rounded-2xl border p-5">
        <h3 className="text-[0.9375rem] font-extrabold">
          Pick up your kit and onboarding · 45 minutes
        </h3>
        {slots.length === 0 ? (
          <p className="text-muted mt-3 text-[0.875rem] font-semibold">
            No sessions are listed for your city yet. Rider ops will call you to arrange one.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {slots.map((slot) => (
              <Chip
                key={slot.id}
                selected={draft?.onboarding_slot_id === slot.id}
                disabled={slot.booked >= slot.capacity}
                onClick={() => void book(slot.id)}
              >
                {slotLabel(slot.starts_at)}
              </Chip>
            ))}
            <Chip selected={false} onClick={() => undefined}>
              Another time
            </Chip>
          </div>
        )}
        <p className="text-muted-light mt-4 text-xs font-semibold leading-[1.7]">
          {slots[0]?.hub_name ?? 'The hub'} · bring your phone and your bike. You leave with a bag,
          jacket and your first request unlocked.
        </p>
      </div>

      {/* --------------------------------------------------- three things */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {[
          {
            title: 'Your privacy',
            body: 'Guests see your first name, photo and plate — never your phone number. Calls go through a masked line.',
          },
          {
            title: 'Cash rules',
            body: 'Cash you collect is netted from Friday’s payout. Above the cap, cash orders pause until you clear at the paybill.',
          },
          {
            title: 'Your hours',
            body: 'You choose when to go online. No minimums, no penalties for logging off, no ranking games.',
          },
        ].map((item) => (
          <div key={item.title} className="border-border bg-surface rounded-2xl border p-5">
            <span
              aria-hidden="true"
              className="bg-gold text-ink flex h-7 w-7 items-center justify-center rounded-full"
            >
              <Check className="h-4 w-4" strokeWidth={3} />
            </span>
            <p className="mt-3 text-[0.9375rem] font-extrabold">{item.title}</p>
            <p className="text-muted mt-2 text-xs font-semibold leading-[1.7]">{item.body}</p>
          </div>
        ))}
      </div>
    </RiderShell>
  );
}

/** +254 7•• ••• •12 — enough to recognise, not enough to read out. */
function mask(phone: string): string {
  if (phone.length < 6) return phone;
  return `${phone.slice(0, 6)}•• ••• •${phone.slice(-2)}`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/*
 * Formatted by hand rather than with Intl. This renders on the server and
 * again in the browser, which do not always carry the same ICU data, and a
 * date that differs between them is a hydration mismatch. Nairobi is UTC+3
 * all year, so the offset is a constant.
 */
function slotLabel(iso: string): string {
  const at = new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000);
  const hh = String(at.getUTCHours()).padStart(2, '0');
  const mm = String(at.getUTCMinutes()).padStart(2, '0');
  return `${DAYS[at.getUTCDay()]} ${hh}:${mm}`;
}
