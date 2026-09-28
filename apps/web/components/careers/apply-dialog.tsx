'use client';

import { Button, Card, Input, useToast } from '@nexg/ui';
import { ArrowRight } from 'lucide-react';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * The application form, opened from any role or from "send an open
 * application".
 *
 * No CV upload. Storing someone's CV makes NexG the custodian of a document
 * full of personal data, which needs a retention policy and a lawful basis
 * under the Data Protection Act — a link to a CV they already host answers
 * the same question and leaves it with them.
 */
export function ApplyDialog({
  roleTitle,
  team,
  open,
  onClose,
}: {
  roleTitle: string;
  team?: string;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  /*
   * A native <dialog>. It gives modal semantics, focus trapping, Escape and
   * inert background for free — all the things a div with role="dialog" has
   * to reimplement badly.
   */
  React.useEffect(() => {
    const element = dialogRef.current;
    if (!element) return;

    if (open && !element.open) {
      setDone(false);
      setError(null);
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  /*
   * Backdrop click closes. Attached natively rather than as an onClick prop:
   * the element is the click target only when the press lands outside its own
   * content box, and a JSX handler here trips the a11y rules that (wrongly)
   * treat <dialog> as non-interactive — it has Escape built in.
   */
  React.useEffect(() => {
    const element = dialogRef.current;
    if (!element) return;

    const onBackdrop = (event: MouseEvent) => {
      if (event.target === element) onClose();
    };
    element.addEventListener('click', onBackdrop);
    return () => element.removeEventListener('click', onBackdrop);
  }, [onClose]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc('rpc_job_apply', {
      p_role_title: roleTitle,
      p_full_name: String(form.get('full_name') ?? ''),
      p_email: String(form.get('email') ?? ''),
      ...(team ? { p_team: team } : {}),
      ...(form.get('phone') ? { p_phone: String(form.get('phone')) } : {}),
      ...(form.get('link') ? { p_link: String(form.get('link')) } : {}),
      ...(form.get('note') ? { p_note: String(form.get('note')) } : {}),
    });

    setPending(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setDone(true);
    toast({
      title: 'Application received',
      description: 'We read every one and reply within two working days.',
      tone: 'success',
    });
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label={`Apply for ${roleTitle}`}
      onClose={onClose}
      className="bg-transparent p-4 backdrop:bg-black/50 open:m-auto"
    >
      <div className="w-full max-w-lg">
        <Card className="p-6">
          {done ? (
            <>
              <h2 className="text-xl font-extrabold tracking-tight">Thank you — that’s in.</h2>
              <p className="text-muted mt-2 text-[0.9375rem] leading-[1.7]">
                We read every application and reply within two working days, whatever the answer.
              </p>
              <Button block className="mt-5" onClick={onClose}>
                Close
              </Button>
            </>
          ) : (
            <form onSubmit={submit}>
              <h2 className="text-xl font-extrabold tracking-tight">Apply</h2>
              <p className="text-muted-light mt-1 text-sm font-semibold">{roleTitle}</p>

              <div className="mt-5 grid gap-4">
                <Input id="full_name" name="full_name" label="Your name" required />
                <Input id="email" name="email" type="email" label="Email" required />
                <Input id="phone" name="phone" label="Phone (optional)" placeholder="+254 7…" />
                <Input
                  id="link"
                  name="link"
                  type="url"
                  label="CV or LinkedIn"
                  placeholder="https://…"
                  hint="A link you already host — we don’t store CV files."
                />
                <label className="block">
                  <span className="text-ink mb-1.5 block text-sm font-bold">
                    Why this role?{' '}
                    <span className="text-muted-light font-semibold">Three lines is plenty.</span>
                  </span>
                  <textarea
                    name="note"
                    rows={4}
                    maxLength={2000}
                    className="border-border bg-surface focus-visible:ring-gold w-full rounded-xl border px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2"
                  />
                </label>
              </div>

              {error && <p className="text-danger mt-3 text-xs font-bold">{error}</p>}

              <div className="mt-6 flex gap-2">
                <Button
                  type="submit"
                  block
                  loading={pending}
                  loadingText="Sending…"
                  trailingIcon={<ArrowRight className="text-gold h-4 w-4" />}
                >
                  Send application
                </Button>
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </dialog>
  );
}
