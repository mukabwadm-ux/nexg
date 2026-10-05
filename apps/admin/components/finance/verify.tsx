'use client';

import * as React from 'react';

import { kesMoney } from '@/components/finance/shared';
import { createClient } from '@/lib/supabase/client';

/**
 * The button that re-derives a figure from the ledger.
 *
 * Everything else on these screens is a projection — a number
 * worked out earlier and stored. That is the right way to build
 * them, and it leaves one honest question open: is what I am
 * looking at still true? This answers it by summing the entries
 * again, now, and showing both figures.
 *
 * What it establishes is narrow and worth stating plainly, which
 * is why the result says it: that the stored row still matches
 * the ledger. A screen that has quietly stopped rebuilding looks
 * exactly like a quiet week, and this is how somebody tells the
 * difference without asking an engineer.
 *
 * It deliberately distinguishes "behind" from "wrong". Entries
 * landing since the last rebuild is normal and needs no action;
 * a disagreement with no new entries to explain it means stop.
 */
type Result = {
  matches: boolean;
  message: string;
  built_at: string | null;
  shown: { gross_cents: number; revenue_cents: number; net_cents: number } | null;
  ledger_now: { gross_cents: number; revenue_cents: number; net_cents: number };
};

export function Verify({ from, to }: { from: string; to: string }) {
  const [state, setState] = React.useState<'idle' | 'running'>('idle');
  const [result, setResult] = React.useState<Result | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setState('running');
    setError(null);
    setResult(null);
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc('rpc_fin_verify', {
      p_from: from,
      p_to: to,
    });
    setState('idle');
    if (rpcError) {
      /*
       * The failure is shown, not swallowed. A Verify button that
       * silently does nothing is worse than no button: it reads
       * as confirmation.
       */
      setError(rpcError.message);
      return;
    }
    setResult(data as unknown as Result);
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={run}
        disabled={state === 'running'}
        className="border-border-strong bg-surface text-ink hover:border-ink rounded-full border px-3 py-1.5 text-[0.6875rem] font-extrabold transition-colors disabled:opacity-50"
      >
        {state === 'running' ? 'Re-summing the ledger…' : 'Verify against the ledger'}
      </button>

      {error ? (
        <p className="text-danger max-w-xs text-right text-[0.6875rem] font-semibold">
          Could not verify: {error}
        </p>
      ) : null}

      {result ? (
        <div
          className={`max-w-sm rounded-lg border px-3 py-2 text-right text-[0.6875rem] font-semibold ${
            result.matches
              ? 'border-success/40 bg-success/5 text-success'
              : 'border-danger/40 bg-danger/5 text-danger'
          }`}
        >
          <p className="font-extrabold">{result.message}</p>
          {!result.matches && result.shown ? (
            <p className="text-muted mt-1 tabular-nums">
              Shown {kesMoney(result.shown.revenue_cents)} · ledger{' '}
              {kesMoney(result.ledger_now.revenue_cents)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
