'use client';

import {
  Bed,
  Car,
  Lock,
  PartyPopper,
  Plus,
  Repeat2,
  Sun,
  Ticket,
  UtensilsCrossed,
} from 'lucide-react';
import * as React from 'react';

import {
  DASH,
  hhmm,
  kes,
  keslabel,
  MOOD_COLOUR,
  MOOD_LABEL,
  type PlanBlock,
  type PlanView,
} from './types';

/**
 * The right-hand column of the builder artboard: the black budget card and
 * the day under it.
 *
 * Every number here comes from the database. Where one has not been set —
 * a component with no price, a concierge fee with no rule — it renders
 * [—], which is what the artboard itself draws (ground rule 3). The bar
 * fills with what is actually known and no further.
 */

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  activity: Sun,
  meal: UtensilsCrossed,
  venue: PartyPopper,
  transport: Car,
  stay: Bed,
  event: Ticket,
  free: Sun,
};

export function BudgetCard({ view }: { view: PlanView }) {
  const { plan, totals } = view;
  const budget = plan.budget_kes;
  const spend = plan.estimate_total_kes ?? 0;
  const over = budget !== null && spend > budget;
  const spare = budget === null ? null : Math.abs(budget - spend);

  const segments = Object.entries(totals).filter(([, v]) => v > 0);
  const scale = budget && budget > 0 ? budget : spend || 1;

  /* The one suggestion the artboard shows when a day is over: the cheapest
     swap available, named, rather than "reduce your selections". */
  const suggestion = React.useMemo(() => {
    if (!over) return null;
    let best: { from: string; to: string; saves: number } | null = null;
    for (const block of view.blocks) {
      for (const swap of block.swaps) {
        if (swap.direction !== 'cheaper') continue;
        const saves = -swap.delta_kes;
        if (!best || saves > best.saves) {
          best = { from: block.title_snapshot, to: swap.title, saves };
        }
      }
    }
    return best;
  }, [over, view.blocks]);

  return (
    <div className="bg-ink rounded-2xl p-5 text-white">
      <p className="text-[0.5625rem] font-extrabold uppercase tracking-[0.18em] text-white/45">
        Budget
      </p>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-2xl font-extrabold tracking-tight">
          {keslabel(plan.estimate_total_kes)}
          <span className="ml-1.5 text-sm font-bold text-white/55">of {keslabel(budget)}</span>
        </p>
        <span
          className={`rounded-full px-3 py-1 text-xs font-extrabold ${
            over ? 'bg-warning-bg text-warning' : 'bg-success-bg text-success'
          }`}
        >
          {keslabel(spare)} {over ? 'over' : 'to spare'}
        </span>
      </div>

      {/* The bar, coloured by mood, in the artboard's legend order. */}
      <div className="bg-white/12 mt-3 flex h-2.5 w-full overflow-hidden rounded-full">
        {segments.map(([mood, amount]) => (
          <span
            key={mood}
            title={`${MOOD_LABEL[mood] ?? mood} · ${keslabel(amount)}`}
            style={{
              width: `${Math.min(100, (amount / scale) * 100)}%`,
              background: MOOD_COLOUR[mood] ?? 'rgba(255,255,255,0.35)',
            }}
          />
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {segments.map(([mood]) => (
            <li key={mood} className="flex items-center gap-1.5 text-[0.625rem] font-bold">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-[2px]"
                style={{ background: MOOD_COLOUR[mood] ?? 'rgba(255,255,255,0.35)' }}
              />
              {MOOD_LABEL[mood] ?? mood}
            </li>
          ))}
        </ul>
        <p className="text-[0.625rem] font-semibold text-white/45">
          estimates · confirmed by your concierge
        </p>
      </div>

      {suggestion && (
        <p className="border-warning/30 bg-warning-bg text-warning mt-3 rounded-lg border p-2.5 text-[0.6875rem] font-bold leading-[1.6]">
          Swap the {suggestion.from.toLowerCase()} for the {suggestion.to.toLowerCase()} to fit —{' '}
          {keslabel(suggestion.saves)} less.
        </p>
      )}
    </div>
  );
}

export function DayTimeline({
  view,
  partyLabel,
  onSwap,
  busy,
}: {
  view: PlanView;
  partyLabel: string;
  onSwap?: (blockId: string, componentId: string) => void;
  busy?: string | null;
}) {
  const blocks = view.blocks;
  const hasStay = blocks.some((b) => b.kind === 'stay');

  if (blocks.length === 0) {
    return (
      <div className="border-border bg-surface rounded-2xl border p-8 text-center">
        <p className="text-muted text-sm font-semibold leading-[1.8]">
          Pick a mood or two on the left and your day builds itself here.
        </p>
      </div>
    );
  }

  return (
    <div className="border-border bg-surface rounded-2xl border p-3 sm:p-4">
      <ol className="relative">
        {blocks.map((block, index) => (
          <TimelineBlock
            key={block.id}
            block={block}
            last={index === blocks.length - 1 && hasStay}
            partyLabel={partyLabel}
            onSwap={onSwap}
            busy={busy === block.id}
          />
        ))}
      </ol>

      {!hasStay && (
        <div className="mt-1 flex items-center gap-3 pl-[3.25rem]">
          <span className="border-border-strong text-muted-light flex w-full items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-[0.8125rem] font-semibold">
            <Plus className="h-4 w-4 shrink-0" />
            Add a stay?
          </span>
        </div>
      )}
    </div>
  );
}

function TimelineBlock({
  block,
  last,
  partyLabel,
  onSwap,
  busy,
}: {
  block: PlanBlock;
  last: boolean;
  partyLabel: string;
  onSwap?: (blockId: string, componentId: string) => void;
  busy?: boolean;
}) {
  const Icon = ICON[block.kind] ?? Sun;
  /* Both read KES 0 · INCLUDED: neither adds to the total, and the
     artboard draws them the same. */
  const included = block.included_by !== null || block.kind === 'free';
  const price = block.price_quoted_kes ?? block.price_estimate_kes;

  return (
    <li className="relative flex gap-3">
      {/* Clock and the gold rail. */}
      <div className="flex w-[3.25rem] shrink-0 flex-col items-end pr-1">
        <span className="text-muted-light pt-4 text-[0.6875rem] font-extrabold tabular-nums">
          {hhmm(block.start_time)}
        </span>
      </div>
      {!last && (
        <span
          aria-hidden="true"
          className="bg-gold absolute bottom-0 left-[3.7rem] top-7 w-[2px] rounded-full opacity-70"
        />
      )}

      <div className="min-w-0 flex-1 pb-2.5">
        <div
          className={`rounded-xl border p-3.5 transition-opacity ${
            block.status === 'unavailable'
              ? 'border-danger/40 bg-danger-bg'
              : block.kind === 'free'
                ? 'border-border bg-bg'
                : 'border-border bg-surface'
          } ${busy ? 'opacity-50' : ''}`}
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="bg-ink text-gold flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            >
              <Icon className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-[0.875rem] font-extrabold leading-snug">
                {block.title_snapshot}
                {block.anchored && (
                  <span className="bg-gold-soft text-gold-text inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-wide">
                    <Lock className="h-2.5 w-2.5" />
                    fixed by the event
                  </span>
                )}
              </p>
              {block.subtitle_snapshot && (
                <p className="text-muted-light mt-0.5 text-[0.75rem] font-semibold leading-snug">
                  {block.subtitle_snapshot}
                </p>
              )}
            </div>

            <div className="shrink-0 text-right">
              {included ? (
                <>
                  <p className="text-[0.8125rem] font-extrabold">KES 0</p>
                  <p className="text-success text-[0.5625rem] font-extrabold uppercase tracking-wide">
                    Included
                  </p>
                </>
              ) : (
                <>
                  <p className="text-success text-[0.8125rem] font-extrabold">KES {kes(price)}</p>
                  <p className="text-muted-light text-[0.5625rem] font-semibold">{partyLabel}</p>
                </>
              )}
            </div>
          </div>

          {/* Anything the guest pays at a gate or a door, kept out of the total. */}
          {block.pay_on_day.length > 0 && (
            <ul className="border-border mt-2.5 space-y-0.5 border-t pt-2">
              {block.pay_on_day.map((item, i) => (
                <li
                  key={i}
                  className="text-muted-light flex justify-between gap-2 text-[0.6875rem] font-semibold"
                >
                  <span>{item.label}</span>
                  <span className="shrink-0">
                    KES {kes(item.amount)} · {item.note ?? 'paid on the day'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {block.status === 'unavailable' && block.change_note && (
            <p className="text-danger mt-2.5 text-[0.6875rem] font-bold leading-[1.6]">
              {block.change_note}
            </p>
          )}
          {block.status === 'changed' && block.change_note && (
            <p className="border-warning/40 bg-warning-bg text-warning mt-2.5 rounded-lg border p-2 text-[0.6875rem] font-bold leading-[1.6]">
              Changed
              {block.changed_from?.title && block.changed_from.title !== block.title_snapshot
                ? ` from ${block.changed_from.title}`
                : block.changed_from?.start_time
                  ? ` from ${block.changed_from.start_time}`
                  : ''}{' '}
              — {block.change_note}
            </p>
          )}
        </div>

        {/* The Swap: line. Nothing to swap to means no line, rather than a
            disabled control that promises something. */}
        {!included && block.swaps.length > 0 && onSwap && block.status === 'proposed' && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-1">
            <Repeat2 aria-hidden="true" className="text-gold-text h-3.5 w-3.5 shrink-0" />
            {block.swaps.map((swap) => (
              <button
                key={swap.id}
                type="button"
                disabled={busy}
                onClick={() => onSwap(block.id, swap.id)}
                className="text-muted hover:text-ink text-[0.6875rem] font-semibold underline-offset-2 transition-colors hover:underline disabled:opacity-50"
              >
                <span className="text-ink font-extrabold">Swap:</span> {swap.title} ·{' '}
                {swap.delta_kes === 0
                  ? 'same price'
                  : `${keslabel(Math.abs(swap.delta_kes))} ${swap.delta_kes < 0 ? 'less' : 'more'}`}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

export { DASH };
