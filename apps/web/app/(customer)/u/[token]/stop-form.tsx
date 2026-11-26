'use client';

import { Button } from '@nexg/ui';
import * as React from 'react';

import { unsubscribe } from './actions';

export function StopForm({ token }: { token: string }) {
  const [state, setState] = React.useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  if (state === 'done') {
    return (
      <p role="status" className="text-page-muted mt-4 text-base font-semibold leading-relaxed">
        Done. You will not get NexG marketing any more on email, SMS, WhatsApp or in the app. You
        will still get messages about your own orders, stays and account.
      </p>
    );
  }
  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setState('busy');
        const r = await unsubscribe(token);
        setState(r.ok ? 'done' : 'failed');
      }}
    >
      <p className="text-page-muted text-base font-semibold leading-relaxed">
        Offers, news and recommendations from NexG stop on every channel. Messages about your own
        orders, stays and account keep coming.
      </p>
      <Button type="submit" variant="black" size="lg" loading={state === 'busy'}>
        Stop marketing messages
      </Button>
      {state === 'failed' && (
        <p role="alert" className="text-danger text-sm font-semibold">
          That did not work. Try again, or write to info@nexgapp.com.
        </p>
      )}
    </form>
  );
}
