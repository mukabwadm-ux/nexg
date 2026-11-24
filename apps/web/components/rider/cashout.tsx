'use client';

import { Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { cancelEarlyPayout, requestEarlyPayout } from '@/app/(customer)/rider/actions';

import { kes, ring } from './ui';

const QUICK = [500, 1000, 2000, 5000];

/**
 * The dark balance card with Withdraw, and the quick amounts under it.
 *
 * A withdrawal is a request finance approves before M-Pesa pays it, so
 * the button says what happens and the open request shows its state.
 * Only one request is open at a time; a pending one can be cancelled.
 */
export function CashoutCard({
  availableKes,
  minimumKes,
  payoutPhone,
  open,
}: {
  availableKes: number;
  minimumKes: number;
  payoutPhone: string | null;
  open: { id: string; amountKes: number; status: string } | null;
}) {
  const router = useRouter();
  const [amount, setAmount] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [said, setSaid] = React.useState<{ ok: boolean; message?: string } | null>(null);
  const value = Number(amount);
  const tooSmall = value > 0 && value < minimumKes;
  const tooBig = value > availableKes;

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    setSaid(null);
    const result = await fn();
    setBusy(false);
    setSaid(result);
    if (result.ok) {
      setAmount('');
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <section className="relative isolate overflow-hidden rounded-[22px] bg-gradient-to-br from-[#121a33] to-[#0b0f1c] p-5 text-white sm:p-6">
        <svg
          aria-hidden="true"
          viewBox="0 0 400 200"
          className="absolute inset-0 -z-10 h-full w-full opacity-40"
          preserveAspectRatio="none"
        >
          <path d="M0 160 C 120 120, 240 200, 400 110 L400 200 L0 200 Z" fill="#1d2a52" />
        </svg>
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/10">
            <Wallet className="h-8 w-8" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-white/80">Available balance</p>
            <p className="text-[32px] font-extrabold tabular-nums leading-tight">
              {kes(availableKes)}
            </p>
          </div>
        </div>

        {open ? (
          <div className="mt-5 rounded-2xl bg-white/10 p-4">
            <p className="text-[14px] font-extrabold">
              {kes(open.amountKes)} ·{' '}
              {open.status === 'pending' ? 'waiting for finance' : 'approved, being paid'}
            </p>
            <p className="mt-0.5 text-[13px] text-white/75">
              One request at a time. You can ask again once this one is paid.
            </p>
            {open.status === 'pending' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => cancelEarlyPayout(open.id))}
                className={`mt-3 rounded-xl border border-white/30 px-4 py-2 text-[13px] font-extrabold disabled:opacity-50 ${ring}`}
              >
                Cancel request
              </button>
            ) : null}
          </div>
        ) : (
          <form
            className="mt-5 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => requestEarlyPayout(value, ''));
            }}
          >
            <label className="block">
              <span className="text-[13px] font-semibold text-white/80">Amount to withdraw</span>
              <span className="focus-within:ring-gold mt-1 flex items-center rounded-xl bg-white px-3 text-[color:var(--rider-ink)] focus-within:ring-2">
                <span className="text-[15px] font-extrabold text-slate-500">KSh</span>
                <input
                  inputMode="numeric"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ''))}
                  placeholder={`From ${minimumKes.toLocaleString('en-KE')}`}
                  aria-describedby="cashout-help"
                  className="h-12 w-full bg-transparent px-2 text-[18px] font-extrabold outline-none"
                />
              </span>
            </label>
            <p id="cashout-help" className="text-[12.5px] font-semibold text-white/70">
              {tooSmall
                ? `The smallest withdrawal is ${kes(minimumKes)}.`
                : tooBig
                  ? `You have ${kes(availableKes)} available.`
                  : payoutPhone
                    ? `Paid to ${payoutPhone} once finance approves.`
                    : 'Add your M-Pesa number in your account first.'}
            </p>
            <button
              type="submit"
              disabled={busy || !payoutPhone || !value || tooSmall || tooBig}
              className={`bg-gold w-full rounded-xl px-4 py-3 text-[15px] font-extrabold text-[color:var(--rider-ink)] disabled:opacity-50 ${ring}`}
            >
              {busy ? 'Sending…' : 'Withdraw Funds'}
            </button>
          </form>
        )}
        {said?.message ? (
          <p
            role={said.ok ? 'status' : 'alert'}
            className={`mt-3 text-[13px] font-bold ${said.ok ? 'text-green-300' : 'text-red-300'}`}
          >
            {said.message}
          </p>
        ) : null}
      </section>

      {open ? null : (
        <section aria-labelledby="quick-amounts">
          <h2
            id="quick-amounts"
            className="mb-2 text-[16px] font-extrabold text-[color:var(--rider-ink)]"
          >
            Quick Amounts
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                disabled={q > availableKes || q < minimumKes}
                aria-pressed={value === q}
                onClick={() => setAmount(String(q))}
                className={`rounded-xl border px-3 py-2.5 text-[13.5px] font-extrabold tabular-nums transition-colors disabled:opacity-40 ${ring} ${
                  value === q
                    ? 'border-gold bg-gold/20'
                    : 'hover:bg-gold-soft border-[#e6e9f2] bg-white'
                }`}
              >
                {kes(q)}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
