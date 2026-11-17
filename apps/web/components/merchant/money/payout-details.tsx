'use client';

import { Input } from '@nexg/ui';
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  Landmark,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { browserUuid } from '@/lib/browser-uuid';
import { payoutDeclaration, payoutForm } from '@/lib/merchant-application-client';
import {
  EMPTY_PAYOUT_FORM,
  describePayout,
  payoutFormProblem,
  type DeclaredPayout,
  type PayoutFormValue,
} from '@/lib/merchant-payouts';

import styles from './workspace.module.css';

/** Who is looking, which decides whether the form shows. */
export type PayoutPageMode = 'owner' | 'read-only' | 'legacy' | 'anonymous';

const METHODS: readonly { value: string; label: string; hint: string; icon: LucideIcon }[] = [
  { value: 'mpesa_till', label: 'M-Pesa Till', hint: 'Buy Goods number', icon: Smartphone },
  {
    value: 'mpesa_paybill',
    label: 'M-Pesa PayBill',
    hint: 'Business number and account',
    icon: Building2,
  },
  { value: 'bank', label: 'Bank account', hint: 'Paid by bank transfer', icon: Landmark },
];

/** The destination NexG Finance has verified, as merchant_home_v names it. */
const VERIFIED: Record<string, string> = {
  mpesa_till: 'M-Pesa Till',
  mpesa_paybill: 'M-Pesa PayBill',
  bank: 'Bank transfer',
  bank_transfer: 'Bank transfer',
};

/**
 * The payout page: where the business owner adds or changes the M-Pesa Till,
 * PayBill or bank account NexG pays them into. It saves through the same
 * command as the application's payout step (rpc_merchant_application_payout_save),
 * which records a declaration; NexG Finance verifies it before paying into it.
 */
export function PayoutDetails({
  mode,
  merchantId,
  declaration,
  verifiedRail,
}: {
  mode: PayoutPageMode;
  merchantId?: string;
  /** Undefined when it could not be read; payout null when none was saved. */
  declaration?: { version: number; payout: DeclaredPayout | null };
  /** The verified destination's rail; null for none, undefined when unknown. */
  verifiedRail?: string | null;
}) {
  const router = useRouter();
  const [saved, setSaved] = React.useState(declaration);
  const [value, setValue] = React.useState<PayoutFormValue>(
    () =>
      (payoutForm((declaration?.payout as Record<string, string> | null) ?? null) as
        | PayoutFormValue
        | undefined) ?? EMPTY_PAYOUT_FORM,
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [done, setDone] = React.useState(false);
  /* One operation key per distinct request, so a retry of the same save is
     recognised and a changed one is not mistaken for it. */
  const keys = React.useRef(new Map<string, string>());

  const current = describePayout(saved?.payout ?? null);
  const verified = verifiedRail ? (VERIFIED[verifiedRail] ?? 'A payout method') : null;
  const set = (field: keyof PayoutFormValue) => (next: string) => {
    setValue((previous) => ({ ...previous, [field]: next }));
    setDone(false);
    setError('');
  };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!merchantId || !saved) return;
    const problem = payoutFormProblem(value);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payout = payoutDeclaration(value);
      const fingerprint = JSON.stringify({ version: saved.version, payout });
      const operationId = keys.current.get(fingerprint) ?? browserUuid();
      keys.current.set(fingerprint, operationId);
      const response = await fetch('/api/merchant/application', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          command: 'payout',
          merchantId,
          expectedVersion: saved.version,
          payout,
          operationId,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        detail?: string;
        data?: { version?: number };
      };
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'Your payout details changed in another window. Reload this page and try again.'
            : (result.detail ?? 'Your payout details could not be saved. Please try again.'),
        );
      keys.current.delete(fingerprint);
      setSaved({ version: result.data?.version ?? saved.version + 1, payout });
      setDone(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your payout details could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.root}>
      <main className="mo-workspace" data-testid="payout-workspace">
        <div className="mo-heading">
          <div>
            <Link
              href="/merchant/money"
              className="text-muted mb-2 inline-flex items-center gap-1.5 text-xs font-bold hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Money
            </Link>
            <h1>Payouts</h1>
            <p>
              Where NexG sends your earnings. Weekly settlements pay out on Fridays to the account
              you choose here.
            </p>
          </div>
        </div>

        <section className="grid max-w-3xl gap-4">
          <div className="rounded-xl border border-[#e8e2d8] bg-white p-5">
            <p className="text-muted text-xs font-bold uppercase tracking-[0.12em]">
              Your payout account
            </p>
            {current ? (
              <>
                <p className="mt-2 text-lg font-extrabold">{current.method}</p>
                <p className="text-muted mt-0.5 text-sm font-semibold">{current.detail}</p>
              </>
            ) : mode === 'owner' && saved ? (
              <p className="mt-2 text-sm font-semibold">
                None yet. Add one below so your first settlement has somewhere to go.
              </p>
            ) : (
              <p className="mt-2 text-sm font-semibold">
                {verified ? `${verified}, on file with NexG Finance.` : 'None on file yet.'}
              </p>
            )}
            {verified ? (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#e9f6ee] px-3 py-1 text-xs font-bold text-[#1d6b3a]">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Verified destination on file: {verified}
              </p>
            ) : current ? (
              <p className="mt-3 text-xs font-semibold text-[#6e4700]">
                NexG Finance checks these details before paying into them.
              </p>
            ) : null}
          </div>

          {mode === 'owner' && saved ? (
            <form
              onSubmit={(event) => void save(event)}
              className="rounded-xl border border-[#e8e2d8] bg-white p-5"
              noValidate
            >
              <h2 className="text-base font-extrabold">
                {current ? 'Change payout account' : 'Add payout account'}
              </h2>
              <fieldset className="mt-4">
                <legend className="text-sm font-bold">How do you want to be paid?</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-3" role="radiogroup">
                  {METHODS.map(({ value: method, label, hint, icon: Icon }) => {
                    const chosen = value.method === method;
                    return (
                      <button
                        key={method}
                        type="button"
                        role="radio"
                        aria-checked={chosen}
                        onClick={() => set('method')(method)}
                        className={`focus-visible:ring-gold flex items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                          chosen
                            ? 'border-[#d6a62b] bg-[#fdf7e6]'
                            : 'border-[#e8e2d8] hover:bg-[#faf7ef]'
                        }`}
                      >
                        <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                        <span>
                          <span className="block text-sm font-bold">{label}</span>
                          <span className="text-muted block text-xs font-semibold">{hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {value.method === 'mpesa_till' && (
                  <Input
                    id="payout-till"
                    label="Till number"
                    inputMode="numeric"
                    autoComplete="off"
                    value={value.tillNumber}
                    onChange={(event) => set('tillNumber')(event.target.value)}
                  />
                )}
                {value.method === 'mpesa_paybill' && (
                  <>
                    <Input
                      id="payout-paybill"
                      label="PayBill (business) number"
                      inputMode="numeric"
                      autoComplete="off"
                      value={value.paybillNumber}
                      onChange={(event) => set('paybillNumber')(event.target.value)}
                    />
                    <Input
                      id="payout-reference"
                      label="Account number"
                      hint="The reference for this PayBill account. Letters are allowed."
                      autoComplete="off"
                      value={value.accountReference}
                      onChange={(event) => set('accountReference')(event.target.value)}
                    />
                  </>
                )}
                {value.method === 'bank' && (
                  <>
                    <Input
                      id="payout-bank"
                      label="Bank"
                      autoComplete="off"
                      value={value.bankName}
                      onChange={(event) => set('bankName')(event.target.value)}
                    />
                    <Input
                      id="payout-holder"
                      label="Name on the account"
                      autoComplete="off"
                      value={value.holderName}
                      onChange={(event) => set('holderName')(event.target.value)}
                    />
                    <Input
                      id="payout-account"
                      label="Account number"
                      autoComplete="off"
                      value={value.bankAccount}
                      onChange={(event) => set('bankAccount')(event.target.value)}
                    />
                  </>
                )}
              </div>

              {error && (
                <p role="alert" className="mo-note mo-note-error mt-4">
                  {error}
                </p>
              )}
              {done && (
                <p role="status" className="mo-note mt-4">
                  Saved. NexG Finance checks new payout details before paying into them.
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={busy || !value.method}
                  className="mo-button mo-primary"
                >
                  {busy ? 'Saving…' : current ? 'Save changes' : 'Save payout account'}
                </button>
                <span className="text-muted text-xs font-semibold">
                  Only you, the business owner, can change this.
                </span>
              </div>
            </form>
          ) : (
            <p className="mo-note">
              {mode === 'owner'
                ? 'Your payout details could not be loaded. Reload the page to try again.'
                : mode === 'legacy'
                  ? 'Your payout account is set up with NexG Finance. To change it, contact support and they will verify the new details with you.'
                  : mode === 'anonymous'
                    ? 'Create your merchant account first, then add where you want to be paid.'
                    : 'Only the business owner can add or change payout details.'}{' '}
              {mode === 'legacy' && (
                <Link href="/merchant/support" className="font-bold underline">
                  Contact support
                </Link>
              )}
              {mode === 'anonymous' && (
                <Link href="/merchant" className="font-bold underline">
                  Back to Home
                </Link>
              )}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
