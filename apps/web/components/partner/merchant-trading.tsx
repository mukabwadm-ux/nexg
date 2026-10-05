'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { setAcceptingOrders, setBusyMode, setPrep, type Outcome } from '@/app/merchant/actions';

import { Panel } from './bits';

const BUSY = [20, 40, 60];

/**
 * The three switches a kitchen actually reaches for.
 *
 * Closing and busy mode are different answers to the same pressure
 * and the screen says which is which: busy keeps you taking orders
 * and tells guests to expect longer, closing stops them arriving.
 * A merchant who only has "closed" uses it for both, and loses the
 * trade.
 *
 * Each needs a reason. Not bureaucracy — the reason is what Support
 * reads when a guest asks why their order was refused at 20:40.
 */
export function Trading({
  merchantId,
  accepting,
  busyUntil,
  prepMinutes,
  status,
}: {
  merchantId: string;
  accepting: boolean;
  busyUntil: string | null;
  prepMinutes: number | null;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [said, setSaid] = React.useState<Outcome | null>(null);
  const [open, setOpen] = React.useState<'close' | 'busy' | 'prep' | null>(null);
  const [reason, setReason] = React.useState('');
  const [prep, setPrepValue] = React.useState(prepMinutes ?? 25);

  const run = async (fn: () => Promise<Outcome>) => {
    setBusy(true);
    setSaid(null);
    const r = await fn();
    setSaid(r);
    setBusy(false);
    if (r.ok) {
      setOpen(null);
      setReason('');
      router.refresh();
    }
  };

  const busyOn = busyUntil !== null && new Date(busyUntil) > new Date();

  if (status !== 'live') {
    return (
      <Panel title="Taking orders" note={`Your account is ${status}`}>
        <p className="text-muted text-[0.8125rem] font-semibold">
          These switches appear once you are live. Nothing is lost in the meantime — what you have
          set up is on file.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Taking orders"
      note={
        busyOn
          ? `Busy until ${new Date(busyUntil!).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Africa/Nairobi',
            })}`
          : accepting
            ? 'Open'
            : 'Closed'
      }
    >
      {said && (
        <p
          role="status"
          className={`mb-3 rounded-lg px-3 py-2 text-[0.75rem] font-bold ${
            said.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
          }`}
        >
          {said.message ?? (said.ok ? 'Done.' : 'That did not work.')}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {accepting ? (
          <>
            <button
              type="button"
              onClick={() => setOpen(open === 'busy' ? null : 'busy')}
              className="border-border-strong hover:border-ink rounded-lg border px-3 py-2 text-[0.8125rem] font-extrabold"
            >
              {busyOn ? 'Change busy mode' : 'Busy — quote longer'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(open === 'close' ? null : 'close')}
              className="border-danger text-danger hover:bg-danger-bg rounded-lg border px-3 py-2 text-[0.8125rem] font-extrabold"
            >
              Stop taking orders
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => setAcceptingOrders(merchantId, true, 'open again'))}
            className="bg-ink rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold text-white disabled:opacity-40"
          >
            {busy ? 'Opening…' : 'Start taking orders'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(open === 'prep' ? null : 'prep')}
          className="border-border-strong hover:border-ink rounded-lg border px-3 py-2 text-[0.8125rem] font-extrabold"
        >
          Prep time · {prepMinutes ?? '[—]'} min
        </button>
      </div>

      {open === 'close' && (
        <div className="bg-bg mt-3 space-y-2 rounded-xl p-3">
          <p className="text-[0.8125rem] font-semibold">
            Guests will still see you, but they will not be able to order. If it is only that the
            kitchen is backed up, busy mode keeps the trade and tells them to expect longer.
          </p>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why — Support reads this when a guest asks"
            className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
          />
          <button
            type="button"
            disabled={busy || !reason.trim()}
            onClick={() => run(() => setAcceptingOrders(merchantId, false, reason))}
            className="bg-danger rounded-lg px-3 py-2 text-[0.8125rem] font-extrabold text-white disabled:opacity-40"
          >
            {busy ? 'Closing…' : 'Stop taking orders'}
          </button>
        </div>
      )}

      {open === 'busy' && (
        <div className="bg-bg mt-3 space-y-2 rounded-xl p-3">
          <p className="text-[0.8125rem] font-semibold">
            Guests keep ordering and are quoted longer. It ends by itself.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {BUSY.map((m) => (
              <button
                key={m}
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() => setBusyMode(merchantId, m, reason || 'kitchen is backed up'))
                }
                className="border-border-strong hover:border-ink rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-40"
              >
                +{m} min
              </button>
            ))}
            {busyOn && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => setBusyMode(merchantId, null, 'caught up'))}
                className="text-[0.75rem] font-extrabold underline underline-offset-4 disabled:opacity-40"
              >
                We have caught up
              </button>
            )}
          </div>
        </div>
      )}

      {open === 'prep' && (
        <div className="bg-bg mt-3 space-y-2 rounded-xl p-3">
          <p className="text-[0.8125rem] font-semibold">
            This is what the guest is quoted, so it has to be one you can keep. Too low and every
            order is late; too high and fewer people order.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={5}
              max={120}
              value={prep}
              onChange={(e) => setPrepValue(Number(e.target.value))}
              className="border-border-strong w-24 rounded-lg border px-3 py-2 text-[0.8125rem] font-bold tabular-nums"
            />
            <span className="text-[0.8125rem] font-semibold">minutes</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => setPrep(merchantId, prep, null))}
              className="bg-ink rounded-lg px-3 py-2 text-[0.8125rem] font-extrabold text-white disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
