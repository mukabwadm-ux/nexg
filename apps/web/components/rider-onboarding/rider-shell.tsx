'use client';

import { Button, useToast } from '@nexg/ui';
import { Check, Copy, MessageCircle } from 'lucide-react';
import * as React from 'react';

import { ShellFrame } from '@/components/onboarding/shell-frame';
import { createClient } from '@/lib/supabase/client';

import { RiderPreview } from './rider-preview';
import { useRiderOnboarding } from './store';
import { RIDER_STEPS } from './types';

/** The rider flow's shell: the shared frame, wired to the rider store. */
export function RiderShell({
  step,
  eyebrow,
  title,
  intro,
  children,
  footer,
}: {
  step: number;
  eyebrow: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const { draft, readiness, save } = useRiderOnboarding();

  return (
    <ShellFrame
      label="Rider application"
      step={step}
      totalSteps={5}
      minutesLeft={RIDER_STEPS.find((s) => s.step === step)?.minutes ?? 0}
      save={save}
      preview={<RiderPreview />}
      resume={<RiderResumeButton />}
      collapsedSummary={
        draft ? (
          <>
            <span className="min-w-0 truncate text-[0.8125rem] font-extrabold">
              {draft.first_name || '[Your name]'}
              {draft.plate_no ? ` · ${draft.plate_no}` : ''}
            </span>
            <span className="text-muted flex shrink-0 items-center gap-2 text-[0.8125rem] font-bold">
              {readiness?.pct ?? 0}% ready
              <span className="text-gold-text underline underline-offset-4">See your card</span>
            </span>
          </>
        ) : null
      }
      eyebrow={eyebrow}
      title={title}
      {...(intro ? { intro } : {})}
      footer={footer}
    >
      {children}
    </ShellFrame>
  );
}

/**
 * "Save & finish on WhatsApp".
 *
 * The token is real, single use and hashed. Delivery is not: there is no
 * WhatsApp sender on this account, so rather than claim to have sent a
 * message that never arrives, the link is put on screen to copy.
 */
function RiderResumeButton() {
  const { draft } = useRiderOnboarding();
  const { toast } = useToast();
  const [link, setLink] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  if (!draft) return null;

  const make = async () => {
    setPending(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('rpc_rider_resume_token', {
      p_rider_id: draft.id,
    });
    setPending(false);

    if (error || !data) {
      toast({
        title: 'We could not make a link',
        description: error?.message ?? 'Try again in a moment.',
        tone: 'danger',
      });
      return;
    }
    setLink(`${window.location.origin}/r/${data as string}`);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        loading={pending}
        onClick={() => void make()}
        className="hidden sm:inline-flex"
      >
        <span className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Save &amp; finish on WhatsApp
        </span>
      </Button>

      {link && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setLink(null)}
            className="bg-ink/40 absolute inset-0"
          />
          <div className="border-border bg-surface relative w-full max-w-lg rounded-2xl border p-6">
            <h2 className="text-xl font-extrabold tracking-tight">Your application is saved</h2>
            <p className="text-muted mt-2 text-[0.9375rem] leading-[1.8]">
              This link opens your application exactly where you left it, on any phone. It works
              once and expires in seven days.
            </p>

            <div className="border-border-strong bg-bg mt-4 flex items-center gap-2 rounded-xl border p-3">
              <code className="min-w-0 flex-1 truncate text-xs font-semibold">{link}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                <span className="flex items-center gap-1.5">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </span>
              </Button>
            </div>

            <p className="border-warning/40 bg-warning-bg text-warning mt-4 rounded-xl border p-3 text-xs font-semibold leading-[1.7]">
              We cannot text or WhatsApp this to you yet — no sender is connected. Copy it and keep
              it somewhere safe.
            </p>

            <Button block className="mt-5" onClick={() => setLink(null)}>
              Back to my application
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
