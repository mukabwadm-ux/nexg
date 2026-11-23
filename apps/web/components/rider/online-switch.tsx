'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { goOnline } from '@/app/(customer)/rider/actions';

/**
 * The rider's online switch. The server decides: going online needs an
 * active account, no cooldown and documents in date, and the RPC says why
 * when it refuses. Shown only to active riders.
 */
export function OnlineSwitch({
  online,
  tone = 'dark',
  showLabel = true,
}: {
  online: boolean;
  tone?: 'dark' | 'light';
  showLabel?: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = React.useState(online);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setOn(online), [online]);

  async function flip() {
    setBusy(true);
    setError(null);
    const next = !on;
    const result = await goOnline(next, '');
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? 'That did not go through. Try again.');
      return;
    }
    setOn(next);
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex items-center gap-3">
        {showLabel ? (
          <span
            className={`flex items-center gap-2 text-[14px] font-extrabold ${tone === 'dark' ? 'text-white' : ''}`}
          >
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 rounded-full ${on ? 'bg-green-400' : 'bg-slate-400'}`}
            />
            {on ? 'You are online' : 'You are offline'}
          </span>
        ) : null}
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={on ? 'Go offline' : 'Go online'}
          disabled={busy}
          onClick={flip}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
            on ? 'bg-green-500' : 'bg-slate-500'
          } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left] ${
              on ? 'left-6' : 'left-1'
            }`}
          />
        </button>
      </span>
      {error ? (
        <span role="alert" className="max-w-[16rem] text-[12px] font-semibold text-red-300">
          {error}
        </span>
      ) : null}
    </span>
  );
}
