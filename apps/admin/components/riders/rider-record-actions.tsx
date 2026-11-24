'use client';

import { Card } from '@nexg/ui';
import * as React from 'react';

import {
  adjustRiderCash,
  clearRiderCooldown,
  coolDownRider,
  logRiderCall,
  messageRider,
  revealRiderLocation,
  setRiderControl,
  strikeRider,
  type LiveFix,
} from '@/app/riders/actions';

/*
 * The buttons on a rider's record. Each calls one existing audited RPC
 * through a server action; the database holds the rules (a cooldown over
 * 24 h is refused, a boda cannot take large items, a big cash adjustment
 * needs a second person) and the message it refuses with is shown as is.
 */

const input =
  'border-border bg-surface focus:border-gold w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none';
const primary = 'bg-gold text-ink rounded-lg px-3 py-2 text-xs font-extrabold disabled:opacity-50';
const secondary =
  'border-border-strong hover:border-ink rounded-lg border px-3 py-2 text-xs font-extrabold disabled:opacity-50';
const danger =
  'bg-danger rounded-lg px-3 py-2 text-xs font-extrabold text-white disabled:opacity-50';

type Outcome = { ok: boolean; message: string } | null;

function useRun() {
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Outcome>(null);
  const run = async (action: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(true);
    setResult(null);
    const outcome = await action();
    setResult(outcome);
    setBusy(false);
    return outcome.ok;
  };
  return { busy, result, run };
}

function Result({ result }: { result: Outcome }) {
  if (!result) return null;
  return (
    <p role="status" className={`text-xs font-bold ${result.ok ? 'text-success' : 'text-danger'}`}>
      {result.message}
    </p>
  );
}

function Switch({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      aria-label={label}
      className={`relative inline-block h-5 w-9 shrink-0 rounded-full ${on ? 'bg-success' : 'bg-border-strong'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
          on ? 'left-[1.125rem]' : 'left-0.5'
        }`}
      />
    </span>
  );
}

export interface ControlsState {
  canReceiveOffers: boolean;
  offersPausedReason: string | null;
  largeItems: boolean;
  twoWheeler: boolean;
  cooldownUntil: string | null;
  cooldownReason: string | null;
}

/** Offers, large items, cooldown and strikes, on one card. */
export function RiderControlsCard({ riderId, state }: { riderId: string; state: ControlsState }) {
  const { busy, result, run } = useRun();
  const [reason, setReason] = React.useState('');
  const [hours, setHours] = React.useState(2);
  const [level, setLevel] = React.useState(1);
  const cooling = !!state.cooldownUntil && new Date(state.cooldownUntil) > new Date();

  const done = (ok: boolean) => ok && setReason('');

  return (
    <Card id="controls" className="scroll-mt-6 p-0">
      <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">Controls</p>
      <div className="divide-border divide-y">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-extrabold">Can receive offers</p>
            <p className="text-muted-light mt-0.5 text-[0.6875rem] font-semibold">
              {state.canReceiveOffers
                ? 'On'
                : `Paused${state.offersPausedReason ? ` · ${state.offersPausedReason}` : ''}`}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={async () =>
              done(
                await run(() =>
                  setRiderControl(riderId, 'can_receive_offers', !state.canReceiveOffers, reason),
                ),
              )
            }
            className="disabled:opacity-50"
          >
            <Switch
              on={state.canReceiveOffers}
              label={`Can receive offers: ${state.canReceiveOffers ? 'on' : 'off'}. Press to change.`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-extrabold">Large items (car only)</p>
            <p className="text-muted-light mt-0.5 text-[0.6875rem] font-semibold">
              {state.twoWheeler
                ? 'Not possible on two wheels'
                : state.largeItems
                  ? 'Eligible'
                  : 'Off'}
            </p>
          </div>
          {state.twoWheeler ? (
            <span className="opacity-40">
              <Switch on={false} label="Large items: not possible on two wheels" />
            </span>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={async () =>
                done(
                  await run(() =>
                    setRiderControl(riderId, 'large_items_eligible', !state.largeItems, reason),
                  ),
                )
              }
              className="disabled:opacity-50"
            >
              <Switch
                on={state.largeItems}
                label={`Large items: ${state.largeItems ? 'on' : 'off'}. Press to change.`}
              />
            </button>
          )}
        </div>

        <div id="cooldown" className="scroll-mt-6 space-y-2 px-4 py-3">
          <p className="text-[0.8125rem] font-extrabold">Cooldown</p>
          <p className="text-muted-light text-[0.6875rem] font-semibold">
            {cooling
              ? `Until ${new Date(state.cooldownUntil!).toLocaleString('en-KE', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Africa/Nairobi',
                })}${state.cooldownReason ? ` · ${state.cooldownReason}` : ''}`
              : 'Not on cooldown. Up to 24 h; longer is a suspension.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-muted flex items-center gap-1.5 text-xs font-bold">
              Hours
              <input
                type="number"
                min={1}
                max={24}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className={`${input} w-20`}
              />
            </label>
            <button
              type="button"
              disabled={busy || !reason.trim()}
              onClick={async () => done(await run(() => coolDownRider(riderId, hours, reason)))}
              className={secondary}
            >
              Put on cooldown
            </button>
            {cooling && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => done(await run(() => clearRiderCooldown(riderId, reason)))}
                className={secondary}
              >
                Clear cooldown
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2 px-4 py-3">
          <p className="text-[0.8125rem] font-extrabold">Strike</p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-muted flex items-center gap-1.5 text-xs font-bold">
              Level
              <select
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
                className={`${input} w-20`}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
            <button
              type="button"
              disabled={busy || !reason.trim()}
              onClick={async () => done(await run(() => strikeRider(riderId, level, reason)))}
              className={danger}
            >
              Issue strike
            </button>
          </div>
        </div>

        <div className="space-y-2 px-4 py-3">
          <label className="block">
            <span className="text-muted text-xs font-bold">
              Reason (needed to pause, cool down or strike; the rider can read it)
            </span>
            <input
              className={`${input} mt-1`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
            />
          </label>
          <Result result={result} />
        </div>
      </div>
    </Card>
  );
}

/** Coordinates only on request, with a reason when they are not on a trip. */
export function RevealLocation({ riderId, onTrip }: { riderId: string; onTrip: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [fix, setFix] = React.useState<LiveFix | null>(null);

  return (
    <div className="space-y-2">
      {!onTrip && (
        <input
          className={input}
          placeholder="Why do you need their location? (logged)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
        />
      )}
      <button
        type="button"
        disabled={busy || (!onTrip && !reason.trim())}
        onClick={async () => {
          setBusy(true);
          setFix(await revealRiderLocation(riderId, reason));
          setBusy(false);
        }}
        className={secondary}
      >
        Show live location
      </button>
      {fix && !fix.ok && <p className="text-danger text-xs font-bold">{fix.message}</p>}
      {fix?.ok && fix.lat !== undefined && fix.lng !== undefined && (
        <p className="text-xs font-bold">
          {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)}
          {fix.at &&
            ` · ${new Date(fix.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}{' '}
          ·{' '}
          <a
            href={`https://www.google.com/maps?q=${fix.lat},${fix.lng}`}
            target="_blank"
            rel="noreferrer"
            className="text-gold-text underline"
          >
            Open map
          </a>
          <span className="text-muted-light block font-semibold">{fix.message}</span>
        </p>
      )}
    </div>
  );
}

/** A cash correction, in KES; negative takes cash off what they hold. */
export function CashAdjustForm({ riderId }: { riderId: string }) {
  const { busy, result, run } = useRun();
  const [amount, setAmount] = React.useState('');
  const [reason, setReason] = React.useState('');
  const value = Number(amount);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          type="number"
          inputMode="numeric"
          className={`${input} w-32`}
          placeholder="KES ±"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          className={`${input} min-w-0 flex-1`}
          placeholder="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
        />
        <button
          type="button"
          disabled={busy || !value || !reason.trim()}
          onClick={async () => {
            if (await run(() => adjustRiderCash(riderId, Math.round(value), reason))) {
              setAmount('');
              setReason('');
            }
          }}
          className={primary}
        >
          Adjust cash
        </button>
      </div>
      <Result result={result} />
    </div>
  );
}

/** Reply in the rider's thread, or write down a phone call. */
export function MessageComposer({ riderId }: { riderId: string }) {
  const { busy, result, run } = useRun();
  const [body, setBody] = React.useState('');

  return (
    <div className="space-y-2">
      <textarea
        className={`${input} min-h-20`}
        placeholder="Write to the rider"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={1000}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !body.trim()}
          onClick={async () => {
            if (await run(() => messageRider(riderId, body))) setBody('');
          }}
          className={primary}
        >
          Send
        </button>
        <button
          type="button"
          disabled={busy || !body.trim()}
          onClick={async () => {
            if (await run(() => logRiderCall(riderId, body))) setBody('');
          }}
          className={secondary}
        >
          Log a call instead
        </button>
      </div>
      <p className="text-muted-light text-[0.6875rem] font-semibold">
        Shows in their Messages on the rider portal. No SMS or WhatsApp is sent.
      </p>
      <Result result={result} />
    </div>
  );
}
