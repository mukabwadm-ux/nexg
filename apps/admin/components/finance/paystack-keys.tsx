'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  removePaystackKey,
  savePaystackKey,
  type KeyOutcome,
} from '@/app/finance/paystack/actions';
import { Note, Problem } from '@/components/finance/paystack-parts';
import { PanelHead, Pill, Sheet } from '@/components/portal/kit';
import type { KeyState, KeyStatus, Read } from '@/lib/finance-paystack';
import { dateTime } from '@/lib/portal';

type Mode = 'test' | 'live';

const field =
  'border-border-strong min-w-[12rem] flex-1 rounded-lg border px-3 py-2 text-sm font-semibold';

/**
 * Where the Paystack secret keys are pasted. A saved key is never shown again:
 * only its last four characters. The field is emptied as soon as Save is
 * pressed, and it has no name, so a browser cannot put it in an address.
 */
export function PaystackKeys({
  status,
  webhookUrl,
  liveSwitch,
  usesSaved,
}: {
  status: Read<KeyStatus>;
  webhookUrl: string;
  /** NEXG_PAYSTACK_LIVE on this console. Read only. */
  liveSwitch: boolean;
  /** Whether this console fetches the saved keys (PAYSTACK_KEYS_TOKEN is set). */
  usesSaved: boolean;
}) {
  return (
    <>
      {status.ok ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <KeyCard mode="test" state={status.data.test} />
          <KeyCard mode="live" state={status.data.live} />
        </div>
      ) : (
        <Problem>{status.message}</Problem>
      )}
      <Sheet>
        <PanelHead title="Set Up" />
        <dl className="mt-3 space-y-3 text-sm font-semibold">
          {status.ok && (
            <div>
              <dt className="font-extrabold">One-time server password</dt>
              <dd>
                {status.data.server_token_set
                  ? 'Set in the database.'
                  : 'Not set. The owner sets it once in Supabase (docs/DEPLOY.md, section 7).'}
              </dd>
            </div>
          )}
          <div>
            <dt className="font-extrabold">This console uses</dt>
            <dd>
              {usesSaved
                ? 'The keys saved here.'
                : 'Its own environment settings, not the keys saved here (PAYSTACK_KEYS_TOKEN is not set).'}
            </dd>
          </div>
          <div>
            <dt className="font-extrabold">Webhook URL for the Paystack dashboard</dt>
            <dd className="bg-bg mt-1 select-all break-all rounded-lg px-3 py-2 font-mono text-xs">
              {webhookUrl}
            </dd>
          </div>
          <div>
            <dt className="font-extrabold">Live payments</dt>
            <dd>
              <Pill tone={liveSwitch ? 'green' : 'grey'}>
                {liveSwitch ? 'Switched on' : 'Switched off'}
              </Pill>
              <Note>
                This is the console&apos;s switch, NEXG_PAYSTACK_LIVE. The website has its own. Both
                are set in Vercel, not here.
              </Note>
            </dd>
          </div>
        </dl>
      </Sheet>
    </>
  );
}

function KeyCard({ mode, state }: { mode: Mode; state: KeyState }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [value, setValue] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [message, setMessage] = React.useState<KeyOutcome | null>(null);
  const title = mode === 'test' ? 'Test Key' : 'Live Key';

  async function act(work: () => Promise<KeyOutcome>, after?: () => void) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await work();
      setMessage(result);
      if (result.ok) {
        after?.();
        router.refresh();
      }
    } catch {
      setMessage({ ok: false, message: 'The console could not be reached. Try again.' });
    }
    setBusy(false);
  }

  function save() {
    const pasted = value;
    /* Out of the page before anything is sent, whatever the answer. */
    setValue('');
    void act(() => savePaystackKey(mode, pasted));
  }

  function remove() {
    if (!window.confirm(`Remove the ${mode} Paystack key?`)) return;
    void act(
      () => removePaystackKey(mode, reason),
      () => setReason(''),
    );
  }

  return (
    <Sheet>
      <PanelHead title={title}>
        <Pill tone={state.set ? 'green' : 'grey'}>{state.set ? 'Saved' : 'Not saved'}</Pill>
      </PanelHead>
      <p className="mt-3 text-sm font-semibold">
        {state.set
          ? `Ends ····${state.last4 ?? '—'} · saved ${dateTime(state.updated_at)}`
          : `No ${mode} key is saved.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          aria-label={`Paste the ${mode} secret key`}
          placeholder={`Paste the secret key (sk_${mode}_…)`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={field}
        />
        <button
          type="button"
          disabled={busy || value.trim() === ''}
          onClick={save}
          className="bg-ink rounded-lg px-4 py-2 text-sm font-extrabold text-white disabled:opacity-40"
        >
          Save
        </button>
      </div>
      {mode === 'live' && <Note>Saving a live key does not switch live payments on.</Note>}
      {state.set && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              aria-label={`Why the ${mode} key is being removed`}
              placeholder="Why remove it"
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={field}
            />
            <button
              type="button"
              disabled={busy || reason.trim() === ''}
              onClick={remove}
              className="border-danger text-danger rounded-lg border px-4 py-2 text-sm font-extrabold disabled:opacity-40"
            >
              Remove
            </button>
          </div>
          {mode === 'test' && (
            <Note>
              While live payments are on, removing the test key makes payment test accounts pay with
              real money.
            </Note>
          )}
        </>
      )}
      {message && (
        <p
          role="status"
          className={`mt-2 text-sm font-bold ${message.ok ? 'text-success' : 'text-danger'}`}
        >
          {message.message}
        </p>
      )}
    </Sheet>
  );
}
