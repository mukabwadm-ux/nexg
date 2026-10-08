import { BookOpen, Calendar, FileText, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Attention, DASH, PreviewBadge, QuickAction, Tile, kesh, partOfDay } from './bits';
import type { RiderAttentionRow, RiderHome, RiderProgress } from './types';

/**
 * The dashboard for somebody who has applied and cannot ride
 * yet.
 *
 * Two things it has to do at once: say what is left, and make
 * the wait feel like progress rather than silence. The second
 * is why "Before your first delivery" exists — the session
 * slot, the training modules, and how pay actually works. A
 * rider who has uploaded documents and heard nothing for three
 * days goes and signs up with somebody else.
 *
 * How pay works is shown as the rate card's own lines with
 * `[—]` where a figure is not set, never as an example day's
 * earnings. The design is explicit about this and so is the
 * copy: no projected earnings, ever.
 */

const STEPS = [
  {
    n: 1,
    key: 'step_profile' as const,
    title: 'Profile & phone',
    body: 'Name, phone verified by OTP, home zone, language.',
    href: '/rider/profile',
    action: 'Edit',
  },
  {
    n: 2,
    key: 'step_vehicle' as const,
    title: 'Vehicle',
    body: 'Boda, bicycle or car. Plate, and whether it is yours or a fleet bike.',
    href: '/rider/profile',
    action: 'Edit',
  },
  {
    n: 3,
    key: 'step_app' as const,
    title: 'App installed',
    body: 'The rider app on your phone, with notifications and location allowed.',
    href: '/rider/support',
    action: 'Check again',
  },
  {
    n: 4,
    key: 'step_documents' as const,
    title: 'Documents',
    body: 'National ID, driving licence, insurance or logbook, police clearance. Photos are fine.',
    href: '/rider/documents',
    action: 'Upload',
  },
  {
    n: 5,
    key: 'step_payout' as const,
    title: 'Payout number',
    body: 'The M-Pesa number you are paid to every Friday, verified with a KES 1 credit.',
    href: '/rider/earnings',
    action: 'Verify number',
  },
  {
    n: 6,
    key: 'step_session' as const,
    title: 'Onboarding session',
    body: '45 minutes at the hub or online: kit, hand-off rules, cash rules, safety.',
    href: '/rider/support',
    action: 'Book a slot',
  },
  {
    n: 7,
    key: 'step_training' as const,
    title: 'Training & test delivery',
    body: 'Three short modules, then one test delivery with rider ops. Activation follows.',
    href: '/rider/health',
    action: 'Available after 4–6',
  },
];

const MODULES = [
  { n: 1, title: 'Pickups & hand-offs', note: 'Hotels, apartments, reception, lockbox · 6 min' },
  { n: 2, title: 'Cash rules & deposits', note: 'Cap, paybill, matching · 5 min' },
  { n: 3, title: 'Safety & SOS', note: 'Rain, night, incidents · 4 min' },
];

export function DashboardPending({
  h,
  progress,
  attention,
}: {
  h: RiderHome;
  progress: RiderProgress;
  attention: RiderAttentionRow[];
}) {
  const first = h.first_name ?? (h.name ?? 'there').split(' ')[0] ?? 'there';
  const pct = Math.round((progress.done_count / progress.of_count) * 100);
  const docsToDo =
    (h.documents_missing ?? 0) + (h.documents_to_fix ?? 0) + (h.documents_asked_for ?? 0);
  const docsVerified = 4 - docsToDo;

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────── the hero */}
      <section className="bg-ink relative overflow-hidden px-4 py-6 text-white sm:px-7">
        <span className="absolute inset-0 bg-gradient-to-br from-white/[0.07] to-transparent" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <h1 className="font-serif text-[1.875rem] font-extrabold tracking-tight">
              Good {partOfDay()}, {first} 👋
            </h1>
            <p className="mt-1.5 max-w-2xl text-[0.9375rem] font-semibold text-white/65">
              Welcome to NexG. You are{' '}
              <strong className="text-gold">
                {progress.done_count} of {progress.of_count} steps
              </strong>{' '}
              from your first delivery. You cannot go online yet; everything else is yours to look
              around.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile
                icon="✓"
                value={`${progress.done_count} / ${progress.of_count}`}
                label="Steps done"
                note={`${progress.of_count - progress.done_count} pending`}
                noteTone="gold"
              />
              <Tile
                value={`${Math.max(0, docsVerified)} / 4`}
                label="Documents verified"
                note={docsToDo > 0 ? `${docsToDo} to upload` : 'all in'}
                noteTone={docsToDo > 0 ? 'danger' : 'good'}
              />
              <Tile
                value={progress.step_session ? 'Booked' : 'Not booked'}
                label="Onboarding session"
                note={progress.step_session ? 'attended' : 'slots this week'}
                noteTone={progress.step_session ? 'good' : 'gold'}
              />
              <Tile
                value={h.payout_msisdn ? '✓' : DASH}
                label="Payout number"
                note={h.payout_msisdn ? 'verified' : 'not verified'}
                noteTone={h.payout_msisdn ? 'good' : 'danger'}
              />
            </div>
          </div>

          <div className="w-full max-w-xs rounded-xl bg-black/35 p-4 backdrop-blur-sm lg:w-auto">
            <p className="text-gold text-[0.9375rem] font-extrabold">Your onboarding contact</p>
            <p className="mt-1.5 text-[0.75rem] font-semibold leading-[1.65] text-white/60">
              Rider ops is assigned to you until activation. Ask anything in Messages, or call
              during the onboarding session.
            </p>
            <Link
              href="/rider/messages"
              className="bg-gold text-ink mt-3 block rounded-lg px-4 py-2.5 text-center text-[0.8125rem] font-extrabold"
            >
              Message rider ops →
            </Link>
          </div>
        </div>
      </section>

      <div className="space-y-6 px-4 sm:px-7">
        {/* ─────────────────────────── the activation strip */}
        <section className="bg-ink overflow-hidden rounded-xl text-white">
          <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5">
            <div>
              <h2 className="text-[1.0625rem] font-extrabold tracking-tight">
                Finish activation to start earning
              </h2>
              <p className="mt-0.5 text-[0.8125rem] font-semibold text-white/55">
                Do these in any order. Your progress is saved; come back any time from your phone
                or here.
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
              const blocked = s.n === 7 && !progress.can_train;
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
                      Available after 4–6
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
            <span className="text-[0.75rem] font-extrabold">What activation unlocks</span>
            <span className="flex-1 text-[0.75rem] font-semibold leading-[1.6] text-white/55">
              Going online, offers in your zone, earnings and Friday payouts, cash orders after the
              cash rules module, shifts and shift incentives, and your health band. Until then you
              can read everything and see sample screens marked PREVIEW.
            </span>
          </div>
        </section>

        {/* ──────────────────── before your first delivery */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-[1.375rem] font-extrabold tracking-tight">
              Before your first delivery
            </h2>
            <Link
              href="/rider/support"
              className="text-gold-text text-[0.8125rem] font-extrabold hover:underline"
            >
              Rider handbook →
            </Link>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {/* the session */}
            <div className="bg-ink overflow-hidden rounded-xl p-5 text-white">
              <span className="text-[0.5625rem] font-extrabold uppercase tracking-[0.12em] text-white/45">
                Onboarding session
              </span>
              <h3 className="mt-1.5 font-serif text-[1.375rem] font-extrabold tracking-tight">
                Pick a slot
              </h3>
              <p className="mt-1 text-[0.8125rem] font-semibold text-white/60">
                At the hub on weekday mornings, or online any weekday evening.
              </p>
              <p className="mt-3 text-[0.75rem] font-semibold text-white/50">
                Step 6 · 45 min · bring your phone, licence and the bike.
              </p>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                <span className="text-[0.6875rem] font-semibold text-white/55">
                  You get your bag and kit here
                </span>
                <span className="text-[0.6875rem] font-extrabold text-white/70">
                  Kit deposit: KES {DASH}, refundable
                </span>
              </div>
              <Link
                href="/rider/support"
                className="bg-gold text-ink mt-3 block rounded-lg px-3 py-2 text-center text-[0.75rem] font-extrabold"
              >
                Pick a slot →
              </Link>
            </div>

            {/* training */}
            <div className="border-border bg-surface rounded-xl border p-5">
              <span className="text-muted-light text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
                Training · step 7
              </span>
              <ul className="mt-3 space-y-2">
                {MODULES.map((mod) => (
                  <li
                    key={mod.n}
                    className="border-border bg-bg flex items-start gap-2.5 rounded-lg border p-2.5"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-extrabold ${
                        progress.modules_passed >= mod.n
                          ? 'bg-success text-white'
                          : 'bg-ink text-white'
                      }`}
                    >
                      {progress.modules_passed >= mod.n ? '✓' : mod.n}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.8125rem] font-extrabold leading-tight">
                        {mod.title}
                      </span>
                      <span className="text-muted-light block text-[0.6875rem] font-semibold">
                        {mod.note}
                      </span>
                    </span>
                    {mod.n === 1 && progress.modules_passed === 0 ? (
                      <span className="bg-gold-soft text-gold-text shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-extrabold">
                        Open now
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold">
                Module 1 can be done now. In English or Kiswahili.
              </p>
            </div>

            {/* how pay works — lines, never a projection */}
            <div className="bg-ink overflow-hidden rounded-xl p-5 text-white">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.5625rem] font-extrabold uppercase tracking-[0.12em] text-white/45">
                  How pay works
                </span>
                <PreviewBadge />
              </div>
              <dl className="mt-3 space-y-2 text-[0.8125rem] font-semibold">
                <PayLine term="Base per delivery" value={`KES ${DASH}`} />
                <PayLine term="Per km after the first" value={`KES ${DASH}`} />
                <PayLine term="Rain / demand / shift bonuses" value="as lines" />
                <PayLine term="Tips" value="100% yours" />
              </dl>
              <p className="mt-3 border-t border-white/10 pt-3 text-[0.6875rem] font-semibold leading-[1.6] text-white/50">
                Every job shows its lines before you accept. Paid every Friday to your verified
                number. Your zone&apos;s rate card — no projected earnings, ever.
              </p>
            </div>
          </div>
        </section>

        {/* ───────────────────── the jobs table, empty */}
        <section>
          <h2 className="mb-3 font-serif text-[1.375rem] font-extrabold tracking-tight">
            Today&apos;s jobs
          </h2>
          <div className="border-border bg-surface overflow-hidden rounded-xl border">
            <div className="border-border m-4 flex flex-wrap items-center gap-4 rounded-lg border border-dashed p-4">
              <span className="bg-bg text-muted flex h-10 w-10 items-center justify-center rounded-lg text-sm">
                🛵
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.875rem] font-extrabold">
                  No jobs yet — you are not activated
                </p>
                <p className="text-muted mt-0.5 text-[0.75rem] font-semibold leading-[1.6]">
                  This is where offers arrive with a countdown and the full pay breakdown, and
                  where each job moves from pickup to hand-off. Finish steps 4 to 7 and your test
                  delivery with rider ops shows up here first.
                </p>
              </div>
            </div>

            <table className="w-full text-left">
              <thead className="border-border bg-bg border-y">
                <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                  <th className="px-4 py-2">Job</th>
                  <th className="px-4 py-2">Payment</th>
                  <th className="px-4 py-2">Your pay</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-border border-b text-[0.8125rem] font-semibold">
                  <td className="px-4 py-3">
                    <span className="text-muted-light font-extrabold">NX-SAMPLE</span>
                    <span className="text-muted-light block text-[0.6875rem]">
                      [Merchant] Kilimani → Apt 4B
                    </span>
                  </td>
                  <td className="text-muted px-4 py-3">Prepaid</td>
                  <td className="px-4 py-3">
                    <PreviewBadge />
                  </td>
                  <td className="text-muted px-4 py-3">To pickup</td>
                </tr>
                <tr className="text-[0.8125rem] font-semibold">
                  <td className="px-4 py-3">
                    <span className="text-muted-light font-extrabold">NX-SAMPLE</span>
                    <span className="text-muted-light block text-[0.6875rem]">
                      [Merchant] Westlands → [Hotel] · reception
                    </span>
                  </td>
                  <td className="text-muted px-4 py-3">Room folio</td>
                  <td className="text-muted-light px-4 py-3">
                    KES {DASH}
                    <span className="block text-[0.6875rem]">base · 3.4 km</span>
                  </td>
                  <td className="text-muted px-4 py-3">Delivered</td>
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

        {/* ────────────────────── earnings, honestly zero */}
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <section className="border-border bg-surface rounded-xl border p-5">
            <h2 className="text-[0.9375rem] font-extrabold tracking-tight">Quick actions</h2>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              <QuickAction
                href="/rider/documents"
                icon={<FileText className="h-4 w-4" />}
                title="Upload documents"
                note="Licence, insurance or logbook, police clearance. Photo or PDF."
              />
              <QuickAction
                href="/rider/support"
                icon={<Calendar className="h-4 w-4" />}
                title="Book a session"
                note="At the hub or online. 45 minutes."
              />
              <QuickAction
                href="/rider/health"
                icon={<BookOpen className="h-4 w-4" />}
                title="Start module 1"
                note="Pickups and hand-offs, 6 minutes, on your phone."
              />
              <QuickAction
                href="/rider/messages"
                icon={<MessageSquare className="h-4 w-4" />}
                title="Message rider ops"
                note="Questions about documents, the bike, or the session."
              />
            </div>
          </section>

          <section className="border-border bg-surface rounded-xl border p-5">
            <h2 className="text-[0.9375rem] font-extrabold tracking-tight">
              This week&apos;s earnings
            </h2>
            <p className="mt-3 text-[1.75rem] font-extrabold tracking-tight">{kesh(0)}</p>
            <p className="text-muted-light text-[0.8125rem] font-semibold">not active yet</p>
            <p className="text-muted mt-3 text-[0.75rem] font-semibold leading-[1.65]">
              Once activated, this shows base and distance, bonuses, tips, cash collected and
              deposited, and the net paid on Friday — the same lines as your statement.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function PayLine({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-white/70">{term}</dt>
      <dd className="text-gold shrink-0 font-extrabold">{value}</dd>
    </div>
  );
}
