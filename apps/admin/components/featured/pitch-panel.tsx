'use client';

import { Button, Card, Input, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

export interface Preview {
  ok: boolean;
  reason?: string;
  message?: string;
  subject?: string;
  body?: string;
  to?: string | null;
  placements?: number;
}

/**
 * Sending a merchant the featured-slot pitch.
 *
 * The preview is the whole point. A reviewer is about to send
 * somebody prices, and the only way to be sure what those prices
 * are is to read the message — so the exact text is on screen
 * before the button is pressable, rendered by the same function the
 * eventual worker will use rather than a second copy in TypeScript.
 */
export function PitchPanel({
  merchantName,
  preview,
  onSend,
}: {
  merchantName: string;
  preview: Preview | null;
  onSend: (note: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [pending, setPending] = React.useState(false);

  if (!preview?.ok) {
    return (
      <Card className="p-5">
        <h2 className="text-sm font-extrabold uppercase tracking-wide">Featured placement</h2>
        <p className="text-muted mt-2 text-sm font-semibold leading-[1.7]">
          {preview?.message ??
            'Nothing priced to pitch here yet. Finance publishes a rate card on Settings → Fees, and until they do a pitch would have to quote a number nobody agreed.'}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-extrabold uppercase tracking-wide">Sell them a slot</h2>
      <p className="text-muted mt-2 text-sm font-semibold leading-[1.7]">
        {preview.placements} placement{preview.placements === 1 ? '' : 's'} are priced and open in
        their city. The email below goes to {preview.to ?? 'them'} with the real prices.
      </p>

      <Button variant="outline" size="sm" className="mt-3" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide the email' : 'Read what they will get'}
      </Button>

      {open && (
        <div className="bg-bg mt-3 rounded-lg p-3">
          <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-[0.12em]">
            Subject
          </p>
          <p className="mt-0.5 text-[0.8125rem] font-extrabold">{preview.subject}</p>
          <pre className="text-muted mt-3 whitespace-pre-wrap font-sans text-[0.75rem] font-semibold leading-[1.75]">
            {preview.body}
          </pre>
        </div>
      )}

      <div className="mt-3">
        <Input
          id="pitch-note"
          label="Anything to add"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Spoke to them about the homepage band."
          hint="Goes into the email above, in their words not ours."
        />
      </div>

      <Button
        block
        variant="black"
        className="mt-3"
        loading={pending}
        disabled={pending || !preview.to}
        onClick={async () => {
          setPending(true);
          const result = await onSend(note);
          setPending(false);
          toast({
            title: result.ok ? 'Done' : 'Not sent',
            description: result.message,
            tone: result.ok ? 'success' : 'danger',
          });
          if (result.ok) {
            setNote('');
            router.refresh();
          }
        }}
      >
        Send it to {merchantName}
      </Button>

      {!preview.to && (
        <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold">
          No email address on file, so there is nowhere to send it.
        </p>
      )}

      <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
        Once a week at most. A pitch that arrives every other day is a reason to stop reading our
        email.
      </p>
    </Card>
  );
}
