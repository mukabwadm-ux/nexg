'use client';

import { Card } from '@nexg/ui';
import * as React from 'react';

import {
  approveRiderRequest,
  recordBackgroundCheck,
  recordTestTrip,
  recordTraining,
  reinstateRider,
  requestSuspension,
} from '@/app/riders/actions';

export interface RiderStageState {
  status: string;
  background: { status: string | null; note: string | null; checked_at: string | null };
  trainingPassed: boolean;
  testTrip: { outcome: string; created_at: string; notes: string | null } | null;
  /** A pending two-person suspension request, if one is waiting. */
  pendingSuspension: {
    id: string;
    reason: string | null;
    created_at: string;
    mine: boolean;
  } | null;
}

const input =
  'border-border bg-surface focus:border-gold w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none';
const primary = 'bg-gold text-ink rounded-lg px-3 py-2 text-xs font-extrabold disabled:opacity-50';
const secondary =
  'border-border rounded-lg border px-3 py-2 text-xs font-extrabold disabled:opacity-50';
const danger =
  'bg-danger rounded-lg px-3 py-2 text-xs font-extrabold text-white disabled:opacity-50';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Nairobi',
  });

function Done({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-bold text-green-800">
      {children}
    </span>
  );
}

/**
 * The applicant's pipeline steps that need a person (background check,
 * training, test delivery) and the rider's standing (suspend, approve a
 * suspension someone else asked for, reinstate). Each button calls one RPC;
 * the database holds the rules.
 */
export function RiderStagePanel({ riderId, state }: { riderId: string; state: RiderStageState }) {
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);
  const [bgNote, setBgNote] = React.useState('');
  const [tripRef, setTripRef] = React.useState('');
  const [tripNotes, setTripNotes] = React.useState('');
  const [reason, setReason] = React.useState('');

  async function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setBusy(true);
    setResult(null);
    const outcome = await action();
    setResult(outcome);
    setBusy(false);
    if (outcome.ok) {
      setBgNote('');
      setTripRef('');
      setTripNotes('');
      setReason('');
    }
  }

  const suspended = state.status === 'suspended';
  const active = state.status === 'active';

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h2 className="text-sm font-extrabold uppercase tracking-wide">Pipeline steps</h2>
        <p className="text-muted mt-1 text-xs">
          Record what rider ops checked in person. Each step moves the applicant along the Riders
          board.
        </p>
      </div>

      {/* Background check */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold">Background check</h3>
          {state.background.status === 'clear' ? (
            <Done>Clear</Done>
          ) : state.background.status === 'flagged' ? (
            <span className="bg-danger-bg text-danger rounded-full px-2.5 py-0.5 text-[11px] font-bold">
              Flagged
            </span>
          ) : null}
        </div>
        {state.background.checked_at ? (
          <p className="text-muted text-xs">
            Recorded {when(state.background.checked_at)}
            {state.background.note ? ` · ${state.background.note}` : ''}
          </p>
        ) : null}
        <input
          className={input}
          placeholder="Note (needed when flagging)"
          value={bgNote}
          onChange={(e) => setBgNote(e.target.value)}
          maxLength={500}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={primary}
            disabled={busy}
            onClick={() => run(() => recordBackgroundCheck(riderId, 'clear', bgNote))}
          >
            Mark clear
          </button>
          <button
            type="button"
            className={secondary}
            disabled={busy || !bgNote.trim()}
            onClick={() => run(() => recordBackgroundCheck(riderId, 'flagged', bgNote))}
          >
            Flag
          </button>
        </div>
      </section>

      {/* Training */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold">Training</h3>
          {state.trainingPassed ? <Done>Passed</Done> : null}
        </div>
        <p className="text-muted text-xs">Pickups and hand-offs, cash rules, safety and SOS.</p>
        {!state.trainingPassed ? (
          <button
            type="button"
            className={primary}
            disabled={busy}
            onClick={() => run(() => recordTraining(riderId, true))}
          >
            Mark training passed
          </button>
        ) : null}
      </section>

      {/* Test delivery */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold">Test delivery</h3>
          {state.testTrip?.outcome === 'passed' ? (
            <Done>Passed</Done>
          ) : state.testTrip?.outcome === 'failed' ? (
            <span className="bg-danger-bg text-danger rounded-full px-2.5 py-0.5 text-[11px] font-bold">
              Failed
            </span>
          ) : null}
        </div>
        {state.testTrip ? (
          <p className="text-muted text-xs">
            Last recorded {when(state.testTrip.created_at)}
            {state.testTrip.notes ? ` · ${state.testTrip.notes}` : ''}
          </p>
        ) : null}
        {state.testTrip?.outcome !== 'passed' ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className={input}
                placeholder="Order reference (optional)"
                value={tripRef}
                onChange={(e) => setTripRef(e.target.value)}
                maxLength={60}
              />
              <input
                className={input}
                placeholder="Notes (needed if it failed)"
                value={tripNotes}
                onChange={(e) => setTripNotes(e.target.value)}
                maxLength={500}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={primary}
                disabled={busy}
                onClick={() => run(() => recordTestTrip(riderId, true, tripRef, tripNotes))}
              >
                Passed
              </button>
              <button
                type="button"
                className={secondary}
                disabled={busy || !tripNotes.trim()}
                onClick={() => run(() => recordTestTrip(riderId, false, tripRef, tripNotes))}
              >
                Failed
              </button>
            </div>
          </>
        ) : null}
      </section>

      {/* Standing */}
      {active || suspended ? (
        <section className="border-border space-y-2 border-t pt-4">
          <h3 className="text-sm font-extrabold">Standing</h3>
          {state.pendingSuspension ? (
            <div className="bg-warning-bg rounded-lg p-3 text-xs">
              <p className="font-extrabold">Suspension waiting for a second approval</p>
              <p className="text-muted mt-1">
                Asked {when(state.pendingSuspension.created_at)}
                {state.pendingSuspension.reason ? ` · ${state.pendingSuspension.reason}` : ''}
              </p>
              {state.pendingSuspension.mine ? (
                <p className="text-muted mt-1">You asked for this, so someone else approves it.</p>
              ) : (
                <button
                  type="button"
                  className={`${danger} mt-2`}
                  disabled={busy}
                  onClick={() =>
                    run(() => approveRiderRequest(riderId, state.pendingSuspension!.id))
                  }
                >
                  Approve suspension
                </button>
              )}
            </div>
          ) : null}
          <input
            className={input}
            placeholder={suspended ? 'Why they are coming back' : 'Why (the rider is told)'}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
          {suspended ? (
            <button
              type="button"
              className={primary}
              disabled={busy || !reason.trim()}
              onClick={() => run(() => reinstateRider(riderId, reason))}
            >
              Reinstate rider
            </button>
          ) : !state.pendingSuspension ? (
            <button
              type="button"
              className={danger}
              disabled={busy || !reason.trim()}
              onClick={() => run(() => requestSuspension(riderId, reason))}
            >
              Request suspension
            </button>
          ) : null}
          <p className="text-muted text-[11px]">
            Suspending takes two people: one asks, another approves. Pay already earned is held, not
            lost.
          </p>
        </section>
      ) : null}

      {result ? (
        <p
          role="status"
          className={`text-xs font-bold ${result.ok ? 'text-success' : 'text-danger'}`}
        >
          {result.message}
        </p>
      ) : null}
    </Card>
  );
}
