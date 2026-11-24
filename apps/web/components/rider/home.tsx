import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Banknote,
  Bike,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
  Headphones,
  ListChecks,
  MapPin,
  MessageSquare,
  Moon,
  Package,
  Rocket,
  ShieldCheck,
  Siren,
  Smartphone,
  Star,
  Sun,
  TrendingUp,
  User,
  Wallet,
  Zap,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import * as React from 'react';

import { OnlineSwitch } from './online-switch';
import type {
  RiderAttentionRow,
  RiderHome as RiderLayoutHome,
  RiderJob,
  RiderProgress,
  WeekEarnings,
} from './types';

/*
 * The rider's Home: a greeting banner with the rider's status, four figure
 * cards, Needs attention, Your performance, the earnings trend, Getting started (or Today's
 * jobs once active), help and quick actions.
 *
 * Figures are only ever real ones. Where a number is not known it says so,
 * never an example; there are no goals, leaderboards or projected earnings.
 */

const STEPS = [
  {
    key: 'step_profile' as const,
    title: 'Profile & phone',
    body: 'Your name, phone and home zone.',
    href: '/rider/profile',
    button: 'Open profile',
  },
  {
    key: 'step_vehicle' as const,
    title: 'Motorbike',
    body: 'Your number plate and motorbike details.',
    href: '/rider/profile',
    button: 'Add details',
  },
  {
    key: 'step_app' as const,
    title: 'Rider app',
    body: 'The app on your phone, with notifications and location allowed.',
    href: '/rider/support',
    button: 'Get help',
  },
  {
    key: 'step_documents' as const,
    title: 'Documents',
    body: 'ID, riding licence, insurance and police clearance. Clear photos are fine.',
    href: '/rider/documents',
    button: 'Upload',
  },
  {
    key: 'step_payout' as const,
    title: 'Payout number',
    body: 'The M-Pesa number you are paid to.',
    href: '/rider/profile',
    button: 'Add number',
  },
  {
    key: 'step_session' as const,
    title: 'Onboarding session & kit',
    body: 'Collect your NexG rider kit and learn hand-offs, cash rules and safety.',
    href: '/rider/kit',
    button: 'Rider kit',
  },
  {
    key: 'step_training' as const,
    title: 'Training & test delivery',
    body: 'Three short modules, then one test delivery with rider ops.',
    href: '/rider/health',
    button: 'Start',
  },
];

const kes = (value: number | null | undefined) =>
  value == null
    ? '—'
    : `${value < 0 ? '− ' : ''}KSh ${Math.abs(Math.round(value)).toLocaleString('en-KE')}`;

function partOfDay(): 'morning' | 'afternoon' | 'evening' {
  const hour = Number(
    new Date().toLocaleString('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Africa/Nairobi',
    }),
  );
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}

function accountState(h: RiderLayoutHome, active: boolean): { value: string; note: string } {
  if (active) return { value: 'Active', note: 'You can take deliveries on NexG.' };
  if (h.status === 'under_review')
    return { value: 'In review', note: 'Rider ops is checking your documents.' };
  if (h.status === 'documents_pending' || (h.documents_missing ?? 0) > 0)
    return { value: 'Documents needed', note: 'Upload your documents to move to review.' };
  if (h.status === 'suspended' || h.status === 'paused')
    return { value: 'Paused', note: h.status_reason ?? 'Contact rider support.' };
  return { value: 'Applied', note: 'Finish the steps below to get on the road.' };
}

const panel = 'min-w-0 rounded-[20px] border border-[#e6e9f2] bg-white p-4 sm:p-5';
const ring =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141a2a]';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Read on the Home page from rider_health_v, the payout overview and rider_earning. */
export interface RiderPerformance {
  acceptancePct: number | null;
  onTimePct: number | null;
  rating: number | null;
  trips30d: number | null;
  /** Health score, oldest first. */
  trend: number[];
  /** This week's pay per day, Monday first. */
  days: number[];
  lastWeekTotal: number;
  availableKes: number | null;
}

export function RiderHomeView({
  h,
  active,
  progress,
  attention,
  jobs,
  week,
  performance,
}: {
  h: RiderLayoutHome;
  active: boolean;
  progress: RiderProgress | null;
  attention: RiderAttentionRow[];
  jobs: RiderJob[];
  week: WeekEarnings | null;
  performance: RiderPerformance;
}) {
  const name = h.first_name ?? h.name?.split(' ')[0] ?? 'there';
  const account = accountState(h, active);
  const done = progress ? STEPS.filter((step) => progress[step.key]).length : 0;
  const total = STEPS.length;
  const online = h.presence === 'online';
  const agreementWaiting = (h as { agreement_to_accept?: boolean }).agreement_to_accept === true;
  const docsToDo = (h.documents_missing ?? 0) + (h.documents_to_fix ?? 0);
  const nextStep = STEPS.find((step) => !progress?.[step.key]);
  const time = partOfDay();
  const weekTotal = performance.days.reduce((sum, value) => sum + value, 0);

  return (
    <div className="mx-auto w-full max-w-[112rem] space-y-5 px-3 pb-10 pt-1 sm:px-6">
      {/* Greeting banner */}
      <section className="relative isolate overflow-hidden rounded-[24px] bg-[#0b1d4a] text-white">
        <Image
          src="/images/join/rider.jpg"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 75vw, 100vw"
          className="-z-20 object-cover object-[72%_28%]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0b1d4a] via-[#0b1d4a]/[0.9] to-[#0b1d4a]/30 sm:via-[#0b1d4a]/60 sm:via-40% sm:to-transparent"
        />
        {/* The gold sweep along the bottom left, as drawn. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 600 120"
          preserveAspectRatio="none"
          className="absolute bottom-0 left-0 -z-10 h-16 w-[60%] sm:h-20"
        >
          <path d="M0 120 L0 70 C 120 40, 260 110, 600 120 Z" fill="#D2AF26" opacity="0.9" />
          <path d="M0 120 L0 95 C 160 70, 300 118, 520 120 Z" fill="#f5b400" opacity="0.9" />
        </svg>
        <div className="flex flex-col gap-5 p-5 pb-12 sm:p-7 sm:pb-14 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span aria-hidden="true" className="hidden shrink-0 sm:block">
              {time === 'evening' ? (
                <Moon className="text-gold h-16 w-16" strokeWidth={1.6} />
              ) : (
                <Sun className="text-gold h-16 w-16" strokeWidth={1.6} />
              )}
            </span>
            <div className="min-w-0">
              <h1 className="text-[26px] font-extrabold leading-tight tracking-tight sm:text-[36px]">
                Good {time}, <span className="text-gold">{name}!</span>
              </h1>
              <p className="mt-1 text-[16px] font-bold text-white/90 sm:text-[20px]">
                {active ? 'Ride smart. Earn more.' : 'Let’s get you on the road.'}
              </p>
              <Link
                href={active ? '/rider/jobs' : (nextStep?.href ?? '/rider/documents')}
                className={`bg-gold mt-4 inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-[15px] font-extrabold text-[color:var(--rider-ink)] shadow-[0_8px_20px_-10px_rgb(var(--gold-rgb))] ${ring}`}
              >
                {active ? 'View today’s jobs' : 'Continue setup'}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="w-full shrink-0 rounded-2xl border border-white/15 bg-[#0d1120]/75 p-4 backdrop-blur md:w-[280px]">
            {active ? (
              <>
                <OnlineSwitch online={online} />
                <p className="mt-2 text-[13px] font-semibold text-white/80">
                  {h.offers_paused_reason ??
                    (online ? 'Ready to accept jobs.' : 'Switch on to receive delivery offers.')}
                </p>
              </>
            ) : (
              <>
                <p className="text-[13px] font-bold text-white/80">Your status</p>
                <p className="text-gold mt-1.5 flex items-center gap-2 text-[20px] font-extrabold">
                  <span aria-hidden="true" className="bg-gold h-3 w-3 rounded-full" />
                  {account.value}
                </p>
                <p className="mt-2 flex items-start gap-2 text-[13px] font-semibold text-white/85">
                  <Zap className="text-gold mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {account.note}
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Figures */}
      <section aria-label="Your figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {active ? (
          <>
            <Kpi
              tone="blue"
              href="/rider/jobs"
              icon={<Bike />}
              value={String(h.trips_today ?? 0)}
              label="Trips today"
            />
            <Kpi
              tone="green"
              href="/rider/earnings"
              icon={<Wallet />}
              value={kes(performance.availableKes)}
              label="Current balance"
            />
            <Kpi
              tone="purple"
              href="/rider/earnings"
              icon={<BarChart3 />}
              value={kes(h.earned_today_kes ?? 0)}
              label="Today’s earnings"
            />
            <Kpi
              tone="orange"
              href="/rider/cash"
              icon={<Banknote />}
              value={kes(h.cash_on_hand ?? 0)}
              label={
                h.cash_cap != null ? `Cash on hand · limit ${kes(h.cash_cap)}` : 'Cash on hand'
              }
            />
          </>
        ) : (
          <>
            <Kpi
              tone="blue"
              href={nextStep?.href ?? '/rider/profile'}
              icon={<ListChecks />}
              value={`${done} of ${total}`}
              label="Setup steps done"
            />
            <Kpi
              tone="green"
              href="/rider/documents"
              icon={<ShieldCheck />}
              value={account.value}
              label="Application"
            />
            <Kpi
              tone="purple"
              href="/rider/profile"
              icon={<Smartphone />}
              value={h.payout_msisdn ? 'Added' : 'Not added'}
              label="M-Pesa payout number"
            />
            <Kpi
              tone="orange"
              href="/rider/profile"
              icon={<MapPin />}
              value={h.city ?? 'Not set'}
              label={h.plate_no ? `Home zone · ${h.plate_no}` : 'Home zone'}
            />
          </>
        )}
      </section>

      <div className="grid items-stretch gap-5 xl:grid-cols-[1.12fr_1fr]">
        {/* Needs attention */}
        <section className={panel}>
          <PanelHead
            icon={<AlertCircle />}
            iconTone="bg-red-600 text-white rounded-full"
            title="Needs attention"
            href="/rider/messages"
            link="View all"
          />
          {attention.length === 0 && docsToDo === 0 && !agreementWaiting ? (
            <p className="mt-4 rounded-xl bg-[#f6f7fb] px-4 py-5 text-[14px] font-semibold text-slate-600">
              Nothing needs you right now.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {agreementWaiting ? (
                <AttentionRow
                  icon={<FileText />}
                  title="Rider Agreement"
                  detail="A new version of the Rider Agreement is waiting for you."
                  href="/rider/profile"
                  button="Review"
                  tone="red"
                />
              ) : null}
              {docsToDo > 0 &&
              !attention.some((item) => item.href.startsWith('/rider/documents')) ? (
                <AttentionRow
                  icon={<FileText />}
                  title={`${docsToDo} ${docsToDo === 1 ? 'document needed' : 'documents needed'}`}
                  detail="Photos from your phone are fine. Rider ops checks them."
                  href="/rider/documents"
                  button="Upload now"
                  tone="red"
                />
              ) : null}
              {attention.map((item) => {
                const training = /training|module/i.test(item.title);
                const documents = item.href.startsWith('/rider/documents');
                return (
                  <AttentionRow
                    key={item.kind}
                    icon={training ? <GraduationCap /> : documents ? <FileText /> : <AlertCircle />}
                    title={item.title}
                    detail={item.body}
                    href={item.href}
                    button={item.action}
                    tone={documents || item.tone === 'danger' ? 'red' : 'blue'}
                  />
                );
              })}
            </div>
          )}
        </section>

        {/* Your performance */}
        <section className={panel}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2.5 text-[20px] font-extrabold">
              <BarChart3 className="h-6 w-6" aria-hidden="true" />
              Your performance
            </h2>
            <span className="rounded-xl bg-[#f3f5fa] px-3 py-1.5 text-[13px] font-bold text-slate-600">
              Last 30 days
            </span>
          </div>
          {performance.trips30d ? (
            <div className="mt-4 grid items-center gap-4 sm:grid-cols-[auto_1fr]">
              <Gauge pct={performance.acceptancePct} label="Acceptance rate" />
              <div className="min-w-0">
                <div className="grid grid-cols-3 divide-x divide-[#e6e9f2] text-center">
                  <Stat
                    icon={<CheckCircle2 className="fill-green-500 text-white" />}
                    value={String(performance.trips30d)}
                    label="Completed jobs"
                  />
                  <Stat
                    icon={<Star className="fill-amber-400 text-amber-400" />}
                    value={performance.rating != null ? performance.rating.toFixed(1) : '—'}
                    label="Rider rating"
                  />
                  <Stat
                    icon={<Clock className="text-blue-600" />}
                    value={
                      performance.onTimePct != null ? `${Math.round(performance.onTimePct)}%` : '—'
                    }
                    label="On time"
                  />
                </div>
                <Sparkline values={performance.trend} />
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-[#f6f7fb] px-4 py-6 text-[14px] font-semibold text-slate-600">
              Your acceptance rate, rating and on-time record show here after your first deliveries.
            </p>
          )}
        </section>
      </div>

      <div className="grid items-stretch gap-5 xl:grid-cols-3">
        {/* Earnings trend */}
        <section className="min-w-0 rounded-[20px] bg-gradient-to-b from-[#121829] to-[#0b0f1c] p-5 text-white">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-[18px] font-extrabold">
              <TrendingUp className="text-gold h-5 w-5" aria-hidden="true" />
              Your earnings trend
            </h2>
            <span className="rounded-xl border border-white/15 px-3 py-1 text-[12.5px] font-bold text-white/80">
              This week
            </span>
          </div>
          <p className="mt-4 flex flex-wrap items-baseline gap-x-3 text-[32px] font-extrabold tabular-nums tracking-tight">
            {kes(weekTotal)}
            {performance.lastWeekTotal > 0 ? (
              <Change now={weekTotal} before={performance.lastWeekTotal} />
            ) : null}
          </p>
          <p className="text-[14px] font-semibold text-white/75">
            {performance.lastWeekTotal > 0
              ? `vs ${kes(performance.lastWeekTotal)} last week`
              : `${week?.deliveries ?? 0} deliveries since Monday`}
          </p>
          <Bars days={performance.days} />
        </section>

        {active ? (
          <section className={panel}>
            <PanelHead
              icon={<Bike />}
              iconTone="bg-blue-100 text-blue-700"
              title="Today’s jobs"
              subtitle={`${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'} today`}
              href="/rider/jobs"
              link="View jobs"
            />
            {jobs.length === 0 ? (
              <p className="mt-4 rounded-xl bg-[#f6f7fb] px-4 py-5 text-[14px] font-semibold text-slate-600">
                No jobs yet today. Go online to receive offers.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-[#eef0f5]">
                {jobs.slice(0, 5).map((job) => (
                  <li key={job.id} className="flex min-h-[56px] items-center gap-3 py-2">
                    <Bubble tone={job.delivered_at ? 'green' : 'orange'}>
                      <Package />
                    </Bubble>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-extrabold">
                        {job.reference}
                        {job.merchant ? ` · ${job.merchant}` : ''}
                      </p>
                      <p className="truncate text-[13px] text-slate-500">
                        {job.dropoff ?? job.pickup ?? 'Address on the job'}
                      </p>
                    </div>
                    <span className="rounded-full bg-[#f1f3f8] px-3 py-1 text-[12px] font-bold capitalize text-slate-600">
                      {job.delivered_at ? 'Delivered' : job.stage.replaceAll('_', ' ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section className={panel} aria-labelledby="getting-started">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <Rocket className="mt-1 h-7 w-7 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <h2 id="getting-started" className="text-[20px] font-extrabold">
                    Getting started
                  </h2>
                  <p className="text-[14px] font-semibold text-slate-600">
                    {done} of {total} steps complete
                  </p>
                </div>
              </div>
              <Link
                href={nextStep?.href ?? '/rider/documents'}
                aria-label="Open the next step"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f5fa] ${ring}`}
              >
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <span
              className="mt-3 block h-2 overflow-hidden rounded-full bg-[#e9ecf3]"
              role="progressbar"
              aria-valuenow={done}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-label="Setup steps done"
            >
              <span
                className="block h-full rounded-full bg-green-500"
                style={{ width: `${Math.round((done / total) * 100)}%` }}
              />
            </span>
            <ol className="mt-3 space-y-1">
              {STEPS.map((step, index) => {
                const finished = Boolean(progress?.[step.key]);
                const next = step.key === nextStep?.key;
                return (
                  <li key={step.key}>
                    <Link
                      href={step.href}
                      className={`flex min-h-[40px] items-center gap-3 rounded-lg px-1 text-[14px] font-bold hover:bg-[#f6f7fb] ${ring}`}
                    >
                      {finished ? (
                        <CheckCircle2
                          className="h-7 w-7 shrink-0 fill-green-500 text-white"
                          aria-label="Done"
                        />
                      ) : (
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold ${
                            next ? 'bg-gold' : 'bg-[#eef0f5]'
                          }`}
                        >
                          {index + 1}
                        </span>
                      )}
                      <span className={finished ? 'text-slate-500' : ''}>{step.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <div className="flex min-w-0 flex-col gap-5">
          {/* Help, with SOS beside it */}
          <section className="relative isolate flex items-center gap-4 overflow-hidden rounded-[20px] bg-gradient-to-r from-[#10162a] to-[#1c2747] p-4 text-white">
            <Headphones className="text-gold h-14 w-14 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 className="text-[18px] font-extrabold">Need help?</h2>
              <p className="text-[13px] text-white/80">Message rider support about a job or pay.</p>
              <Link
                href="/rider/support"
                className={`bg-gold mt-2.5 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13.5px] font-extrabold text-[color:var(--rider-ink)] ${ring}`}
              >
                Contact support <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <Link
              href="/rider/incidents"
              className={`flex h-[88px] w-[88px] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl bg-gradient-to-b from-red-500 to-red-700 text-[18px] font-extrabold text-white shadow-[0_10px_24px_-12px_#dc2626] ${ring}`}
            >
              <Siren className="h-8 w-8" aria-hidden="true" />
              SOS
            </Link>
          </section>

          {/* Quick actions */}
          <section className={`${panel} flex-1`}>
            <h2 className="flex items-center gap-2 text-[17px] font-extrabold">
              <Zap className="text-gold h-5 w-5 fill-current" aria-hidden="true" />
              Quick actions
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
              {(active
                ? [
                    { href: '/rider/earnings', label: 'View earnings', icon: <BarChart3 /> },
                    { href: '/rider/cashout', label: 'Request cashout', icon: <Wallet /> },
                    { href: '/rider/shifts', label: 'View shifts', icon: <CalendarDays /> },
                    { href: '/rider/profile', label: 'Update profile', icon: <User /> },
                  ]
                : [
                    { href: '/rider/documents', label: 'Upload documents', icon: <FileText /> },
                    { href: '/rider/kit', label: 'Rider kit', icon: <Package /> },
                    { href: '/rider/messages', label: 'Messages', icon: <MessageSquare /> },
                    { href: '/rider/profile', label: 'Update profile', icon: <User /> },
                  ]
              ).map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex min-h-[80px] flex-col items-center justify-center gap-2 rounded-xl border border-[#e6e9f2] px-2 text-center text-[13px] font-bold transition-colors hover:bg-[#f6f7fb] ${ring} [&>svg]:h-6 [&>svg]:w-6`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const KPI_TONES = {
  blue: 'from-[#1d4ed8] to-[#3b82f6]',
  green: 'from-[#15803d] to-[#22c55e]',
  purple: 'from-[#6d28d9] to-[#a855f7]',
  orange: 'from-[#f97316] to-[#fbbf24]',
};

function Kpi({
  tone,
  href,
  icon,
  value,
  label,
}: {
  tone: keyof typeof KPI_TONES;
  href: string;
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`relative isolate flex min-h-[112px] items-center gap-4 overflow-hidden rounded-[20px] bg-gradient-to-br ${KPI_TONES[tone]} p-4 text-white shadow-[0_12px_26px_-16px_rgba(20,26,42,0.6)] ${ring}`}
    >
      {/* Decorative bars in the corner. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 80 40"
        className="absolute bottom-0 right-3 -z-10 h-12 w-24 opacity-25"
      >
        {[8, 14, 11, 20, 26, 34].map((height, index) => (
          <rect
            key={index}
            x={index * 13}
            y={40 - height}
            width="8"
            height={height}
            rx="2"
            fill="#fff"
          />
        ))}
      </svg>
      <span
        aria-hidden="true"
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 [&>svg]:h-7 [&>svg]:w-7"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[22px] font-extrabold tabular-nums leading-tight tracking-tight [hyphens:auto] [overflow-wrap:break-word]">
          {value}
        </span>
        <span className="block text-[14px] font-semibold leading-snug text-white/90">{label}</span>
      </span>
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-full bg-white/25"
      >
        <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

function PanelHead({
  icon,
  iconTone,
  title,
  subtitle,
  href,
  link,
}: {
  icon: React.ReactNode;
  iconTone: string;
  title: string;
  subtitle?: string;
  href: string;
  link: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className={`${iconTone} flex h-10 w-10 shrink-0 items-center justify-center rounded-xl [&>svg]:h-5 [&>svg]:w-5`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-[20px] font-extrabold leading-tight">{title}</h2>
          {subtitle ? <p className="text-[13px] text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      <Link
        href={href}
        className={`inline-flex shrink-0 items-center gap-1 rounded-xl bg-[#f3f5fa] px-3 py-1.5 text-[13.5px] font-bold ${ring}`}
      >
        {link} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

function AttentionRow({
  icon,
  title,
  detail,
  href,
  button,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  href: string;
  button: string;
  tone: 'red' | 'blue';
}) {
  return (
    <div
      className={`${tone === 'red' ? 'bg-red-50' : 'bg-white'} flex min-h-[72px] flex-wrap items-center gap-3 rounded-xl px-3 py-3 sm:flex-nowrap`}
    >
      <span
        aria-hidden="true"
        className={`${tone === 'red' ? 'bg-white text-red-600' : 'bg-blue-50 text-blue-700'} flex h-11 w-11 shrink-0 items-center justify-center rounded-xl [&>svg]:h-6 [&>svg]:w-6`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-extrabold">{title}</p>
        <p className="text-[13px] leading-snug text-slate-600">{detail}</p>
      </div>
      <Link
        href={href}
        className={`${tone === 'red' ? 'bg-red-600' : 'bg-blue-600'} inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-xl px-5 text-[14px] font-extrabold text-white ${ring}`}
      >
        {button}
      </Link>
    </div>
  );
}

function Gauge({ pct, label }: { pct: number | null; label: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const value = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="relative mx-auto h-36 w-36">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="64" cy="64" r={r} fill="none" stroke="#e9ecf3" strokeWidth="10" />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke="#16a34a"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[28px] font-extrabold tabular-nums text-green-700">
          {pct == null ? '—' : `${Math.round(pct)}%`}
        </span>
        <span className="text-[12.5px] font-semibold leading-tight text-slate-600">{label}</span>
      </span>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="px-2">
      <span aria-hidden="true" className="mx-auto flex justify-center [&>svg]:h-5 [&>svg]:w-5">
        {icon}
      </span>
      <p className="mt-1 text-[22px] font-extrabold tabular-nums">{value}</p>
      <p className="text-[12.5px] font-semibold leading-tight text-slate-500">{label}</p>
    </div>
  );
}

/** The health score over time, as a small green line. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => [
    (index / (values.length - 1)) * 300,
    56 - ((value - min) / span) * 46,
  ]);
  const line = points.map(([x, y]) => `${x},${y}`).join(' ');
  return (
    <figure className="mt-3">
      <svg
        viewBox="0 0 300 64"
        className="h-16 w-full"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polygon points={`0,64 ${line} 300,64`} fill="#22c55e" opacity="0.12" />
        <polyline
          points={line}
          fill="none"
          stroke="#16a34a"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="text-[12px] font-semibold text-slate-500">
        Health score, now {values[values.length - 1]}
      </figcaption>
    </figure>
  );
}

function Change({ now, before }: { now: number; before: number }) {
  const change = Math.round(((now - before) / before) * 100);
  const up = change >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[18px] font-extrabold ${up ? 'text-green-400' : 'text-red-400'}`}
    >
      <ArrowUpRight className={`h-5 w-5 ${up ? '' : 'rotate-90'}`} aria-hidden="true" />
      {Math.abs(change)}%
    </span>
  );
}

function Bars({ days }: { days: number[] }) {
  const max = Math.max(...days, 1);
  const today = (new Date().getDay() + 6) % 7;
  return (
    <figure className="mt-5">
      <div className="grid h-36 grid-cols-7 items-end gap-2 border-b border-white/15 pb-1">
        {days.map((value, index) => (
          <div key={DAYS[index]} className="flex h-full items-end justify-center">
            <span
              className={`w-full max-w-[34px] rounded-t-md ${index === today ? 'from-gold to-gold-light bg-gradient-to-t' : 'from-gold-deep to-gold bg-gradient-to-t'}`}
              style={{ height: `${Math.max(4, (value / max) * 100)}%` }}
              title={`${DAYS[index]}: ${kes(value)}`}
            />
          </div>
        ))}
      </div>
      <figcaption className="mt-1.5 grid grid-cols-7 gap-2">
        {DAYS.map((day, index) => (
          <span key={day} className="text-center text-[12.5px] font-semibold text-white/80">
            {day}
            <span className="sr-only">: {kes(days[index] ?? 0)}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

function Bubble({ tone, children }: { tone: 'orange' | 'green'; children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={`${tone === 'green' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-amber-900'} flex h-9 w-9 shrink-0 items-center justify-center rounded-full [&>svg]:h-4 [&>svg]:w-4`}
    >
      {children}
    </span>
  );
}
