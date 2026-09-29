'use client';

import { Button, useToast } from '@nexg/ui';
import { Check, Copy, MessageCircle } from 'lucide-react';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

import { useOnboarding } from './store';

/**
 * "Save & finish on WhatsApp".
 *
 * The token is real, single-use and hashed in the database. Delivery is not:
 * there is no WhatsApp Business sender on this account yet, so rather than
 * claim to have sent a message that never arrives, the link is put on screen
 * to copy. The moment a sender exists, the send happens here and this panel
 * becomes a confirmation instead.
 */
export function ResumeButton() {
  const { draft } = useOnboarding();
  const { toast } = useToast();
  const [link, setLink] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  if (!draft) return null;

  const make = async () => {
    setPending(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('rpc_merchant_resume_token', {
      p_merchant_id: draft.id,
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
    setLink(`${window.location.origin}/m/r/${data as string}`);
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            <h2 className="text-xl font-extrabold tracking-tight">Your progress is saved</h2>
            <p className="text-muted mt-2 text-[0.9375rem] leading-[1.8]">
              This link opens your registration exactly where you left it, on any device. It works
              once and expires in seven days.
            </p>

            <div className="border-border-strong bg-bg mt-4 flex items-center gap-2 rounded-xl border p-3">
              <code className="min-w-0 flex-1 truncate text-xs font-semibold">{link}</code>
              <Button size="sm" variant="outline" onClick={() => void copy()}>
                <span className="flex items-center gap-1.5">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </span>
              </Button>
            </div>

            <p className="border-warning/40 bg-warning-bg text-warning mt-4 rounded-xl border p-3 text-xs font-semibold leading-[1.7]">
              We cannot send this on WhatsApp yet — the business sender is not connected. Copy it
              and keep it somewhere safe.
            </p>

            <Button block className="mt-5" onClick={() => setLink(null)}>
              Back to my registration
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
