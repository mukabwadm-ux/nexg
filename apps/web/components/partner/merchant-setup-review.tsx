'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { dismissSetupReview } from '@/app/merchant/menu/choices-actions';

import { Panel } from './bits';

/*
 * What the shop entered earlier (the offerings editor, sign-up answers) that
 * could not be turned into menu rows exactly (catalogue_setup_review). Each
 * line says what to finish; the shop clears it when done.
 */

export interface SetupReviewLine {
  id: string;
  item_id: string | null;
  kind: string;
  message: string;
}

const quiet =
  'border-border-strong text-muted rounded-lg border px-3 py-1.5 text-[0.6875rem] font-extrabold disabled:opacity-40';

export function SetupReview({ lines }: { lines: SetupReviewLine[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  if (lines.length === 0) return null;

  return (
    <Panel
      title="From your earlier setup"
      note="Most of what you entered is now on your menu. These need you to finish them here."
    >
      {error && (
        <p
          role="status"
          className="bg-danger-bg text-danger mb-3 rounded-lg px-3 py-2 text-[0.75rem] font-bold"
        >
          {error}
        </p>
      )}
      <ul className="divide-border divide-y">
        {lines.map((line) => (
          <li key={line.id} className="flex items-start justify-between gap-3 py-2">
            <p className="text-[0.8125rem] font-semibold">{line.message}</p>
            <button
              type="button"
              className={quiet}
              disabled={busy === line.id}
              onClick={async () => {
                setBusy(line.id);
                setError(null);
                const r = await dismissSetupReview(line.id);
                setBusy(null);
                if (r.ok) router.refresh();
                else setError(r.message);
              }}
            >
              {busy === line.id ? '…' : 'Done'}
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
