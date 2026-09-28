'use client';

import { Button, Input, useToast } from '@nexg/ui';
import * as React from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { type ActionResult, joinAppWaitlist } from '@/app/actions';

/** "Be first to know when it lands" — the app section of the homepage. */
export function NotifyForm() {
  const [state, formAction] = useFormState<ActionResult | null, FormData>(joinAppWaitlist, null);
  const { toast } = useToast();
  const announced = React.useRef<ActionResult | null>(null);

  React.useEffect(() => {
    if (state && state !== announced.current) {
      announced.current = state;
      toast({
        title: state.ok ? 'You are on the list' : 'Something went wrong',
        description: state.message,
        tone: state.ok ? 'success' : 'danger',
      });
    }
  }, [state, toast]);

  return (
    <form action={formAction} className="mt-3">
      <p className="text-ink text-sm font-bold">Be first to know when it lands</p>
      <div className="bg-surface shadow-card mt-2 flex items-end gap-2 rounded-xl p-1.5">
        <Input
          id="notify_email"
          name="email"
          type="email"
          label="Email address"
          labelHidden
          placeholder="Your email address"
          className="border-0 focus:ring-0"
          containerClassName="flex-1"
          required
        />
        <NotifyButton />
      </div>
    </form>
  );
}

function NotifyButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingText="Saving…" className="shrink-0">
      Notify me
    </Button>
  );
}
