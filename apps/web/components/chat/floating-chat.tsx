'use client';

import { Loader2, MessageCircle, X } from 'lucide-react';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * The floating chat.
 *
 * Real support, reaching a real desk. What somebody types here
 * becomes a conversation in the Messaging console with a person
 * assigned to it by the routing rules — not a form that emails
 * an inbox.
 *
 * Three decisions worth stating, because each one is the kind
 * that gets quietly reversed later:
 *
 * It asks how to reply before it asks what is wrong. A chat
 * widget that takes a long message and then says "and your
 * email?" has already lost the people who close the tab, and
 * those are the people with the most urgent problem.
 *
 * It does not pretend somebody is typing. No fake "an agent
 * will be with you shortly" while nothing is happening. It says
 * what is true: this reached the desk, here is your reference,
 * somebody will reply on the contact you gave.
 *
 * Consent is a tick, not an assumption. The contact detail is
 * the only personal thing collected here and the only reason
 * it is collected, and the database refuses the call without
 * it — so the box is not decoration.
 */

const TOPICS = [
  { key: 'my_order', label: 'My order' },
  { key: 'payment', label: 'A payment' },
  { key: 'refund_status', label: 'A refund' },
  { key: 'change_order', label: 'Change an order' },
  { key: 'outside_coverage', label: 'You do not deliver to me' },
  { key: 'merchant_application', label: 'Listing my business' },
  { key: 'rider_application', label: 'Riding for NexG' },
  { key: 'hotel_or_airbnb', label: 'My hotel or Airbnb' },
  { key: 'partnership', label: 'A partnership' },
  { key: 'careers', label: 'A job' },
  { key: 'something_else', label: 'Something else' },
] as const;

type Sent = { reference: string; message: string };

export function FloatingChat({ citySlug }: { citySlug?: string | null }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState<Sent | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState('');
  const [contact, setContact] = React.useState('');
  const [topic, setTopic] = React.useState<string>('my_order');
  const [body, setBody] = React.useState('');
  const [consent, setConsent] = React.useState(false);

  const panel = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc('rpc_msg_contact', {
      p_name: name,
      p_contact: contact,
      p_topic: topic as never,
      p_body: body,
      p_city_slug: citySlug ?? undefined,
      p_consent: consent,
    });

    if (rpcError) {
      /*
       * The database raises these with wording meant to be read
       * by the person, not by an engineer — "We need a way to
       * reply to you", not "null value violates…". So it is
       * shown as written rather than replaced with something
       * generic.
       */
      setError(rpcError.message);
      setBusy(false);
      return;
    }

    const result = data as { reference: string; message: string };
    setSent({ reference: result.reference, message: result.message });
    setBusy(false);
  }

  function reset() {
    setSent(null);
    setBody('');
    setError(null);
  }

  return (
    <>
      {/* ─────────────────────────────────────── the button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close chat' : 'Chat to us'}
        aria-expanded={open}
        className="bg-ink fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-2xl transition-transform hover:scale-105 sm:bottom-6 sm:right-6"
      >
        {open ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
        )}
      </button>

      {/* ──────────────────────────────────────── the panel */}
      {open ? (
        <div
          ref={panel}
          role="dialog"
          aria-label="Chat to us"
          className="border-border bg-surface fixed bottom-24 right-4 z-40 w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border shadow-2xl sm:right-6"
        >
          <div className="bg-ink px-4 py-3 text-white">
            <p className="text-[0.9375rem] font-extrabold tracking-tight">Talk to a person</p>
            <p className="mt-0.5 text-[0.6875rem] font-semibold opacity-80">
              This reaches the concierge desk, not an inbox nobody reads.
            </p>
          </div>

          {sent ? (
            <div className="px-4 py-6 text-center">
              <p className="text-[0.9375rem] font-extrabold tracking-tight">Got it.</p>
              <p className="text-muted mt-1.5 text-[0.8125rem] font-semibold">{sent.message}</p>
              <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold">
                Your reference
              </p>
              <p className="font-mono text-base font-extrabold tracking-tight">{sent.reference}</p>
              <button
                type="button"
                onClick={reset}
                className="text-gold mt-4 text-[0.75rem] font-extrabold hover:underline"
              >
                Ask about something else
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="space-y-3 px-4 py-4">
              {/*
               * How to reply, first. A widget that takes a long
               * message and only then asks for contact details
               * loses exactly the people who were in a hurry.
               */}
              <label className="block">
                <span className="text-muted-light text-[0.6875rem] font-extrabold tracking-wide uppercase">
                  Phone or email
                </span>
                <input
                  required
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="07xx xxx xxx"
                  className="border-border-strong bg-bg mt-1 w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
                />
              </label>

              <label className="block">
                <span className="text-muted-light text-[0.6875rem] font-extrabold tracking-wide uppercase">
                  Your name <span className="normal-case opacity-70">(optional)</span>
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="border-border-strong bg-bg mt-1 w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
                />
              </label>

              <label className="block">
                <span className="text-muted-light text-[0.6875rem] font-extrabold tracking-wide uppercase">
                  What is it about
                </span>
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="border-border-strong bg-bg mt-1 w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
                >
                  {TOPICS.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-muted-light text-[0.6875rem] font-extrabold tracking-wide uppercase">
                  What do you need
                </span>
                <textarea
                  required
                  rows={3}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Tell us what is happening."
                  className="border-border-strong bg-bg mt-1 w-full resize-none rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
                />
              </label>

              <label className="flex cursor-pointer gap-2">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-muted text-[0.6875rem] font-semibold">
                  You may contact me on this to answer my question. We use it for nothing else.
                </span>
              </label>

              {error ? (
                <p className="border-danger/40 bg-danger/5 text-danger rounded-lg border px-3 py-2 text-[0.75rem] font-extrabold">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={busy}
                className="bg-ink flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[0.8125rem] font-extrabold text-white disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                {busy ? 'Sending…' : 'Send'}
              </button>
            </form>
          )}
        </div>
      ) : null}
    </>
  );
}
