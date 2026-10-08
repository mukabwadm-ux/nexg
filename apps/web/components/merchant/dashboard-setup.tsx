import { CreditCard, FileText, ListOrdered, MessageSquare, Smartphone } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import type { MerchantHome } from '@/app/merchant/layout';

import { Attention, DASH, PreviewBadge, QuickAction, Tile, kes } from './bits';
import type { AttentionRow, BranchCard, SetupProgress } from './types';

/**
 * The dashboard for a merchant who is not live yet.
 *
 * Arranged around one question — what is between me and taking
 * orders — and a second one the design is careful to answer:
 * what do I get when I finish. A checklist that only nags gets
 * abandoned, so the strip says plainly what going live unlocks,
 * and every locked section can still be opened to see a sample.
 *
 * Nothing here shows a zero where a real figure will later go.
 * A zero reads as "nothing happened"; these say "not yet".
 */

const STEPS = [
  {
    n: 1,
    key: 'step_profile' as const,
    title: 'Business profile',
    body: 'Name, category, branch address and photos. Verified by merchant ops.',
    href: '/merchant/stores',
    action: 'Edit',
  },
  {
    n: 2,
    key: 'step_hours' as const,
    title: 'Hours',
    body: 'Your week, and which public holidays you follow.',
    href: '/merchant/hours',
    action: 'Edit',
  },
  {
    n: 3,
    key: 'step_team' as const,
    title: 'Team & devices',
    body: 'Somebody besides you, and the counter phone that will hear the order sound.',
    href: '/merchant/team',
    action: 'Add someone',
  },
  {
    n: 4,
    key: 'step_catalogue' as const,
    title: 'Catalogue started',
    body: 'Items and prices. Photos are optional before go-live and change how much gets ordered.',
    href: '/merchant/menu',
    action: 'Add items',
  },
  {
    n: 5,
    key: 'step_documents' as const,
    title: 'Documents',
    body: 'The permits your category needs. Reviewed within one working day.',
    href: '/merchant/documents',
    action: 'Upload',
  },
  {
    n: 6,
    key: 'step_payout' as const,
    title: 'Payout method',
    body: 'M-Pesa till, paybill or bank account, verified with a KES 1 test credit.',
    href: '/merchant/money',
    action: 'Set up payouts',
  },
  {
    n: 7,
    key: 'step_live' as const,
    title: 'Test order & go live',
    body: 'Accept a test order on your counter phone, then merchant ops switches you live.',
    href: '/merchant/support',
    action: 'Available after 5 & 6',
    needs: ['step_documents', 'step_payout'] as const,
  },
];

export function DashboardSetup({
  m,
  progress,
  branches,
  attention,
  personName,
}: {
  m: MerchantHome;
  progress: SetupProgress;
  branches: BranchCard[];
  attention: AttentionRow[];
  personName: string;
}) {
  const pct = Math.round((progress.done_count / progress.of_count) * 100);
  const docsToDo =
    (m.documents_missing ?? 0) + (m.documents_to_fix ?? 0) + (m.documents_asked_for ?? 0);

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────── the hero */}
      <section className="bg-ink relative overflow-hidden px-4 py-6 text-white sm:px-7">
        <span className="absolute inset-0 bg-gradient-to-br from-white/[0.07] to-transparent" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <h1 className="font-serif text-[1.875rem] font-extrabold tracking-tight">
              Good {partOfDay()}, {personName} 👋
            </h1>
            <p className="mt-1.5 max-w-2xl text-[0.9375rem] font-semibold text-white/65">
              Welcome to NexG. You are{' '}
              <strong className="text-gold">
                {progress.done_count} of {progress.of_count} steps
              </strong>{' '}
              from going live. Guests cannot see you yet; the rest of the dashboard is yours to
              explore.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile
                icon="✓"
                value={`${progress.done_count} / ${progress.of_count}`}
                label="Setup steps done"
                note={`${progress.of_count - progress.done_count} pending`}
                noteTone="gold"
              />
              <Tile
                value={String(m.items_available ?? 0)}
                label="Catalogue items"
                note={
                  (m.items_available ?? 0) === 0
                    ? 'none yet'
                    : 'photos change how much gets ordered'
                }
              />
              <Tile
                value={`${(m.documents_missing ?? 0) + (m.documents_to_fix ?? 0) === 0 ? '✓' : docsToDo}`}
                label="Documents"
                note={docsToDo > 0 ? `${docsToDo} awaiting upload` : 'all in'}
                noteTone={docsToDo > 0 ? 'danger' : 'plain'}
              />
              <Tile
                value={m.payout_rail ? '✓' : DASH}
                label="Payout method"
                note={m.payout_rail ? 'set' : 'not set'}
                noteTone={m.payout_rail ? 'plain' : 'danger'}
              />
            </div>
          </div>

          <div className="w-full max-w-xs rounded-xl bg-black/35 p-4 backdrop-blur-sm lg:w-auto">
            <p className="text-gold text-[0.9375rem] font-extrabold">Your onboarding guide</p>
            <p className="mt-1.5 text-[0.75rem] font-semibold leading-[1.65] text-white/60">
              Merchant ops is assigned to you until you go live. Ask anything in Messages, or book
              a fifteen-minute setup call.
            </p>
            <Link
              href="/merchant/messages"
              className="bg-gold text-ink mt-3 block rounded-lg px-4 py-2.5 text-center text-[0.8125rem] font-extrabold"
            >
              Message ops →
            </Link>
          </div>
        </div>
      </section>

      <div className="space-y-6 px-4 sm:px-7">
        {/* ──────────────────────────────── the setup strip */}
        <section className="bg-ink overflow-hidden rounded-xl text-white">
          <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5">
            <div>
              <h2 className="text-[1.0625rem] font-extrabold tracking-tight">
                Finish setting up to go live
              </h2>
              <p className="mt-0.5 text-[0.8125rem] font-semibold text-white/55">
                Do these in any order. Nothing you do elsewhere in the dashboard is lost, and your
                progress is saved as you go.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[0.8125rem] font-extrabold">
                {progress.done_count} of {progress.of_count} done
              </span>
              <span className="h-1.5 w-28 overflow-hidden rounded-full bg-white/15">
                <span className="bg-gold block h-full" style={{ width: `${pct}%` }} />
              </span>
              <span className="text-gold text-[0.8125rem] font-extrabold">{pct}%</span>
            </div>
          </div>

          <ol className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {STEPS.map((s) => {
              const done = progress[s.key];
              const next = progress.next_step === s.n;
              const blocked = s.n === 7 && !progress.can_go_live;
              return (
                <li
                  key={s.n}
                  className={`flex flex-col rounded-lg border p-3.5 ${
                    next && !blocked
                      ? 'border-gold bg-gold text-ink'
                      : done
                        ? 'border-white/15 bg-white/[0.06]'
                        : 'border-white/10 bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[0.5625rem] font-extrabold uppercase tracking-[0.1em] ${
                        next && !blocked ? 'text-ink/70' : 'text-white/45'
                      }`}
                    >
                      Step {s.n}
                      {next && !blocked ? ' · next' : ''}
                    </span>
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full text-[0.5625rem] font-extrabold ${
                        done
                          ? 'bg-success text-white'
                          : next && !blocked
                            ? 'bg-ink text-white'
                            : 'bg-white/15 text-white/70'
                      }`}
                      aria-hidden="true"
                    >
                      {done ? '✓' : s.n}
                    </span>
                  </div>
                  <h3
                    className={`mt-2 text-[0.8125rem] font-extrabold leading-tight ${
                      next && !blocked ? 'text-ink' : ''
                    }`}
                  >
                    {s.title}
                  </h3>
                  <p
                    className={`mt-1 flex-1 text-[0.625rem] font-semibold leading-[1.5] ${
                      next && !blocked ? 'text-ink/70' : 'text-white/50'
                    }`}
                  >
                    {s.body}
                  </p>
                  {blocked ? (
                    <span className="mt-2.5 text-[0.6875rem] font-extrabold text-white/40">
                      Available after 5 &amp; 6
                    </span>
                  ) : (
                    <Link
                      href={s.href}
                      className={`mt-2.5 text-[0.6875rem] font-extrabold underline-offset-2 hover:underline ${
                        next ? 'text-ink' : 'text-gold'
                      }`}
                    >
                      {done ? 'Edit →' : `${s.action} →`}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 px-5 py-3.5">
            <span className="text-[0.75rem] font-extrabold">What going live unlocks</span>
            <span className="flex-1 text-[0.75rem] font-semibold leading-[1.6] text-white/55">
              Listing in Explore and on the QR landings of nearby hotels and Airbnbs, real orders
              and payouts, Featured slots, disputes, reviews and health scoring. Until then every
              module is open to explore with sample data marked PREVIEW.
            </span>
          </div>
        </section>

        {/* ───────────────────────────────────── branches */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-[1.375rem] font-extrabold tracking-tight">
              My Branches
            </h2>
            <Link
              href="/merchant/stores"
              className="border-border-strong bg-surface rounded-lg border px-3.5 py-2 text-[0.8125rem] font-extrabold"
            >
              View all →
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((b) => (
              <BranchTile key={b.branch_id} b={b} live={false} />
            ))}
            <Link
              href="/merchant/stores"
              className="border-border text-muted hover:border-ink flex min-h-[8rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed p-4 text-center transition-colors"
            >
              <span className="text-xl" aria-hidden="true">
                +
              </span>
              <span className="text-[0.875rem] font-extrabold">Add another branch</span>
              <span className="text-muted-light text-[0.6875rem] font-semibold">
                Each goes live on its own.
              </span>
            </Link>
          </div>
        </section>

        {/* ──────────────────────── the queue, empty and honest */}
        <section>
          <h2 className="mb-3 font-serif text-[1.375rem] font-extrabold tracking-tight">
            Live orders
          </h2>
          <div className="border-border bg-surface overflow-hidden rounded-xl border">
            <div className="border-border m-4 flex flex-wrap items-center gap-4 rounded-lg border border-dashed p-4">
              <span className="bg-bg text-muted flex h-10 w-10 items-center justify-center rounded-lg">
                <ListOrdered className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.875rem] font-extrabold">
                  No orders yet — you are not live
                </p>
                <p className="text-muted mt-0.5 text-[0.75rem] font-semibold leading-[1.6]">
                  This is where new orders arrive with an accept countdown, and where you mark them
                  Preparing and Ready. Finish steps 5 to 7 and the first real order shows up here.
                </p>
              </div>
            </div>

            <table className="w-full text-left">
              <thead className="border-border bg-bg border-y">
                <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                  <th className="px-4 py-2">Order</th>
                  <th className="px-4 py-2">Deliver to</th>
                  <th className="px-4 py-2">Pay</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Accept in</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-border border-b text-[0.8125rem] font-semibold">
                  <td className="text-muted-light px-4 py-3 font-extrabold">NX-SAMPLE</td>
                  <td className="text-muted px-4 py-3">Apt 4B · Kilimani</td>
                  <td className="px-4 py-3">
                    <PreviewBadge />
                  </td>
                  <td className="text-muted px-4 py-3">New</td>
                  <td className="text-muted-light px-4 py-3">1:40</td>
                </tr>
                <tr className="text-[0.8125rem] font-semibold">
                  <td className="text-muted-light px-4 py-3 font-extrabold">NX-SAMPLE</td>
                  <td className="text-muted px-4 py-3">[Hotel] · 412</td>
                  <td className="text-muted px-4 py-3">Folio</td>
                  <td className="text-muted px-4 py-3">Preparing</td>
                  <td className="text-muted-light px-4 py-3">Rider · 6 min</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ─────────────────────────────── attention tiles */}
        {attention.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {attention.slice(0, 4).map((a) => (
              <Attention key={a.kind} a={a} />
            ))}
          </div>
        ) : null}

        {/* ──────────────────────────── money, honestly zero */}
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <section className="border-border bg-surface rounded-xl border p-5">
            <h2 className="text-[0.9375rem] font-extrabold tracking-tight">Quick actions</h2>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              <QuickAction
                href="/merchant/documents"
                icon={<FileText className="h-4 w-4" />}
                title="Upload documents"
                note="Photo or PDF from your phone is fine."
              />
              <QuickAction
                href="/merchant/menu"
                icon={<ListOrdered className="h-4 w-4" />}
                title="Continue catalogue"
                note="Changes before go-live need no review."
              />
              <QuickAction
                href="/merchant/team"
                icon={<Smartphone className="h-4 w-4" />}
                title="Install on counter phone"
                note="Order sounds and the accept screen."
              />
              <QuickAction
                href="/merchant/messages"
                icon={<MessageSquare className="h-4 w-4" />}
                title="Book a setup call"
                note="Fifteen minutes with merchant ops."
              />
            </div>
          </section>

          <section className="border-border bg-surface rounded-xl border p-5">
            <h2 className="text-[0.9375rem] font-extrabold tracking-tight">This week&apos;s money</h2>
            <p className="mt-3 text-[1.75rem] font-extrabold tracking-tight">{kes(0)}</p>
            <p className="text-muted-light text-[0.8125rem] font-semibold">no orders yet</p>
            <p className="text-muted mt-3 text-[0.75rem] font-semibold leading-[1.65]">
              Once live, this shows gross sales, NexG fees, refunds and the net you are paid on
              Friday — from the same view as your statement, so the two cannot disagree.
            </p>
            <div className="border-border mt-4 flex items-center justify-between gap-2 border-t pt-3">
              <span className="text-muted flex items-center gap-2 text-[0.8125rem] font-semibold">
                <CreditCard className="h-3.5 w-3.5" aria-hidden="true" /> Payouts
              </span>
              <span className="text-muted-light text-[0.75rem] font-extrabold">
                {m.payout_rail ? 'Set' : 'No method yet'}
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function BranchTile({ b, live }: { b: BranchCard; live: boolean }) {
  const STATE: Record<string, { label: string; tone: string }> = {
    open: { label: 'Open · accepting', tone: 'bg-success/15 text-success' },
    busy: { label: 'Busy', tone: 'bg-warn/15 text-warn' },
    paused: { label: 'Paused', tone: 'bg-muted/20 text-muted-light' },
    closed: { label: 'Closed', tone: 'bg-muted/20 text-muted-light' },
    setting_up: { label: 'Setup in progress', tone: 'bg-gold-soft text-gold-text' },
  };
  const s = STATE[b.state] ?? { label: b.state, tone: 'bg-bg text-muted' };

  return (
    <Link
      href="/merchant/stores"
      className="group bg-ink relative flex min-h-[8rem] flex-col justify-end overflow-hidden rounded-xl p-4 text-white transition-transform hover:-translate-y-0.5"
    >
      <span className="absolute inset-0 bg-gradient-to-br from-white/[0.07] to-transparent" />
      <span className="absolute left-4 top-4 text-[0.5rem] font-extrabold uppercase tracking-[0.12em] text-white/40">
        Photo · storefront
      </span>
      <span className="relative">
        <span className="block text-[1.0625rem] font-extrabold tracking-tight">{b.name}</span>
        <span className="mt-0.5 block text-[0.75rem] font-semibold text-white/55">
          {b.address_text ?? 'Address not set'}
        </span>
        <span
          className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[0.6875rem] font-extrabold ${s.tone}`}
        >
          {s.label}
        </span>
        <span className="mt-2.5 flex gap-4 border-t border-white/10 pt-2.5 text-[0.6875rem] font-semibold text-white/55">
          <span>
            {live ? `${b.orders_today} orders today` : `Catalogue ${b.catalogue_items} items`}
          </span>
          <span>
            {b.prep_avg_minutes ? `Prep ${b.prep_avg_minutes} min avg` : 'Prep — '}
          </span>
        </span>
      </span>
    </Link>
  );
}

function partOfDay(): string {
  const hour = Number(
    new Date().toLocaleString('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Africa/Nairobi',
    }),
  );
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}
