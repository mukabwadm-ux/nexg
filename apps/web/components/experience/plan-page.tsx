'use client';

import { Button, Card, useToast } from '@nexg/ui';
import * as React from 'react';

import { approvePlan, requestChanges, sendGuestMessage } from '@/app/experience/actions';

import { DayTimeline } from './day-timeline';
import { keslabel, type PlanView } from './types';

/**
 * The plan page, after the day has been sent.
 *
 * Four states, because the guest is in a different situation in each and
 * the page should say which: somebody is looking at it; here is the
 * price; it is paid and here is the day; it is done.
 *
 * The X3 artboard for the quoted state was not supplied with this build,
 * so the layout follows the prose in the build prompt and the visual
 * language of the rest of NexG rather than guessing at a design. Every
 * figure is read; the concierge fee renders [—] until a rule is set, and
 * the page says plainly that approving does not charge anything, because
 * no payments provider is wired and pretending otherwise would be the
 * one lie here that costs money.
 */
export function PlanPage({ initial }: { initial: PlanView }) {
  const { toast } = useToast();
  const [view, setView] = React.useState(initial);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');

  const plan = view.plan;
  const partyLabel =
    plan.party_type === 'solo'
      ? 'for one'
      : plan.party_type === 'couple'
        ? 'for two'
        : `for ${plan.party_size}`;

  const run = async (
    key: string,
    fn: () => Promise<{ ok: boolean; message?: string; view?: PlanView }>,
  ) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (r.view) setView(r.view);
    toast({
      title: r.ok ? 'Done' : 'Not yet',
      description: r.message,
      tone: r.ok ? 'success' : 'danger',
    });
  };

  const concierge = plan.concierge_name?.replace(/[[\]]/g, '').split(' ')[0] ?? 'A concierge';
  const changed = view.blocks.filter((b) => b.status === 'changed' || b.status === 'unavailable');

  const heading =
    plan.status === 'quoted'
      ? 'Your day is ready. One tap to make it real.'
      : plan.status === 'approved'
        ? 'Approved. We are getting it booked.'
        : plan.status === 'paid' || plan.status === 'in_progress'
          ? 'You are all set.'
          : plan.status === 'completed'
            ? 'That was your day.'
            : `${concierge} is checking your day.`;

  const sub =
    plan.status === 'quoted'
      ? changed.length === 0
        ? 'Everything you picked is available, at the price below.'
        : `${changed.length} thing${changed.length === 1 ? '' : 's'} changed — each one says why.`
      : plan.status === 'completed'
        ? 'We will ask you one question about it, once.'
        : plan.status === 'paid' || plan.status === 'in_progress'
          ? 'Your times and your driver are below. Anything wrong, message here.'
          : 'They are calling the places on your list and will come back with a price you can approve or change.';

  return (
    <main className="mx-auto max-w-[96rem] px-4 py-10 sm:px-8 lg:px-16">
      <p className="text-gold-text text-[0.625rem] font-extrabold uppercase tracking-[0.18em]">
        {plan.reference}
      </p>
      <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
        {heading}
      </h1>
      <p className="text-muted mt-4 max-w-2xl text-[0.9375rem] leading-[1.8]">{sub}</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
        <div className="min-w-0">
          <DayTimeline view={view} partyLabel={partyLabel} />

          {/* the thread */}
          <Card className="bg-ink mt-5 p-5 text-white">
            <p className="text-[0.5625rem] font-extrabold uppercase tracking-[0.18em] text-white/45">
              {plan.concierge_name ? `You and ${concierge}` : 'You and the desk'}
            </p>
            <ul className="mt-3 space-y-2.5">
              {view.messages.length === 0 ? (
                <li className="text-xs font-semibold text-white/45">
                  Nothing yet. Ask anything here — it goes straight to the person handling your day.
                </li>
              ) : (
                view.messages.map((m) => (
                  <li
                    key={m.id}
                    className={`max-w-[85%] rounded-xl p-3 text-[0.8125rem] leading-[1.7] ${
                      m.author_type === 'guest' ? 'bg-white/12 ml-auto' : 'bg-gold text-ink'
                    }`}
                  >
                    <span className="block text-[0.5625rem] font-extrabold uppercase tracking-wide opacity-60">
                      {m.author_type === 'guest' ? 'You' : (m.author_name ?? 'NexG')}
                    </span>
                    {m.body}
                  </li>
                ))
              )}
            </ul>
            <textarea
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask them anything…"
              className="mt-3 w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-[0.875rem] font-semibold text-white placeholder:text-white/40"
            />
            <Button
              size="sm"
              className="mt-2"
              disabled={!draft.trim()}
              loading={busy === 'msg'}
              onClick={() =>
                void run('msg', async () => {
                  const r = await sendGuestMessage(plan.id, draft);
                  if (r.ok) setDraft('');
                  return r;
                })
              }
            >
              Send
            </Button>
          </Card>
        </div>

        {/* ───────────────────────────────────────────── the quote */}
        <div className="lg:sticky lg:top-6">
          {plan.status === 'quoted' || plan.status === 'approved' ? (
            <Card className="p-5">
              <h2 className="text-sm font-extrabold uppercase tracking-wide">Your quote</h2>
              <dl className="mt-3 space-y-1.5 text-[0.8125rem]">
                {view.blocks
                  .filter(
                    (b) =>
                      b.included_by === null && b.kind !== 'free' && b.status !== 'unavailable',
                  )
                  .map((b) => (
                    <div key={b.id} className="flex justify-between gap-3">
                      <dt className="text-muted-light min-w-0 truncate font-semibold">
                        {b.title_snapshot}
                      </dt>
                      <dd className="shrink-0 font-bold">
                        {keslabel(b.price_quoted_kes ?? b.price_estimate_kes)}
                      </dd>
                    </div>
                  ))}
                <div className="border-border flex justify-between gap-3 border-t pt-2">
                  <dt className="text-muted-light font-semibold">
                    Concierge fee
                    <span className="block text-[0.625rem]">one fee for the whole day</span>
                  </dt>
                  <dd className="font-bold">{keslabel(plan.concierge_fee_kes)}</dd>
                </div>
              </dl>

              <div className="border-border mt-3 flex items-baseline justify-between border-t pt-3">
                <span className="text-[0.875rem] font-extrabold">Total to pay now</span>
                <span className="text-xl font-extrabold">{keslabel(plan.quote_total_kes)}</span>
              </div>

              {plan.pay_on_day_total_kes ? (
                <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold leading-[1.7]">
                  Plus {keslabel(plan.pay_on_day_total_kes)} paid on the day at face value — park
                  gates and tickets. We never mark those up.
                </p>
              ) : null}

              {plan.budget_kes !== null && plan.quote_total_kes !== null && (
                <p
                  className={`mt-2 rounded-lg border p-2 text-[0.6875rem] font-bold leading-[1.6] ${
                    plan.quote_total_kes > plan.budget_kes
                      ? 'border-warning/40 bg-warning-bg text-warning'
                      : 'border-success/30 bg-success-bg text-success'
                  }`}
                >
                  {plan.quote_total_kes > plan.budget_kes
                    ? `${keslabel(plan.quote_total_kes - plan.budget_kes)} over the ${keslabel(plan.budget_kes)} you set.`
                    : `${keslabel(plan.budget_kes - plan.quote_total_kes)} inside the ${keslabel(plan.budget_kes)} you set.`}
                </p>
              )}

              {plan.status === 'quoted' && (
                <>
                  <Button
                    className="mt-4 w-full"
                    size="lg"
                    loading={busy === 'approve'}
                    onClick={() => void run('approve', () => approvePlan(plan.id))}
                  >
                    Approve {keslabel(plan.quote_total_kes)}
                  </Button>
                  <Button
                    variant="outline"
                    className="mt-2 w-full"
                    loading={busy === 'changes'}
                    onClick={() => {
                      const message = window.prompt('What would you like changed?');
                      if (!message) return;
                      void run('changes', () => requestChanges(plan.id, message));
                    }}
                  >
                    Change something
                  </Button>

                  {/*
                   * The honest sentence. No payments provider is wired to
                   * this project, so approving records that you agreed to
                   * this total — it does not take money. Saying "pay now"
                   * on a button that cannot charge is the one lie on this
                   * page that would actually cost somebody something.
                   */}
                  <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
                    Approving tells your concierge to book it and records the total you agreed to.
                    Payment is taken separately — M-Pesa is not connected to this site yet, so
                    nothing is charged here.
                  </p>

                  {plan.expires_at && (
                    <p className="text-muted mt-2 text-[0.6875rem] font-semibold">
                      This quote holds until{' '}
                      {new Date(plan.expires_at).toLocaleString('en-GB', {
                        weekday: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      .
                    </p>
                  )}
                </>
              )}
            </Card>
          ) : (
            <Card className="p-5">
              <h2 className="text-sm font-extrabold uppercase tracking-wide">Where this is</h2>
              <dl className="mt-3 space-y-1.5 text-[0.8125rem]">
                <Row label="Reference">{plan.reference}</Row>
                <Row label="Your budget">{keslabel(plan.budget_kes)}</Row>
                <Row label="Estimate">{keslabel(plan.estimate_total_kes)}</Row>
                <Row label="With">{plan.concierge_name ?? 'the desk'}</Row>
              </dl>
              <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
                Prices above are estimates. A person is confirming each one with the place itself,
                and you will get a quote you can approve or change before anything is booked.
              </p>
            </Card>
          )}

          {/* what the day costs at the gate, always separate */}
          {view.blocks.some((b) => b.pay_on_day.length > 0) && (
            <Card className="mt-4 p-5">
              <h2 className="text-sm font-extrabold uppercase tracking-wide">Paid on the day</h2>
              <ul className="mt-3 space-y-1.5">
                {view.blocks.flatMap((b) =>
                  b.pay_on_day.map((item, i) => (
                    <li
                      key={`${b.id}-${i}`}
                      className="flex justify-between gap-3 text-[0.75rem] font-semibold"
                    >
                      <span className="text-muted-light min-w-0">{item.label}</span>
                      <span className="shrink-0 font-bold">{keslabel(item.amount)}</span>
                    </li>
                  )),
                )}
              </ul>
              <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
                These go straight to the gate or the organiser at face value. NexG takes nothing on
                them.
              </p>
            </Card>
          )}
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
