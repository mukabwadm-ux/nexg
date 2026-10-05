'use client';

import { Button, Card, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  blockDone,
  blockUnavailable,
  changeBlock,
  completePlan,
  confirmBlock,
  markPaid,
  quotePlan,
  removeBlock,
  requestHold,
  sendMessage,
} from '@/app/experiences/actions';

import { countdown, DASH, keslabel, StatusPill, when } from './shared';

/**
 * The plan workbench (K2).
 *
 * One screen from a day arriving to a day being paid for: confirm each
 * block at a price, change one with a reason the guest reads, mark one
 * unavailable, ask a partner to hold, then quote.
 *
 * Send quote stays disabled with the reason written out, rather than
 * enabled and then failing — the RPC refuses anyway, and being told why
 * before you click is the difference between a rule and an obstacle.
 */

export interface WorkBlock {
  id: string;
  slot: string;
  start_time: string | null;
  kind: string;
  title_snapshot: string;
  subtitle_snapshot: string | null;
  price_estimate_kes: number | null;
  price_quoted_kes: number | null;
  status: string;
  change_note: string | null;
  changed_from: { title?: string; start_time?: string } | null;
  hold_status: string;
  included_by: string | null;
  anchored: boolean;
  swap_group: string | null;
  partner_name: string | null;
  done_at: string | null;
}

export interface WorkPlan {
  id: string;
  reference: string;
  status: string;
  guest_name: string | null;
  guest_phone: string | null;
  stay_label: string | null;
  party_type: string;
  party_size: number;
  date: string | null;
  budget_kes: number | null;
  estimate_total_kes: number | null;
  quote_total_kes: number | null;
  pay_on_day_total_kes: number | null;
  concierge_fee_kes: number | null;
  notes: string | null;
  moods: string[];
  answers: Record<string, unknown>;
  concierge_name: string | null;
  claimed_at: string | null;
  quote_due_in_s: number | null;
  flags: { severity: string; kind: string; text: string }[];
}

export interface WorkMessage {
  id: string;
  author_type: string;
  author_name: string | null;
  body: string;
  created_at: string;
}

const QUICK = [
  'Quote is ready',
  'One change',
  'Not available — alternative?',
  'Need a decision',
  'Confirming holds',
];

export function Workbench({
  plan,
  blocks,
  messages,
  feeRuleSet,
}: {
  plan: WorkPlan;
  blocks: WorkBlock[];
  messages: WorkMessage[];
  feeRuleSet: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');

  const run = async (key: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    toast({
      title: r.ok ? 'Done' : 'Not allowed',
      description: r.message,
      tone: r.ok ? 'success' : 'danger',
    });
    if (r.ok) router.refresh();
  };

  const chargeable = blocks.filter((b) => b.kind !== 'free' && b.included_by === null);
  const open = chargeable.filter((b) => b.status === 'proposed');
  const settled = chargeable.filter((b) => ['confirmed', 'changed', 'done'].includes(b.status));
  const unpriced = settled.filter((b) => b.price_quoted_kes === null);
  const holds = blocks.filter((b) => b.hold_status === 'requested').length;

  /* Exactly why the button is off, in the order the RPC will complain. */
  const quoteBlocker =
    open.length > 0
      ? `${open.length} block${open.length === 1 ? '' : 's'} still only proposed`
      : unpriced.length > 0
        ? `${unpriced.length} block${unpriced.length === 1 ? '' : 's'} with no price`
        : !feeRuleSet
          ? 'the concierge fee rule is not set — a quote would be a guess'
          : null;

  const subtotal = settled.reduce((sum, b) => sum + (b.price_quoted_kes ?? 0), 0);
  const quoteDue = countdown(plan.quote_due_in_s);

  return (
    <main className="px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-xl font-extrabold tracking-tight">{plan.reference}</span>
            <StatusPill status={plan.status} />
          </p>
          <p className="text-muted mt-1 text-xs font-semibold">
            {plan.concierge_name ? `taken by ${plan.concierge_name}` : 'unassigned'}
            {plan.claimed_at ? ` · ${when(plan.claimed_at)}` : ''}
            {quoteDue ? ` · quote due in ${quoteDue.text}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {plan.status === 'approved' && (
            <Button
              size="sm"
              loading={busy === 'paid'}
              onClick={() => {
                /*
                 * No payments provider is wired. Rather than a Pay button
                 * that does nothing, this records the reference the money
                 * actually arrived under — which is what the plan table
                 * requires before it will call a day paid.
                 */
                const ref = window.prompt(
                  'Payment reference from M-Pesa or the card terminal. No provider is wired, so this records what was taken elsewhere.',
                );
                if (!ref) return;
                void run('paid', () => markPaid(plan.id, ref));
              }}
            >
              Record payment
            </Button>
          )}
          {(plan.status === 'paid' || plan.status === 'in_progress') && (
            <Button
              size="sm"
              variant="outline"
              loading={busy === 'complete'}
              onClick={() => {
                const left = chargeable.filter((b) => b.status !== 'done').length;
                const note =
                  left > 0
                    ? window.prompt(
                        `${left} block(s) are not marked done. Say why you are closing it.`,
                      )
                    : null;
                if (left > 0 && !note) return;
                void run('complete', () => completePlan(plan.id, note));
              }}
            >
              Complete day
            </Button>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        {/* ───────────────────────────────────────────────── the day */}
        <Card className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[0.9375rem] font-extrabold">The day</h2>
            <p className="text-muted-light text-xs font-semibold">
              {settled.length} settled · {holds} awaiting holds · {open.length} open
            </p>
          </div>

          <ol className="mt-4 space-y-2.5">
            {blocks.map((block) => (
              <BlockRow
                key={block.id}
                planId={plan.id}
                block={block}
                busy={busy}
                run={run}
                canRun={plan.status !== 'completed' && plan.status !== 'cancelled'}
                running={plan.status === 'paid' || plan.status === 'in_progress'}
              />
            ))}
          </ol>
        </Card>

        {/* ────────────────────────────────────────────── right rail */}
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="text-sm font-extrabold uppercase tracking-wide">Guest brief</h2>
            <dl className="mt-3 space-y-1.5 text-[0.8125rem]">
              <Row label="Who">
                {plan.guest_name ?? '[Guest name]'} · {plan.party_type} of {plan.party_size}
              </Row>
              <Row label="Day">
                {plan.date
                  ? new Date(plan.date).toLocaleDateString('en-GB', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'short',
                    })
                  : 'no date'}
              </Row>
              <Row label="Budget">{keslabel(plan.budget_kes)}</Row>
              <Row label="Staying">{plan.stay_label ?? '[stay]'}</Row>
              <Row label="Reach them">{plan.guest_phone ?? DASH}</Row>
              <Row label="Getting around">{(plan.answers.transport as string) ?? 'not said'}</Row>
            </dl>
            {plan.notes && (
              <p className="border-gold/40 bg-gold-soft mt-3 rounded-lg border p-2.5 text-[0.75rem] font-semibold leading-[1.7]">
                “{plan.notes}”
              </p>
            )}
            {plan.flags.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {plan.flags.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[0.6875rem] font-semibold leading-[1.6]"
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        f.severity === 'red'
                          ? 'bg-danger'
                          : f.severity === 'amber'
                            ? 'bg-warning'
                            : 'bg-success'
                      }`}
                    />
                    {f.text}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* the quote */}
          <Card className="p-5">
            <h2 className="text-sm font-extrabold uppercase tracking-wide">Quote</h2>
            <dl className="mt-3 space-y-1.5 text-[0.8125rem]">
              <Row label={`Confirmed · ${settled.length}`}>{keslabel(subtotal)}</Row>
              <Row label={`Still open · ${open.length}`}>
                {open.length === 0
                  ? '—'
                  : keslabel(open.reduce((s, b) => s + (b.price_estimate_kes ?? 0), 0))}
              </Row>
              <Row label="Paid on the day">
                {plan.pay_on_day_total_kes ? keslabel(plan.pay_on_day_total_kes) : '—'}
              </Row>
              <Row label="Concierge fee">
                {plan.concierge_fee_kes === null ? `KES ${DASH}` : keslabel(plan.concierge_fee_kes)}
              </Row>
            </dl>
            <div className="border-border mt-3 flex items-baseline justify-between border-t pt-3">
              <span className="text-[0.8125rem] font-extrabold">Total to pay now</span>
              <span className="text-lg font-extrabold">
                {plan.quote_total_kes === null
                  ? keslabel(subtotal + (plan.concierge_fee_kes ?? 0))
                  : keslabel(plan.quote_total_kes)}
              </span>
            </div>
            {(() => {
              /*
               * Over budget is the thing the concierge has to say out loud
               * before the guest reads it on their own screen. Printing the
               * budget beside a larger total and leaving them to subtract
               * is how it gets missed.
               */
              const total = plan.quote_total_kes ?? subtotal + (plan.concierge_fee_kes ?? 0);
              const over = plan.budget_kes !== null && total > plan.budget_kes;
              return over ? (
                <p className="border-warning/40 bg-warning-bg text-warning mt-2 rounded-lg border p-2 text-[0.6875rem] font-bold leading-[1.6]">
                  {keslabel(total - plan.budget_kes!)} over the {keslabel(plan.budget_kes)} they
                  set. Tell them why before they open the quote.
                </p>
              ) : (
                <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold">
                  against a budget of {keslabel(plan.budget_kes)}
                  {plan.budget_kes !== null && ` · ${keslabel(plan.budget_kes - total)} to spare`}
                </p>
              );
            })()}

            {plan.status !== 'quoted' && plan.status !== 'approved' && (
              <>
                <Button
                  className="mt-4 w-full"
                  disabled={quoteBlocker !== null}
                  loading={busy === 'quote'}
                  onClick={() => void run('quote', () => quotePlan(plan.id))}
                >
                  Send quote
                </Button>
                {quoteBlocker && (
                  <p className="text-warning mt-2 text-[0.6875rem] font-bold leading-[1.6]">
                    Not yet — {quoteBlocker}.
                  </p>
                )}
              </>
            )}

            <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
              Park fees and anything paid on the day are listed to the guest separately and are
              never marked up.
            </p>
          </Card>

          {/* the thread */}
          <Card className="bg-ink p-5 text-white">
            <h2 className="text-sm font-extrabold uppercase tracking-wide">Thread</h2>
            <ul className="mt-3 max-h-64 space-y-2.5 overflow-y-auto">
              {messages.length === 0 ? (
                <li className="text-xs font-semibold text-white/45">
                  Nothing said yet. The first message stops the reply clock.
                </li>
              ) : (
                messages.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-lg p-2.5 text-[0.75rem] leading-[1.7] ${
                      m.author_type === 'guest' ? 'bg-white/10' : 'bg-gold text-ink'
                    }`}
                  >
                    <span className="block text-[0.5625rem] font-extrabold uppercase tracking-wide opacity-60">
                      {m.author_type === 'guest'
                        ? (plan.guest_name ?? 'Guest')
                        : (m.author_name ?? 'NexG')}{' '}
                      · {when(m.created_at)}
                    </span>
                    {m.body}
                  </li>
                ))
              )}
            </ul>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {QUICK.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setDraft(q)}
                  className="rounded-full border border-white/20 px-2.5 py-1 text-[0.625rem] font-bold text-white/70 transition-colors hover:text-white"
                >
                  {q}
                </button>
              ))}
            </div>

            <textarea
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write to the guest…"
              className="mt-2 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[0.8125rem] font-semibold text-white placeholder:text-white/40"
            />
            <Button
              size="sm"
              className="mt-2"
              disabled={!draft.trim()}
              loading={busy === 'msg'}
              onClick={() =>
                void run('msg', async () => {
                  const r = await sendMessage(plan.id, draft);
                  if (r.ok) setDraft('');
                  return r;
                })
              }
            >
              Send
            </Button>
          </Card>
        </div>
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-light shrink-0 font-semibold">{label}</dt>
      <dd className="truncate text-right font-bold">{children}</dd>
    </div>
  );
}

function BlockRow({
  planId,
  block,
  busy,
  run,
  canRun,
  running,
}: {
  planId: string;
  block: WorkBlock;
  busy: string | null;
  run: (key: string, fn: () => Promise<{ ok: boolean; message?: string }>) => Promise<void>;
  canRun: boolean;
  running: boolean;
}) {
  const included = block.included_by !== null || block.kind === 'free';
  const price = block.price_quoted_kes ?? block.price_estimate_kes;

  const STATUS: Record<string, string> = {
    proposed: 'bg-bg text-muted',
    confirmed: 'bg-success-bg text-success',
    changed: 'bg-warning-bg text-warning',
    unavailable: 'bg-danger-bg text-danger',
    done: 'bg-success-bg text-success',
    removed: 'bg-bg text-muted-light',
  };

  return (
    <li className="border-border bg-bg rounded-xl border p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-muted-light text-[0.6875rem] font-extrabold tabular-nums">
              {block.start_time?.slice(0, 5) ?? '—'}
            </span>
            <span className="text-[0.875rem] font-extrabold">{block.title_snapshot}</span>
            {block.anchored && (
              <span className="bg-gold-soft text-gold-text rounded px-1.5 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-wide">
                Fixed by event
              </span>
            )}
          </p>
          <p className="text-muted-light mt-0.5 text-[0.6875rem] font-semibold">
            {block.subtitle_snapshot}
            {block.partner_name ? ` · ${block.partner_name}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`text-[0.8125rem] font-extrabold ${
              block.price_quoted_kes !== null ? 'text-success' : 'text-muted'
            }`}
          >
            {included ? 'KES 0' : keslabel(price)}
          </p>
          <span
            className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[0.5625rem] font-extrabold uppercase ${
              included ? 'bg-bg text-muted-light' : (STATUS[block.status] ?? 'bg-bg text-muted')
            }`}
          >
            {included ? 'Included' : block.status}
          </span>
        </div>
      </div>

      {block.hold_status !== 'none' && (
        <p className="text-muted mt-2 text-[0.6875rem] font-bold">
          <span
            aria-hidden="true"
            className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
              block.hold_status === 'held'
                ? 'bg-success'
                : block.hold_status === 'declined'
                  ? 'bg-danger'
                  : 'bg-warning'
            }`}
          />
          hold {block.hold_status}
        </p>
      )}

      {block.change_note && (
        <p className="border-warning/40 bg-warning-bg text-warning mt-2 rounded-lg border p-2 text-[0.6875rem] font-bold leading-[1.6]">
          Note to guest: {block.change_note}
        </p>
      )}

      {canRun && !included && block.status !== 'removed' && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {running ? (
            block.status !== 'done' && (
              <Button
                size="sm"
                variant="outline"
                loading={busy === `done-${block.id}`}
                onClick={() => void run(`done-${block.id}`, () => blockDone(planId, block.id))}
              >
                Mark done
              </Button>
            )
          ) : (
            <>
              <Button
                size="sm"
                loading={busy === `confirm-${block.id}`}
                onClick={() => {
                  const raw = window.prompt(
                    'Price the partner quoted, in shillings. Blank keeps the estimate.',
                    String(block.price_estimate_kes ?? ''),
                  );
                  if (raw === null) return;
                  const value = raw.trim() === '' ? null : Number(raw.replace(/[^\d]/g, ''));
                  void run(`confirm-${block.id}`, () => confirmBlock(planId, block.id, value));
                }}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                loading={busy === `change-${block.id}`}
                onClick={() => {
                  const raw = window.prompt('New price in shillings. Blank leaves it.');
                  if (raw === null) return;
                  const note = window.prompt('Why? The guest reads this.');
                  if (!note) return;
                  void run(`change-${block.id}`, () =>
                    changeBlock(
                      planId,
                      block.id,
                      raw.trim() === ''
                        ? {}
                        : { price_quoted_kes: Number(raw.replace(/[^\d]/g, '')) },
                      note,
                    ),
                  );
                }}
              >
                Change
              </Button>
              <Button
                size="sm"
                variant="outline"
                loading={busy === `gone-${block.id}`}
                onClick={() => {
                  const note = window.prompt('Why is it not available? The guest reads this.');
                  if (!note) return;
                  void run(`gone-${block.id}`, () => blockUnavailable(planId, block.id, note));
                }}
              >
                Unavailable
              </Button>
              {block.hold_status === 'none' && (
                <Button
                  size="sm"
                  variant="outline"
                  loading={busy === `hold-${block.id}`}
                  onClick={() => {
                    const msg = window.prompt('What to send the partner?');
                    if (msg === null) return;
                    void run(`hold-${block.id}`, () =>
                      requestHold(planId, block.id, 'whatsapp', msg),
                    );
                  }}
                >
                  Request hold
                </Button>
              )}
              <Button
                size="sm"
                variant="danger"
                loading={busy === `rm-${block.id}`}
                onClick={() => {
                  const note = window.prompt('Why is it gone?');
                  if (!note) return;
                  void run(`rm-${block.id}`, () => removeBlock(planId, block.id, note));
                }}
              >
                Remove
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
