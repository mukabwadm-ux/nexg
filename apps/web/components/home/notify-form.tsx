'use client';

import { Button, Input, useToast, withCaptcha } from '@nexg/ui';
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
    <form
      action={async (formData: FormData) => formAction(await withCaptcha(formData))}
      className="mt-8 max-w-[38rem]"
    >
      <p className="text-gold text-base font-bold">Be first to know when it lands</p>
      {/* A dark pill with the gold button inside it, on the dark panel. */}
      <div className="focus-within:ring-gold mt-3 flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] p-1.5 focus-within:ring-2">
        <Input
          id="notify_email"
          name="email"
          type="email"
          label="Email address"
          labelHidden
          placeholder="Your email address"
          className="h-12 border-0 bg-transparent pl-5 text-base text-white placeholder:text-white/50 focus:ring-0"
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
    <Button
      type="submit"
      variant="gold"
      loading={pending}
      loadingText="Saving…"
      className="h-12 shrink-0 rounded-full px-7 text-base"
    >
      Notify me
    </Button>
  );
}
