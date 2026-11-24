'use client';

import { Button, Input } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  decidePreset,
  requestPreset,
  withdrawPreset,
  type PresetResult,
} from '@/app/finance/payout-rules/preset-actions';
import {
  checkTiers,
  MAX_TIERS,
  type CancellationPreset,
  type CancellationPresets,
  type PresetTier,
} from '@/lib/cancellation-presets';

const TITLE: Record<CancellationPreset['preset'], string> = {
  flexible: 'Flexible',
  moderate: 'Moderate',
  strict: 'Strict',
};

const field =
  'border-border-strong w-20 rounded-lg border px-2 py-1.5 text-[0.75rem] font-semibold';

const day = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

/**
 * The preset cancellation policies hosts choose from. NexG edits them here;
 * a second person (full Finance) approves; new holds use the approved tiers,
 * and stays already booked keep the tiers they were booked with.
 *
 * Who may ask and decide, the tier checks and the audit live in
 * rpc_cancellation_preset_*; this only shows them and asks.
 */
export function CancellationPresetsPanel({ data }: { data: CancellationPresets | null }) {
  if (!data) {
    return (
      <p className="text-muted mt-2 text-[0.8125rem] font-semibold">
        The preset cancellation policies could not be read.
      </p>
    );
  }
  return (
    <div className="mt-4">
      <p className="text-[0.8125rem] font-extrabold">Preset cancellation policies</p>
      <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.7]">
        Hosts choose one of these for each property. A change needs a second person to approve it.
        New stays use the approved policy; stays already booked keep the one they were booked with.
      </p>
      {data.presets.length === 0 ? (
        <p className="text-muted mt-3 text-[0.75rem] font-semibold">No presets to show.</p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {data.presets.map((p) => (
            <PresetRow
              key={p.preset}
              preset={p}
              canRequest={data.canRequest}
              canDecide={data.canDecide}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TierList({ tiers }: { tiers: PresetTier[] }) {
  return (
    <ul className="mt-1 grid gap-0.5 text-[0.6875rem] font-semibold">
      {tiers.map((t) => (
        <li key={t.days_before}>
          {t.days_before === 0
            ? 'Up to check-in'
            : `${t.days_before} day${t.days_before === 1 ? '' : 's'} or more before check-in`}
          : {t.refund_pct}% back
        </li>
      ))}
    </ul>
  );
}

function PresetRow({
  preset,
  canRequest,
  canDecide,
}: {
  preset: CancellationPreset;
  canRequest: boolean;
  canDecide: boolean;
}) {
  const router = useRouter();
  const start = () =>
    preset.tiers.map((t) => ({ days: String(t.days_before), pct: String(t.refund_pct) }));
  const [open, setOpen] = React.useState(false);
  const [rows, setRows] = React.useState(start);
  const [reason, setReason] = React.useState('');
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  const run = async (work: () => Promise<PresetResult>, after?: () => void) => {
    setBusy(true);
    const r = await work();
    setBusy(false);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) {
      after?.();
      router.refresh();
    }
  };

  const setRow = (i: number, key: 'days' | 'pct', value: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  const checked = checkTiers(rows);
  const pending = preset.pending;
  const approved = day(preset.approvedAt);

  return (
    <li className="border-border rounded-lg border p-3">
      <p className="text-[0.8125rem] font-extrabold">{TITLE[preset.preset]}</p>
      {preset.text && (
        <p className="text-muted mt-0.5 text-[0.75rem] font-semibold leading-[1.7]">
          {preset.text}
        </p>
      )}
      <TierList tiers={preset.tiers} />
      {approved && (
        <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold">Approved {approved}</p>
      )}

      {pending && (
        <div className="border-border mt-3 rounded-lg border p-3">
          <p className="text-[0.75rem] font-extrabold">
            Change waiting for approval
            {pending.requestedByName ? ` · asked by ${pending.requestedByName}` : ''}
          </p>
          {pending.text && (
            <p className="text-muted mt-0.5 text-[0.75rem] font-semibold leading-[1.7]">
              {pending.text}
            </p>
          )}
          <TierList tiers={pending.tiers} />
          {pending.reason && (
            <p className="mt-1 text-[0.75rem] leading-[1.7]">Why: {pending.reason}</p>
          )}
          {canDecide && !pending.mine && (
            <div className="mt-2 grid gap-2">
              <Input
                id={`preset_note_${pending.id}`}
                label="Note (optional)"
                maxLength={1000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => decidePreset(pending.id, true, note),
                      () => setNote(''),
                    )
                  }
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => decidePreset(pending.id, false, note),
                      () => setNote(''),
                    )
                  }
                >
                  Reject
                </Button>
              </div>
            </div>
          )}
          {pending.mine && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => run(() => withdrawPreset(pending.id))}
              >
                Withdraw
              </Button>
              <p className="text-muted text-[0.6875rem] font-semibold">
                You asked for this, so somebody else has to approve it.
              </p>
            </div>
          )}
        </div>
      )}

      {canRequest && !pending && !open && (
        <div className="mt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setRows(start());
              setMsg(null);
              setOpen(true);
            }}
          >
            Change
          </Button>
        </div>
      )}

      {canRequest && !pending && open && (
        <div className="mt-3 grid gap-2">
          <p className="text-muted text-[0.6875rem] font-semibold leading-[1.7]">
            Each step says how much a guest gets back for cancelling that many days or more before
            check-in. Up to {MAX_TIERS} steps. The last step is 0 days, so every day has an answer.
          </p>
          {rows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-[0.75rem] font-semibold">
              <input
                aria-label={`Step ${i + 1}: days before check-in`}
                inputMode="numeric"
                value={r.days}
                onChange={(e) => setRow(i, 'days', e.target.value)}
                className={field}
              />
              <span>days before check-in:</span>
              <input
                aria-label={`Step ${i + 1}: percent back`}
                inputMode="numeric"
                value={r.pct}
                onChange={(e) => setRow(i, 'pct', e.target.value)}
                className={field}
              />
              <span>% back</span>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  className="text-danger text-[0.6875rem] font-extrabold"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {rows.length < MAX_TIERS && (
            <div>
              <button
                type="button"
                onClick={() => setRows((rs) => [...rs, { days: '', pct: '' }])}
                className="text-ink text-[0.75rem] font-extrabold underline"
              >
                Add a step
              </button>
            </div>
          )}
          {!checked.ok && (
            <p className="text-danger text-[0.6875rem] font-bold">{checked.message}</p>
          )}
          <Input
            id={`preset_reason_${preset.preset}`}
            label="Why it changes"
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || !checked.ok || reason.trim() === ''}
              onClick={() =>
                run(
                  () => requestPreset(preset.preset, rows, reason),
                  () => {
                    setOpen(false);
                    setReason('');
                  },
                )
              }
            >
              {busy ? 'Sending…' : 'Ask for approval'}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {msg && (
        <p
          role="status"
          className={`mt-2 text-[0.75rem] font-bold ${msg.ok ? 'text-success' : 'text-danger'}`}
        >
          {msg.text}
        </p>
      )}
    </li>
  );
}
