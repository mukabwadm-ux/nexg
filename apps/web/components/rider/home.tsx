import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Bike,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  Headphones,
  HeartPulse,
  ListChecks,
  MapPin,
  MessageSquare,
  Moon,
  Package,
  Rocket,
  ShieldCheck,
  Smartphone,
  Sun,
  User,
  Wallet,
  Zap,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import * as React from 'react';

import type {
  RiderAttentionRow,
  RiderHome as RiderLayoutHome,
  RiderJob,
  RiderProgress,
  WeekEarnings,
} from './types';

/*
 * The rider's Home: a greeting banner with the rider's status, four figure
 * cards, Needs attention, Today at a glance, Getting started (or Today's
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

const panel = 'min-w-0 rounded-[18px] border border-[#e6e9f2] bg-white p-4 sm:p-5';
const ring =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141a2a]';

export function RiderHomeView({
  h,
  active,
  progress,
  attention,
  jobs,
  week,
}: {
  h: RiderLayoutHome;
  active: boolean;
  progress: RiderProgress | null;
  attention: RiderAttentionRow[];
  jobs: RiderJob[];
  week: WeekEarnings | null;
}) {
  const name = h.first_name ?? h.name?.split(' ')[0] ?? 'there';
  const account = accountState(h, active);
  const done = progress ? STEPS.filter((step) => progress[step.key]).length : 0;
  const total = STEPS.length;
  const pct = h.readiness_pct ?? Math.round((done / total) * 100);
  const online = h.presence === 'online';
  const agreementWaiting = (h as { agreement_to_accept?: boolean }).agreement_to_accept === true;
  const docsToDo = (h.documents_missing ?? 0) + (h.documents_to_fix ?? 0);
  const nextStep = STEPS.find((step) => !progress?.[step.key]);
  const time = partOfDay();

  return (
    <div className="mx-auto w-full max-w-[112rem] space-y-5 px-3 pb-10 pt-1 sm:px-6">
      {/* Greeting banner */}
      <section className="relative isolate overflow-hidden rounded-[22px] bg-[#0b1d4a] text-white">
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
        <div className="flex flex-col gap-5 p-5 sm:p-7 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span
              aria-hidden="true"
              className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15 sm:flex"
            >
              {time === 'evening' ? (
                <Moon className="text-gold h-9 w-9" />
              ) : (
                <Sun className="text-gold h-9 w-9" />
              )}
            </span>
            <div className="min-w-0">
              <h1 className="text-[26px] font-extrabold leading-tight tracking-tight sm:text-[34px]">
                Good {time}, <span className="text-gold">{name}!</span>
              </h1>
              <p className="mt-1 text-[15px] font-semibold text-white/85 sm:text-[17px]">
                {active
                  ? 'Here’s your day on the road.'
                  : 'Here’s where your rider application stands.'}
              </p>
              <Link
                href={active ? '/rider/jobs' : (nextStep?.href ?? '/rider/documents')}
                className={`bg-gold mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-extrabold text-[color:var(--rider-ink)] ${ring}`}
              >
                {active ? 'View today’s jobs' : 'Continue setup'}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="w-full shrink-0 rounded-2xl border border-white/15 bg-[#0d1120]/75 p-4 backdrop-blur md:w-[270px]">
            <p className="text-[13px] font-bold text-white/80">Your status</p>
            <p className="mt-1.5 flex items-center gap-2 text-[20px] font-extrabold">
              <span
                aria-hidden="true"
                className={`h-3 w-3 rounded-full ${
                  !active ? 'bg-gold' : online ? 'bg-green-400' : 'bg-slate-400'
                }`}
              />
              <span className={!active ? 'text-gold' : online ? 'text-green-400' : 'text-white'}>
                {!active ? account.value : online ? 'Online' : 'Offline'}
              </span>
            </p>
            <p className="mt-2 flex items-start gap-2 text-[13px] font-semibold text-white/85">
              <Zap className="text-gold mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {!active
                ? account.note
                : (h.offers_paused_reason ??
                  (online ? 'Ready to accept jobs.' : 'Go online in the rider app to get offers.'))}
            </p>
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
              value={kes(h.earned_today_kes ?? 0)}
              label="Earned today"
            />
            <Kpi
              tone="purple"
              href="/rider/earnings"
              icon={<CalendarDays />}
              value={kes(h.earned_week_kes ?? 0)}
              label="This week"
            />
            <Kpi
              tone="peach"
              href="/rider/cash"
              icon={<Banknote />}
              value={kes(h.cash_on_hand)}
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
              tone="peach"
              href="/rider/profile"
              icon={<MapPin />}
              value={h.city ?? 'Not set'}
              label={h.plate_no ? `Home zone · ${h.plate_no}` : 'Home zone'}
            />
          </>
        )}
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          {/* Needs attention */}
          <section className={panel}>
            <PanelHead
              icon={<AlertCircle />}
              iconTone="bg-red-100 text-red-600"
              title="Needs attention"
              href="/rider/messages"
              link="View all"
            />
            {attention.length === 0 && docsToDo === 0 && !agreementWaiting ? (
              <p className="mt-4 rounded-xl bg-[#f6f7fb] px-4 py-5 text-[14px] font-semibold text-slate-600">
                Nothing needs you right now.
              </p>
            ) : (
              <div className="mt-4 divide-y divide-red-100 rounded-xl bg-red-50/70 px-4">
                {agreementWaiting ? (
                  <AttentionRow
                    icon={<FileText />}
                    title="Rider Agreement"
                    detail="A new version of the Rider Agreement is waiting for you."
                    href="/rider/profile"
                    button="Review"
                    urgent
                  />
                ) : null}
                {attention.map((item) => (
                  <AttentionRow
                    key={item.kind}
                    icon={<AlertCircle />}
                    title={item.title}
                    detail={item.body}
                    href={item.href}
                    button={item.action}
                    urgent={item.tone === 'danger'}
                  />
                ))}
                {docsToDo > 0 &&
                !attention.some((item) => item.href.startsWith('/rider/documents')) ? (
                  <AttentionRow
                    icon={<FileText />}
                    title={`${docsToDo} ${docsToDo === 1 ? 'document needed' : 'documents needed'}`}
                    detail="Photos from your phone are fine. Rider ops checks them."
                    href="/rider/documents"
                    button="Upload now"
                    urgent
                  />
                ) : null}
              </div>
            )}
          </section>

          {active ? (
            <>
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

              <section className={panel}>
                <PanelHead
                  icon={<Banknote />}
                  iconTone="bg-green-100 text-green-700"
                  title="This week’s pay"
                  subtitle={`${week?.deliveries ?? 0} deliveries since Monday · paid every Friday`}
                  href="/rider/earnings"
                  link="Earnings"
                />
                <dl className="mt-3 divide-y divide-[#eef0f5] text-[14px]">
                  {[
                    ['Delivery fees', (week?.base_kes ?? 0) + (week?.distance_kes ?? 0)],
                    ['Bonuses', week?.bonus_kes ?? 0],
                    ['Tips', week?.tip_kes ?? 0],
                    ['Deductions', -(week?.penalty_kes ?? 0)],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex justify-between py-2">
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="font-bold tabular-nums">{kes(value as number)}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between py-2">
                    <dt className="font-extrabold">Total</dt>
                    <dd className="font-extrabold tabular-nums">{kes(week?.total_kes ?? 0)}</dd>
                  </div>
                </dl>
              </section>
            </>
          ) : (
            <section className={panel} aria-labelledby="getting-started">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <Rocket className="mt-1 h-6 w-6 shrink-0 text-blue-600" aria-hidden="true" />
                  <div className="min-w-0">
                    <h2 id="getting-started" className="text-[19px] font-extrabold">
                      Getting started
                    </h2>
                    <p className="text-[13.5px] text-slate-600">
                      Finish these, then rider ops activates you after a test delivery.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-28 overflow-hidden rounded-full bg-[#e9ecf3]"
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
                  <span className="rounded-lg bg-[#f1f3f8] px-2 py-1 text-[12px] font-extrabold tabular-nums">
                    {done}/{total}
                  </span>
                </div>
              </div>
              <ol className="mt-3 divide-y divide-[#eef0f5]">
                {STEPS.map((step, index) => {
                  const finished = Boolean(progress?.[step.key]);
                  const next = step.key === nextStep?.key;
                  return (
                    <li key={step.key} className="flex min-h-[58px] items-center gap-3 py-2">
                      {finished ? (
                        <CheckCircle2
                          className="h-7 w-7 shrink-0 fill-green-500 text-white"
                          aria-label="Done"
                        />
                      ) : (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f1f3f8] text-[12px] font-extrabold">
                          {index + 1}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-extrabold">{step.title}</p>
                        <p className="text-[12.5px] leading-snug text-slate-500">{step.body}</p>
                      </div>
                      {finished ? (
                        <span className="shrink-0 rounded-lg bg-green-100 px-3 py-1.5 text-[12px] font-extrabold text-green-800">
                          Completed
                        </span>
                      ) : (
                        <Link
                          href={step.href}
                          className={`${next ? 'bg-gold text-[color:var(--rider-ink)]' : 'bg-[#f1f3f8] text-[color:var(--rider-ink)]'} inline-flex h-9 w-[112px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-2 text-[12.5px] font-extrabold ${ring}`}
                        >
                          {step.button}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
        </div>

        <div className="space-y-5">
          {/* Today at a glance */}
          <section className={panel}>
            <PanelHead
              icon={<ClipboardList />}
              iconTone="bg-[#eef1f8] text-[color:var(--rider-ink)]"
              title="Today at a glance"
              href={active ? '/rider/earnings' : '/rider/documents'}
              link="View details"
            />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Glance
                href="/rider/documents"
                icon={<FileText />}
                label="Documents to do"
                value={String(docsToDo)}
              />
              <Glance
                href="/rider/messages"
                icon={<MessageSquare />}
                label="Unread messages"
                value={String(h.unread_messages ?? 0)}
              />
              {active ? (
                <Glance
                  href="/rider/health"
                  icon={<HeartPulse />}
                  label="Health"
                  value={h.health_band ? h.health_band.replaceAll('_', ' ') : 'Not rated yet'}
                />
              ) : (
                <Glance href="/rider/kit" icon={<Package />} label="Rider kit" value="View" />
              )}
              <Link
                href="/rider/profile"
                className={`flex min-h-[96px] items-center gap-3 rounded-xl bg-[#f6f7fb] p-3 ${ring}`}
              >
                <SetupRing pct={pct} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-slate-600">Setup</span>
                  <span className="block text-[20px] font-extrabold tabular-nums">{pct}%</span>
                </span>
              </Link>
            </div>
          </section>

          {/* Help */}
          <section className="relative isolate overflow-hidden rounded-[18px] bg-gradient-to-r from-[#10162a] to-[#1c2747] p-5 text-white">
            <div className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="bg-gold/15 flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
              >
                <Headphones className="text-gold h-9 w-9" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[20px] font-extrabold">Need help?</h2>
                <p className="text-[14px] text-white/80">
                  Message rider support about a job or pay. For danger on the road, use SOS.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/rider/support"
                    className={`bg-gold inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[14px] font-extrabold text-[color:var(--rider-ink)] ${ring}`}
                  >
                    Contact support <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <Link
                    href="/rider/incidents"
                    className={`inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-[14px] font-extrabold text-white ${ring}`}
                  >
                    SOS & incidents
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* Quick actions */}
          <section className={panel}>
            <h2 className="flex items-center gap-2 text-[17px] font-extrabold">
              <Zap className="text-gold h-5 w-5 fill-current" aria-hidden="true" />
              Quick actions
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(active
                ? [
                    { href: '/rider/earnings', label: 'View earnings', icon: <Wallet /> },
                    { href: '/rider/cash', label: 'Cash', icon: <Banknote /> },
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
                  className={`flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-xl border border-[#e6e9f2] px-2 text-center text-[13px] font-bold transition-colors hover:bg-[#f6f7fb] ${ring} [&>svg]:h-6 [&>svg]:w-6`}
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
  blue: {
    card: 'bg-gradient-to-br from-[#2563eb] to-[#4f8bff] text-white',
    icon: 'bg-white/20',
    arrow: 'bg-white/25',
    note: 'text-white/85',
  },
  green: {
    card: 'bg-gradient-to-br from-[#16a34a] to-[#3fd07f] text-white',
    icon: 'bg-white/20',
    arrow: 'bg-white/25',
    note: 'text-white/85',
  },
  purple: {
    card: 'bg-gradient-to-br from-[#7c3aed] to-[#a66bff] text-white',
    icon: 'bg-white/20',
    arrow: 'bg-white/25',
    note: 'text-white/85',
  },
  peach: {
    card: 'bg-gradient-to-br from-[#ffe4d1] to-[#fff4ec] text-[color:var(--rider-ink)]',
    icon: 'bg-white text-orange-600',
    arrow: 'bg-white/80',
    note: 'text-slate-700',
  },
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
  const t = KPI_TONES[tone];
  return (
    <Link
      href={href}
      className={`${t.card} flex min-h-[108px] items-center gap-4 rounded-[18px] p-4 shadow-[0_10px_24px_-16px_rgba(20,26,42,0.55)] ${ring}`}
    >
      <span
        aria-hidden="true"
        className={`${t.icon} flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl [&>svg]:h-7 [&>svg]:w-7`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[22px] font-extrabold tabular-nums leading-tight tracking-tight [overflow-wrap:anywhere]">
          {value}
        </span>
        <span className={`${t.note} block text-[13.5px] font-semibold leading-snug`}>{label}</span>
      </span>
      <span
        aria-hidden="true"
        className={`${t.arrow} flex h-9 w-9 shrink-0 items-center justify-center rounded-full`}
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
          <h2 className="text-[19px] font-extrabold leading-tight">{title}</h2>
          {subtitle ? <p className="text-[13px] text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      <Link
        href={href}
        className={`inline-flex shrink-0 items-center gap-1 pt-2 text-[13.5px] font-bold hover:underline ${ring}`}
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
  urgent,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  href: string;
  button: string;
  urgent?: boolean;
}) {
  return (
    <div className="flex min-h-[72px] flex-wrap items-center gap-3 py-3 sm:flex-nowrap">
      <span
        aria-hidden="true"
        className={`${urgent ? 'text-red-600' : 'text-amber-700'} flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white [&>svg]:h-5 [&>svg]:w-5`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-extrabold">{title}</p>
        <p className="text-[13px] leading-snug text-slate-600">{detail}</p>
      </div>
      <Link
        href={href}
        className={`${urgent ? 'bg-red-600 text-white' : 'bg-gold text-[color:var(--rider-ink)]'} inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-xl px-4 text-[13.5px] font-extrabold ${ring}`}
      >
        {button}
      </Link>
    </div>
  );
}

function Glance({
  href,
  icon,
  label,
  value,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-[96px] min-w-0 items-center gap-2.5 rounded-xl bg-[#f6f7fb] p-3 ${ring}`}
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700 [&>svg]:h-5 [&>svg]:w-5"
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold leading-snug text-slate-600">{label}</span>
        <span className="block truncate text-[20px] font-extrabold capitalize tabular-nums">
          {value}
        </span>
      </span>
    </Link>
  );
}

function SetupRing({ pct }: { pct: number }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <svg viewBox="0 0 44 44" className="h-11 w-11 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="22" cy="22" r={r} fill="none" stroke="#e3e7f0" strokeWidth="5" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke="#22c55e"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${(clamped / 100) * c} ${c}`}
      />
    </svg>
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
