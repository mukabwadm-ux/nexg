'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { liftTakedown, takeJobDown } from '@/app/jobs/actions';

/**
 * Take a job down, or lift a take-down, with the reason the business reads.
 * One field and one button; the database checks who may, in which city.
 */
export function TakedownForm({
  vacancyId,
  mode,
}: {
  vacancyId: string;
  mode: 'take-down' | 'lift';
}) {
  const router = useRouter();
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);
  const id = React.useId();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    const outcome =
      mode === 'take-down'
        ? await takeJobDown(vacancyId, reason)
        : await liftTakedown(vacancyId, reason);
    setBusy(false);
    setResult(outcome);
    if (outcome.ok) {
      setReason('');
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <label htmlFor={id} className="block text-[0.8125rem] font-bold">
        {mode === 'take-down'
          ? 'Why is it coming down? The business reads this.'
          : 'Why is the take-down lifted?'}
      </label>
      <textarea
        id={id}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={3}
        maxLength={500}
        required
        placeholder={
          mode === 'take-down'
            ? 'Asks applicants to pay a fee. Contact NexG support to discuss.'
            : 'The business removed the fee from the job.'
        }
        className="border-border-strong bg-surface focus:border-ink w-full rounded-lg border px-3 py-2 text-[0.875rem] font-semibold focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy || !reason.trim()}
        className={`h-10 rounded-lg px-4 text-[0.875rem] font-bold disabled:opacity-50 ${
          mode === 'take-down' ? 'bg-danger text-white' : 'bg-ink text-white'
        }`}
      >
        {busy ? 'Saving…' : mode === 'take-down' ? 'Take the job down' : 'Lift the take-down'}
      </button>
      {result ? (
        <p
          role={result.ok ? 'status' : 'alert'}
          className={`rounded-lg px-3 py-2 text-[0.8125rem] font-bold ${
            result.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
          }`}
        >
          {result.message}
        </p>
      ) : null}
    </form>
  );
}
