'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { setItemAvailable, type Outcome } from '@/app/merchant/actions';

import { Panel, Pill, kesWhole } from './bits';

export interface ItemRow {
  id: string;
  name: string;
  description: string | null;
  price_kes: number;
  available: boolean;
  age_restricted: boolean;
  sort: number;
}

/**
 * On and off the menu.
 *
 * Instant, with no confirmation: it is reversible in one tap and a
 * kitchen that has run out of something needs it off now, not after
 * a dialog.
 */
export function Menu({ items, available }: { items: ItemRow[]; available: number }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState<Outcome | null>(null);

  return (
    <Panel title="Your menu" note={`${available} of ${items.length} orderable`}>
      {said && (
        <p
          role="status"
          className={`mb-3 rounded-lg px-3 py-2 text-[0.75rem] font-bold ${
            said.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
          }`}
        >
          {said.message}
        </p>
      )}

      <ul className="divide-border divide-y">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p
                className={`truncate text-[0.875rem] font-extrabold ${i.available ? '' : 'opacity-50'}`}
              >
                {i.name}
                {i.age_restricted && (
                  <Pill tone="bg-danger-bg text-danger">
                    <span className="ml-1">18+</span>
                  </Pill>
                )}
              </p>
              {i.description && (
                <p className="text-muted truncate text-[0.75rem] font-semibold">{i.description}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-[0.875rem] font-extrabold tabular-nums">
                {kesWhole(i.price_kes)}
              </span>
              <button
                type="button"
                disabled={busy === i.id}
                onClick={async () => {
                  setBusy(i.id);
                  setSaid(null);
                  const r = await setItemAvailable(i.id, !i.available);
                  setSaid(r);
                  setBusy(null);
                  if (r.ok) router.refresh();
                }}
                aria-pressed={i.available}
                className={`w-24 rounded-lg px-3 py-1.5 text-[0.6875rem] font-extrabold transition-colors disabled:opacity-40 ${
                  i.available
                    ? 'bg-success-bg text-success'
                    : 'border-border-strong text-muted border'
                }`}
              >
                {busy === i.id ? '…' : i.available ? 'ON' : 'OFF'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
