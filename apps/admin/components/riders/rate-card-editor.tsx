'use client';

import { Card } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { discardRateCardDraft, publishRateCard, saveRateCardDraft } from '@/app/riders/actions';

import type { RateCardRow } from './tabs';

export interface DraftCard extends RateCardRow {
  city_id: string;
  approved_by: string | null;
}

const FIELDS = [
  { key: 'base_per_trip_kes', label: 'Base per trip', required: true },
  { key: 'per_km_after_2km_kes', label: 'Per km after 2 km', required: true },
  { key: 'paid_waiting_per_5min_kes', label: 'Paid waiting after 10 min, per 5 min' },
  { key: 'second_pickup_bonus_kes', label: 'Second pickup bonus' },
  { key: 'peak_bonus_dinner_kes', label: 'Dinner peak bonus' },
  { key: 'peak_bonus_rain_kes', label: 'Rain bonus' },
  { key: 'cancellation_after_pickup_kes', label: 'Cancelled after pickup' },
] as const;

type FieldKey = (typeof FIELDS)[number]['key'];

/**
 * Write the rider rate card and take it live.
 *
 * Saving keeps one draft per city (rpc_rate_card_draft_save). Publishing
 * is the existing two-person rpc_rate_card_publish: the first press
 * approves, a different person's press makes it the city's current card.
 * Changing a draft clears the first approval. What a delivered trip pays
 * is worked out from the current card (fn_rider_trip_pay); with no card a
 * delivery writes no earning, so this is what lets riders be paid.
 */
export function RateCardEditor({
  cities,
  current,
  draft,
  staffId,
}: {
  cities: { id: string; name: string }[];
  current: RateCardRow | null;
  draft: DraftCard | null;
  staffId: string;
}) {
  const router = useRouter();
  const seed = draft ?? current;
  const [cityId, setCityId] = React.useState(draft?.city_id ?? cities[0]?.id ?? '');
  const [version, setVersion] = React.useState(
    draft?.version ?? new Date().toISOString().slice(0, 7),
  );
  const [from, setFrom] = React.useState(
    (draft?.effective_from ?? new Date().toISOString()).slice(0, 10),
  );
  const [values, setValues] = React.useState<Record<FieldKey, string>>(() => {
    const v = {} as Record<FieldKey, string>;
    for (const f of FIELDS) {
      const n = seed?.[f.key];
      v[f.key] = n == null ? '' : String(n);
    }
    return v;
  });
  const [tips, setTips] = React.useState(String(seed?.guest_tips_pass_through_pct ?? 100));
  const [busy, setBusy] = React.useState(false);
  const [said, setSaid] = React.useState<{ ok: boolean; message: string } | null>(null);

  const num = (s: string) => (s.trim() === '' ? null : Math.round(Number(s)));
  const approvedByMe = !!draft?.approved_by && draft.approved_by === staffId;

  async function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    setBusy(true);
    setSaid(null);
    const r = await fn();
    setBusy(false);
    setSaid(r);
    if (r.ok) router.refresh();
  }

  return (
    <Card className="p-5">
      <p className="text-[0.9375rem] font-extrabold">
        {draft ? `Draft rate card · ${draft.version}` : 'New rate card'}
      </p>
      <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-relaxed">
        Amounts in KES. Base and per-km are required. Two different people approve before it goes
        live.
      </p>

      <form
        className="mt-3 space-y-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() =>
            saveRateCardDraft({
              cityId,
              version,
              effectiveFrom: new Date(`${from}T00:00:00+03:00`).toISOString(),
              basePerTrip: num(values.base_per_trip_kes) ?? 0,
              perKmAfter2km: num(values.per_km_after_2km_kes) ?? -1,
              paidWaitingPer5min: num(values.paid_waiting_per_5min_kes),
              secondPickupBonus: num(values.second_pickup_bonus_kes),
              peakBonusDinner: num(values.peak_bonus_dinner_kes),
              peakBonusRain: num(values.peak_bonus_rain_kes),
              cancellationAfterPickup: num(values.cancellation_after_pickup_kes),
              tipsPassThroughPct: num(tips) ?? 100,
            }),
          );
        }}
      >
        <Row label="City">
          <select
            value={cityId}
            onChange={(e) => setCityId(e.target.value)}
            disabled={!!draft}
            className={input}
          >
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Version">
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            maxLength={40}
            className={input}
          />
        </Row>
        <Row label="Takes effect">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={input}
          />
        </Row>
        {FIELDS.map((f) => (
          <Row key={f.key} label={`${f.label}${'required' in f ? ' *' : ''}`}>
            <input
              inputMode="numeric"
              value={values[f.key]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.key]: e.target.value.replace(/[^0-9]/g, '') }))
              }
              placeholder={'required' in f ? 'KES' : 'none'}
              className={input}
            />
          </Row>
        ))}
        <Row label="Guest tips to rider (%)">
          <input
            inputMode="numeric"
            value={tips}
            onChange={(e) => setTips(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
            className={input}
          />
        </Row>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="submit"
            disabled={busy || !values.base_per_trip_kes || values.per_km_after_2km_kes === ''}
            className="bg-ink rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold text-white disabled:opacity-40"
          >
            {busy ? 'Saving…' : draft ? 'Save changes' : 'Save draft'}
          </button>
          {draft ? (
            <>
              <button
                type="button"
                disabled={busy || approvedByMe}
                onClick={() => void run(() => publishRateCard(draft.id))}
                className="bg-gold text-ink rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold disabled:opacity-40"
              >
                {draft.approved_by ? 'Approve and publish' : 'Approve'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => discardRateCardDraft(draft.id))}
                className="border-border-strong rounded-lg border px-3 py-2 text-[0.75rem] font-extrabold disabled:opacity-40"
              >
                Discard draft
              </button>
            </>
          ) : null}
        </div>
        {draft ? (
          <p className="text-muted text-[0.75rem] font-semibold">
            {approvedByMe
              ? 'You approved this draft. A second person publishes it.'
              : draft.approved_by
                ? 'Approved once. Your approval publishes it.'
                : 'Not approved yet.'}
          </p>
        ) : null}
        {said ? (
          <p
            role={said.ok ? 'status' : 'alert'}
            className={`text-[0.75rem] font-bold ${said.ok ? 'text-success' : 'text-danger'}`}
          >
            {said.message}
          </p>
        ) : null}
      </form>
    </Card>
  );
}

const input =
  'border-border-strong w-full rounded-lg border px-2.5 py-1.5 text-right text-[0.8125rem] font-bold tabular-nums';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-3">
      <span className="text-[0.75rem] font-semibold">{label}</span>
      {children}
    </label>
  );
}
