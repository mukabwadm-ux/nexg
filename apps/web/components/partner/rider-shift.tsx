'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { goOnline, type Outcome } from '@/app/rider/actions';

import { Panel, ago } from './bits';

/**
 * On or off shift.
 *
 * The big switch, because it is the one a rider uses most and
 * usually with cold hands. Going off asks for a reason only when
 * they want to give one — a rider finishing their evening does not
 * owe anybody an explanation, and a required field here would just
 * train people to type a full stop.
 */
export function Shift({
  presence,
  status,
  canReceive,
  pausedReason,
  cooldownUntil,
  since,
}: {
  presence: string;
  status: string;
  canReceive: boolean;
  pausedReason: string | null;
  cooldownUntil: string | null;
  since: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [said, setSaid] = React.useState<Outcome | null>(null);
  const [reason, setReason] = React.useState('');
  const [asking, setAsking] = React.useState(false);

  const run = async (online: boolean, why: string) => {
    setBusy(true);
    setSaid(null);
    const r = await goOnline(online, why);
    setSaid(r);
    setBusy(false);
    if (r.ok) {
      setAsking(false);
      setReason('');
      router.refresh();
    }
  };

  const onTrip = presence === 'on_trip';
  const online = presence === 'online';
  const cooling = cooldownUntil !== null && new Date(cooldownUntil) > new Date();
  const pausedByStaff = !canReceive && !online && pausedReason !== 'off shift';

  if (status !== 'active') {
    return (
      <Panel title="Going online" note={`Your account is ${status}`}>
        <p className="text-muted text-[0.8125rem] font-semibold">
          The switch appears once your account is active. Nothing you have sent is lost in the
          meantime.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title={onTrip ? 'You are on a trip' : online ? 'You are on' : 'You are off'}
      note={since ? `since ${ago(since)}` : undefined}
    >
      {said && (
        <p
          role="status"
          className={`mb-3 rounded-lg px-3 py-2 text-[0.8125rem] font-bold ${
            said.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
          }`}
        >
          {said.message}
        </p>
      )}

      {onTrip ? (
        <p className="text-muted text-[0.8125rem] font-semibold">
          Finish what you are carrying first. You can go off once it is delivered — somebody is
          waiting for this one.
        </p>
      ) : online ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => (asking ? run(false, reason) : setAsking(true))}
            className="border-danger text-danger hover:bg-danger-bg w-full rounded-xl border-2 py-4 text-[1rem] font-extrabold disabled:opacity-40"
          >
            {busy ? 'Going off…' : asking ? 'Confirm — go off shift' : 'Go off shift'}
          </button>
          {asking && (
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Anything we should know (optional)"
              className="border-border-strong mt-2 w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
            />
          )}
        </>
      ) : cooling ? (
        <p className="text-danger text-[0.8125rem] font-bold">
          You are on a cooldown until{' '}
          {new Date(cooldownUntil!).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Africa/Nairobi',
          })}
          . It lifts by itself.
        </p>
      ) : pausedByStaff ? (
        <div>
          <p className="text-danger text-[0.8125rem] font-bold">
            Offers are paused on your account by the team
            {pausedReason ? ` · ${pausedReason}` : ''}.
          </p>
          <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
            This is not something the switch can undo. Message us and we will sort it.
          </p>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(true, '')}
          className="bg-ink w-full rounded-xl py-4 text-[1rem] font-extrabold text-white disabled:opacity-40"
        >
          {busy ? 'Going on…' : 'Go on shift'}
        </button>
      )}
    </Panel>
  );
}
