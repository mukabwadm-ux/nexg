'use client';

import { Pause, Play, Plus, Square } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { savePromotion, setPromotionStatus, type Outcome } from '@/app/merchant/actions';

export interface PromotionRow {
  id: string;
  name: string;
  kind: 'percent' | 'amount';
  value: number;
  catalogue_item_id: string | null;
  starts_at: string;
  ends_at: string | null;
  status: 'active' | 'paused' | 'ended';
}

export interface PromotableItem {
  id: string;
  name: string;
  price_kes: number;
}

const kes = (value: number) => 'KES ' + value.toLocaleString('en-KE');

/* datetime-local wants local time without a zone; the database wants a zone. */
function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}
function when(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  });
}

/** What the promotion does, in the words a guest would read. */
export function promotionBenefit(row: Pick<PromotionRow, 'kind' | 'value'>) {
  return row.kind === 'percent' ? `${row.value}% off` : `${kes(row.value)} off`;
}

function stateOf(row: PromotionRow, now: number) {
  if (row.status === 'ended' || (row.ends_at && Date.parse(row.ends_at) <= now)) return 'Ended';
  if (row.status === 'paused') return 'Paused';
  if (Date.parse(row.starts_at) > now) return 'Scheduled';
  return 'Running';
}

const TONE: Record<string, string> = {
  Running: 'bg-success-bg text-success',
  Scheduled: 'bg-info-bg text-info',
  Paused: 'bg-gold-soft text-gold-text',
  Ended: 'bg-bg text-muted',
};

const EMPTY = {
  promotionId: null as string | null,
  name: '',
  kind: 'percent' as 'percent' | 'amount',
  value: '10',
  itemId: '',
  startsAt: '',
  endsAt: '',
};

/**
 * Create, change, pause, resume and end promotions. A running promotion
 * lowers the price on the store and product pages, and checkout charges
 * the lower price: both come from the same database function.
 */
export function PromotionManager({
  promotions,
  items,
}: {
  promotions: PromotionRow[] | null;
  items: PromotableItem[];
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<typeof EMPTY | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [said, setSaid] = React.useState<Outcome | null>(null);
  const now = Date.now();
  const itemName = (id: string | null) =>
    id ? (items.find((item) => item.id === id)?.name ?? 'An item') : 'Everything in your catalogue';

  const selected = draft?.itemId ? items.find((item) => item.id === draft.itemId) : undefined;
  const previewPrice =
    selected && draft
      ? Math.max(
          1,
          draft.kind === 'percent'
            ? Math.floor((selected.price_kes * (100 - Number(draft.value || 0))) / 100)
            : selected.price_kes - Number(draft.value || 0),
        )
      : null;

  async function run(fn: () => Promise<Outcome>) {
    setBusy(true);
    setSaid(null);
    try {
      const outcome = await fn();
      setSaid(outcome);
      if (outcome.ok) {
        setDraft(null);
        router.refresh();
      }
    } catch {
      setSaid({ ok: false, message: 'That did not save. Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    void run(() =>
      savePromotion({
        promotionId: draft.promotionId,
        name: draft.name,
        kind: draft.kind,
        value: Number(draft.value),
        itemId: draft.itemId || null,
        startsAt: fromLocalInput(draft.startsAt),
        endsAt: fromLocalInput(draft.endsAt),
      }),
    );
  }

  return (
    <section className="pm-panel" id="your-promotions" aria-labelledby="your-promotions-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="your-promotions-title">Your promotions</h2>
          <p className="pm-lead">
            Discounts on one item or your whole catalogue. Guests see the lower price on your store
            and pay it at checkout.
          </p>
        </div>
        {!draft && (
          <button
            type="button"
            className="pm-button pm-primary"
            onClick={() => {
              setSaid(null);
              setDraft({ ...EMPTY });
            }}
          >
            <Plus size={16} aria-hidden /> Create promotion
          </button>
        )}
      </div>

      {said && (
        <p
          role="status"
          className={`mt-3 rounded-lg px-3 py-2 text-[0.8125rem] font-bold ${
            said.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
          }`}
        >
          {said.message}
        </p>
      )}

      {draft && (
        <form onSubmit={submit} className="pm-fields mt-4" aria-label="Promotion details">
          <label>
            Promotion name
            <input
              required
              maxLength={80}
              placeholder="Weekend special"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Applies to
            <select
              value={draft.itemId}
              onChange={(e) => setDraft({ ...draft, itemId: e.target.value })}
            >
              <option value="">Everything in your catalogue</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {kes(item.price_kes)}
                </option>
              ))}
            </select>
          </label>
          <div className="pm-two">
            <label>
              Discount
              <select
                value={draft.kind}
                onChange={(e) =>
                  setDraft({ ...draft, kind: e.target.value as 'percent' | 'amount' })
                }
              >
                <option value="percent">Percentage off</option>
                <option value="amount">Amount off (KES)</option>
              </select>
            </label>
            <label>
              {draft.kind === 'percent' ? 'Percent off (1–90)' : 'KES off'}
              <input
                required
                type="number"
                inputMode="numeric"
                min={1}
                max={draft.kind === 'percent' ? 90 : undefined}
                step={1}
                value={draft.value}
                onChange={(e) => setDraft({ ...draft, value: e.target.value })}
              />
            </label>
          </div>
          <div className="pm-two">
            <label>
              Starts
              <input
                type="datetime-local"
                value={draft.startsAt}
                onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })}
              />
              <span className="pm-muted text-[0.75rem]">Leave empty to start now.</span>
            </label>
            <label>
              Ends
              <input
                type="datetime-local"
                value={draft.endsAt}
                onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })}
              />
              <span className="pm-muted text-[0.75rem]">Leave empty to run until you end it.</span>
            </label>
          </div>
          {selected && previewPrice !== null && (
            <p className="pm-note">
              {selected.name}: <s>{kes(selected.price_kes)}</s> <strong>{kes(previewPrice)}</strong>{' '}
              while it runs.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="pm-button pm-primary" disabled={busy}>
              {busy ? 'Saving…' : draft.promotionId ? 'Save changes' : 'Start promotion'}
            </button>
            <button
              type="button"
              className="pm-button"
              disabled={busy}
              onClick={() => setDraft(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {promotions === null ? (
        <div className="pm-empty" role="alert">
          <strong>Promotions could not be loaded</strong>
          <p>Reload the page to try again.</p>
        </div>
      ) : promotions.length === 0 ? (
        !draft && (
          <div className="pm-empty">
            <strong>No promotions yet</strong>
            <p>Create one to put a discount on an item or your whole catalogue.</p>
          </div>
        )
      ) : (
        <ul className="divide-border mt-4 divide-y">
          {promotions.map((row) => {
            const state = stateOf(row, now);
            return (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-extrabold">
                    {row.name}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${TONE[state]}`}
                    >
                      {state}
                    </span>
                  </p>
                  <p className="pm-muted text-[0.8125rem]">
                    {promotionBenefit(row)} · {itemName(row.catalogue_item_id)} · from{' '}
                    {when(row.starts_at)}
                    {row.ends_at ? ` to ${when(row.ends_at)}` : ', no end date'}
                  </p>
                </div>
                {state !== 'Ended' && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="pm-button"
                      disabled={busy}
                      onClick={() =>
                        setDraft({
                          promotionId: row.id,
                          name: row.name,
                          kind: row.kind,
                          value: String(row.value),
                          itemId: row.catalogue_item_id ?? '',
                          startsAt: toLocalInput(row.starts_at),
                          endsAt: toLocalInput(row.ends_at),
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="pm-button"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          setPromotionStatus(row.id, row.status === 'paused' ? 'active' : 'paused'),
                        )
                      }
                    >
                      {row.status === 'paused' ? (
                        <>
                          <Play size={14} aria-hidden /> Resume
                        </>
                      ) : (
                        <>
                          <Pause size={14} aria-hidden /> Pause
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="pm-button"
                      disabled={busy}
                      onClick={() => void run(() => setPromotionStatus(row.id, 'ended'))}
                    >
                      <Square size={14} aria-hidden /> End
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
