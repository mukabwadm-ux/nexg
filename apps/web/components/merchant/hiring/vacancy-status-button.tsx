'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { setVacancyStatus } from '@/app/merchant/hiring/actions';

/** Take an open job off the board, or put a closed one back. */
export function VacancyStatusButton({
  vacancyId,
  status,
  live,
}: {
  vacancyId: string;
  status: string;
  live: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (status === 'draft') return null;
  const next = status === 'open' ? 'closed' : 'open';
  if (next === 'open' && !live) return null;

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await setVacancyStatus(vacancyId, next);
          setBusy(false);
          if (!result.ok) setError(result.message ?? 'That did not work. Try again.');
          else router.refresh();
        }}
        className={`h-10 rounded-lg px-4 text-[0.8125rem] font-bold disabled:opacity-60 ${
          next === 'closed' ? 'border-border-strong border' : 'bg-gold text-ink'
        }`}
      >
        {busy ? 'Saving…' : next === 'closed' ? 'Close the job' : 'Open it again'}
      </button>
      {error ? (
        <span role="alert" className="text-danger max-w-xs text-right text-[0.75rem] font-bold">
          {error}
        </span>
      ) : null}
    </span>
  );
}
