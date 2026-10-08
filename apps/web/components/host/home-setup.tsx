import { Clock, FileText, Monitor, Phone, QrCode } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import type { Attention, HostHome, SetupProgress } from '@/app/host/layout';

import {
  Attention as AttentionCard,
  Check,
  DASH,
  PreviewBadge,
  QuickAction,
  Ring,
  Tile,
  greeting,
} from './bits';

/**
 * The portal for a host who has registered and not finished.
 *
 * Everything here is arranged around one question: what is left,
 * and what does finishing it actually get me. The second half of
 * that matters as much as the first — a setup flow that only
 * nags is one people abandon, so the strip says plainly what
 * going live unlocks, and every locked section can still be
 * opened to see a sample of what will be in it.
 *
 * Nothing on this screen shows a zero where a real figure will
 * later go. A zero reads as "nothing has happened"; these say
 * "not yet, and here is why".
 */

const STEPS = [
  {
    n: 1,
    key: 'step_about' as const,
    title: 'About you',
    body: 'Name, phone verified, host kind, city.',
    action: 'Edit',
    href: '/host/settings',
  },
  {
    n: 2,
    key: 'step_unit' as const,
    title: 'First unit',
    body: 'Building, floor and pin confirmed on the map · check-in and check-out times.',
    action: 'Edit',
    href: '/host/units',
  },
  {
    n: 3,
    key: 'step_handoff' as const,
    title: 'How riders hand over',
    body: 'Your hand-off rule, and the person who receives confirming they will.',
    action: 'Resend confirmation',
    href: '/host/units',
  },
  {
    n: 4,
    key: 'step_packages' as const,
    title: 'Guests & packages',
    body: 'Welcome packages per booking, billing method, language for guest messages.',
    action: 'Set up or skip',
    href: '/host/packages',
    optional: true,
  },
  {
    n: 5,
    key: 'step_verify' as const,
    title: 'Verify & go live',
    body: 'Prove the listing is yours, by code, screenshot or a five-minute call.',
    action: 'Choose a method',
    href: '/host/verify',
  },
];

export function HomeSetup({
  home,
  progress,
  attention,
  readiness,
}: {
  home: HostHome;
  progress: SetupProgress;
  attention: Attention[];
  readiness: {
    unit_id: string;
    unit_name: string;
    address_done: boolean;
    handoff_done: boolean;
    contact_confirmed: boolean;
    hours_done: boolean;
    qr_placed: boolean;
    ready_count: number;
    ready_of: number;
  } | null;
}) {
  const firstName = (home.contact_name ?? '').split(' ')[0] || 'there';
  const pct = Math.round((progress.done_count / progress.of_count) * 100);
  const caretaker = attention.find((a) => a.kind === 'caretaker_unconfirmed');

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0 space-y-6">
        <div>
          <h1 className="font-serif text-[2rem] font-extrabold leading-tight tracking-tight">
            {greeting(false, firstName)}
          </h1>
          <p className="text-muted mt-2 max-w-2xl text-[0.9375rem] font-semibold leading-[1.7]">
            Your application for <strong className="text-ink">{home.display_name}</strong> is in.{' '}
            {progress.of_count - progress.done_count} step
            {progress.of_count - progress.done_count === 1 ? '' : 's'} remain before guests can
            order from your units; you can finish them in any order and look around the rest of the
            portal meanwhile.
          </p>
        </div>

        {/* ──────────────────────────────── the setup strip */}
        <section className="bg-ink overflow-hidden rounded-xl text-white">
          <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5">
            <div>
              <h2 className="text-[1.0625rem] font-extrabold tracking-tight">
                Finish setting up to go live
              </h2>
              <p className="mt-0.5 text-[0.8125rem] font-semibold text-white/55">
                Saved as you go. Pick up anywhere.
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

          <ol className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s) => {
              const done = progress[s.key];
              const next = progress.next_step === s.n;
              return (
                <li
                  key={s.n}
                  className={`flex flex-col rounded-lg border p-3.5 ${
                    next
                      ? 'border-gold bg-gold text-ink'
                      : done
                        ? 'border-white/15 bg-white/[0.06]'
                        : 'border-white/10 bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[0.5625rem] font-extrabold uppercase tracking-[0.1em] ${
                        next ? 'text-ink/70' : 'text-white/45'
                      }`}
                    >
                      Step {s.n}
                      {s.optional ? ' · optional' : ''}
                      {next ? ' · next' : ''}
                    </span>
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full text-[0.5625rem] font-extrabold ${
                        done
                          ? 'bg-success text-white'
                          : next
                            ? 'bg-ink text-white'
                            : 'bg-white/15 text-white/70'
                      }`}
                      aria-hidden="true"
                    >
                      {done ? '✓' : s.n}
                    </span>
                  </div>
                  <h3
                    className={`mt-2 text-[0.875rem] font-extrabold leading-tight ${
                      next ? 'text-ink' : ''
                    }`}
                  >
                    {s.title}
                  </h3>
                  <p
                    className={`mt-1 flex-1 text-[0.6875rem] font-semibold leading-[1.5] ${
                      next ? 'text-ink/70' : 'text-white/50'
                    }`}
                  >
                    {s.body}
                  </p>
                  <Link
                    href={s.href}
                    className={`mt-2.5 text-[0.75rem] font-extrabold underline-offset-2 hover:underline ${
                      next ? 'text-ink' : 'text-gold'
                    }`}
                  >
                    {done && !next ? 'Edit →' : `${s.action} →`}
                  </Link>
                </li>
              );
            })}
          </ol>

          <div className="border-t border-white/10 px-5 py-3.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[0.75rem] font-extrabold">What going live unlocks</span>
              <span className="flex-1 text-[0.75rem] font-semibold leading-[1.6] text-white/55">
                Your QR card pack, guest ordering from the unit, deliveries with your hand-off
                rule, requests handled by the concierge desk, and the monthly statement. Everything
                else is open to explore with sample data marked PREVIEW.
              </span>
            </div>
          </div>
        </section>

        {/* ───────────────────────────────────── the tiles */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Tile
            href="/host/properties"
            title="My Properties"
            note={`${home.display_name} · add photos and front-desk hours any time`}
            chip={`${home.units_setting_up} in setup`}
            chipTone="gold"
          />
          <Tile
            href="/host/units"
            title="Units & Rooms"
            note="Address, hand-off, hours and the QR card — five things per unit"
            chip={readiness ? `${readiness.ready_count} of ${readiness.ready_of} ready` : 'no units'}
            chipTone="danger"
          />
          <Tile
            href="/host/qr"
            title="QR Cards"
            note="Generated the moment you are verified · print pack sent within 2 working days"
            chip="After verification"
            preview
          />
          <Tile
            href="/host/deliveries"
            title="Deliveries"
            note="What arrives, when, and how it was handed over · with proof"
            chip="No deliveries yet"
            preview
          />
          <Tile
            href="/host/team"
            title="Team"
            note="Invite a manager or caretaker now · per-unit access"
            chip="Just you"
          />
          <Tile
            href="/host/earnings"
            title="Earnings & Invoices"
            note="Attributed orders, any commission share and invoices"
            chip="From first month live"
            preview
          />
        </div>

        {/* ────────────────────────── the verification banner */}
        <section className="bg-ink grid gap-0 overflow-hidden rounded-xl text-white sm:grid-cols-[14rem_1fr]">
          <div className="from-gold/20 relative hidden bg-gradient-to-br to-transparent sm:block">
            <span className="absolute bottom-3 left-3 text-[0.5rem] font-extrabold uppercase tracking-[0.12em] text-white/40">
              Photo · Listing
            </span>
          </div>
          <div className="p-5">
            <h2 className="font-serif text-[1.375rem] font-extrabold tracking-tight">
              Verify that this is your listing
            </h2>
            <p className="mt-2 max-w-xl text-[0.8125rem] font-semibold leading-[1.65] text-white/60">
              Paste{' '}
              <strong className="text-gold font-mono">{home.verification_code ?? DASH}</strong>{' '}
              into your listing description and leave it for 24 hours; we check it and remove the
              step. Prefer not to edit the listing? Upload a host-dashboard screenshot or book a
              five-minute call instead.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link
                href="/host/verify"
                className="bg-gold text-ink rounded-lg px-4 py-2.5 text-[0.8125rem] font-extrabold"
              >
                Choose how to verify →
              </Link>
              <span className="flex gap-4 text-[0.6875rem] font-semibold text-white/50">
                <span className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Listing code
                </span>
                <span className="flex items-center gap-1.5">
                  <Monitor className="h-3.5 w-3.5" aria-hidden="true" /> Screenshot
                </span>
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" /> 5-min call
                </span>
              </span>
            </div>
          </div>
        </section>

        {/* ──────────────────────────────── QR activity, empty */}
        <section>
          <h2 className="font-serif text-[1.375rem] font-extrabold tracking-tight">QR activity</h2>
          <p className="text-muted-light mt-1 text-[0.8125rem] font-semibold">
            Once your card is placed, every scan is recorded here with the unit, the time, and the
            first order placed after it.
          </p>

          <div className="border-border bg-surface mt-3 overflow-hidden rounded-xl border">
            <div className="border-border m-4 flex flex-wrap items-center gap-4 rounded-lg border border-dashed p-4">
              <span className="bg-bg text-muted flex h-10 w-10 items-center justify-center rounded-lg">
                <QrCode className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.875rem] font-extrabold">
                  No scans yet — your QR card is generated after verification
                </p>
                <p className="text-muted mt-0.5 text-[0.75rem] font-semibold leading-[1.6]">
                  The sample below shows what this table looks like for a live unit. You can order
                  extra cards — tent, door sticker, key fob — from QR Cards once live.
                </p>
              </div>
              <Link
                href="/host/verify"
                className="bg-ink shrink-0 rounded-lg px-3.5 py-2 text-[0.75rem] font-extrabold text-white"
              >
                Go to step 5 →
              </Link>
            </div>

            <table className="w-full text-left">
              <thead className="border-border bg-bg border-y">
                <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                  <th className="px-4 py-2">Unit</th>
                  <th className="px-4 py-2">Scanned</th>
                  <th className="px-4 py-2">Guest</th>
                  <th className="px-4 py-2">Ordered</th>
                  <th className="px-4 py-2">Hand-off</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-border border-b text-[0.8125rem] font-semibold">
                  <td className="text-muted-light px-4 py-3 font-extrabold">SAMPLE</td>
                  <td className="text-muted px-4 py-3">Today 13:58</td>
                  <td className="text-muted px-4 py-3">Guest</td>
                  <td className="px-4 py-3">
                    <PreviewBadge />
                  </td>
                  <td className="text-muted px-4 py-3">Askari · gate</td>
                  <td className="px-4 py-3">
                    <span className="bg-success/10 text-success rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold">
                      Delivered
                    </span>
                  </td>
                </tr>
                <tr className="text-[0.8125rem] font-semibold">
                  <td className="text-muted-light px-4 py-3 font-extrabold">SAMPLE</td>
                  <td className="text-muted px-4 py-3">Yesterday 20:12</td>
                  <td className="text-muted px-4 py-3">Guest</td>
                  <td className="text-muted px-4 py-3">Browsed · no order</td>
                  <td className="text-muted-light px-4 py-3">{DASH}</td>
                  <td className="px-4 py-3">
                    <span className="bg-bg text-muted rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold">
                      Scan only
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ══════════════════════════════════ the right column */}
      <aside className="space-y-4">
        {readiness ? (
          <section className="border-border bg-surface rounded-xl border p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[0.875rem] font-extrabold tracking-tight">
                {readiness.unit_name} readiness
              </h2>
              <Link
                href="/host/units"
                className="border-border-strong rounded-lg border px-2.5 py-1 text-[0.6875rem] font-extrabold"
              >
                Open →
              </Link>
            </div>
            <div className="mt-3 flex items-center gap-4">
              <Ring done={readiness.ready_count} of={readiness.ready_of} />
              <ul className="min-w-0 flex-1 space-y-1.5">
                <Check done={readiness.address_done} label="Address & pin confirmed" />
                <Check
                  done={readiness.contact_confirmed}
                  label="Hand-off rule"
                  note={readiness.contact_confirmed ? undefined : 'awaiting SMS'}
                />
                <Check done={readiness.handoff_done} label="Caretaker confirmed" />
                <Check done={readiness.hours_done} label="Delivery hours set" />
                <Check done={readiness.qr_placed} label="QR card placed" />
              </ul>
            </div>
            <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.6]">
              A unit goes live only when all five are done and your host account is verified. You
              can add more units now; each has its own readiness.
            </p>
          </section>
        ) : null}

        {caretaker ? (
          <AttentionCard
            title={caretaker.title}
            body={caretaker.body}
            actions={
              <>
                <Link
                  href="/host/units"
                  className="bg-ink rounded-lg px-3 py-1.5 text-[0.75rem] font-extrabold text-white"
                >
                  Resend SMS
                </Link>
                <Link
                  href="/host/units"
                  className="border-border-strong bg-surface rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold"
                >
                  Change rule
                </Link>
              </>
            }
          />
        ) : null}

        <section className="border-border bg-surface rounded-xl border">
          <div className="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
            <h2 className="text-[0.875rem] font-extrabold tracking-tight">Verification</h2>
            <span className="bg-gold-soft text-gold-text rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold">
              {progress.step_verify ? 'Submitted' : 'Pending'}
            </span>
          </div>
          <div className="divide-border divide-y">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5">
              <span className="text-muted flex items-center gap-2 text-[0.8125rem] font-semibold">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Listing code
              </span>
              <span className="text-right">
                <span className="block font-mono text-[0.8125rem] font-extrabold">
                  {home.verification_code ?? DASH}
                </span>
                <span className="text-muted-light text-[0.6875rem] font-semibold">
                  {progress.step_verify ? 'submitted' : 'not seen'}
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 px-4 py-2.5">
              <span className="text-muted flex items-center gap-2 text-[0.8125rem] font-semibold">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Usual time
              </span>
              <span className="text-[0.8125rem] font-extrabold">1 working day</span>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-[0.875rem] font-extrabold tracking-tight">Quick Access</h2>
          <div className="grid grid-cols-2 gap-2.5">
            <QuickAction
              href="/host/units"
              icon={<Phone className="h-4 w-4" />}
              title="Resend caretaker SMS"
              note="One-tap confirmation"
            />
            <QuickAction
              href="/host/units"
              icon={<Clock className="h-4 w-4" />}
              title="Set delivery hours"
              note="When riders may come"
            />
            <QuickAction
              href="/host/units"
              icon={<QrCode className="h-4 w-4" />}
              title="Add another unit"
              note="Copy from the first"
            />
            <QuickAction
              href="/host/verify"
              icon={<Phone className="h-4 w-4" />}
              title="Book a 5-min call"
              note="Verify by phone"
            />
          </div>
        </section>
      </aside>
    </div>
  );
}
