import {
  AlertCircle,
  Banknote,
  Bike,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FileText,
  LifeBuoy,
  MapPin,
  MessageSquare,
  Package,
  Power,
  ShieldAlert,
  Wallet,
} from 'lucide-react';
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
 * The rider's Home, drawn like the merchant workspace Home
 * (components/merchant/home-live.tsx): a greeting, a status strip, "Needs
 * attention" with one clear button per row, figures at a glance and panels
 * with a "View" link. Same sizes, colours and spacing, rider content.
 *
 * Figures are only ever real ones. Where a number is not known it says so,
 * never an example; there are no projected earnings anywhere.
 */

const panel = 'border-border bg-surface min-w-0 rounded-xl border';
const subtle = 'text-muted text-[12px] leading-snug';
const action =
  'text-gold-text inline-flex items-center gap-1 text-[12px] font-extrabold hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

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
    : `${value < 0 ? '− ' : ''}KES ${Math.abs(Math.round(value)).toLocaleString('en-KE')}`;

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
  const done = progress?.done_count ?? 0;
  const total = progress?.of_count ?? STEPS.length;
  const online = h.presence === 'online';
  /* Read by the layout's home RPC; older summaries do not carry it. */
  const agreementWaiting = (h as { agreement_to_accept?: boolean }).agreement_to_accept === true;
  const docsToDo = (h.documents_missing ?? 0) + (h.documents_to_fix ?? 0);

  return (
    <main className="mx-auto w-full max-w-[100rem] space-y-2 px-4 py-2.5 sm:px-6 lg:px-7">
      <header>
        <h1 className="text-[22px] font-extrabold leading-tight tracking-tight sm:text-[24px]">
          Good {partOfDay()}, {name}
        </h1>
        <p className="text-muted mt-0.5 text-[12px]">
          {active
            ? 'Here’s what’s happening with your deliveries today.'
            : 'Here’s where your rider application stands.'}
        </p>
      </header>

      <section
        aria-label="Rider status"
        className={`${panel} grid gap-2 px-4 py-2 sm:grid-cols-3 sm:gap-0`}
      >
        <Status icon={<FileText />} label="Account" value={account.value} note={account.note} />
        <Status
          icon={<MapPin />}
          label="Zone"
          value={h.city ?? 'Not set'}
          note={h.plate_no ? `Motorbike · ${h.plate_no}` : 'Motorbike'}
          divider
        />
        {active ? (
          <Status
            icon={<Power />}
            label="Availability"
            value={online ? 'Online' : 'Offline'}
            note={
              h.offers_paused_reason ??
              (online ? 'You can receive delivery offers.' : 'Go online to receive offers.')
            }
            divider
          />
        ) : (
          <Status
            icon={<CheckCircle2 />}
            label="Setup"
            value={`${done} of ${total}`}
            note={done >= total ? 'All steps done.' : 'Steps finished so far.'}
            divider
          />
        )}
      </section>

      <div className="grid items-start gap-2.5 lg:grid-cols-2">
        <div className="space-y-2.5">
          <section className={`${panel} p-3`}>
            <SectionHead
              icon={<AlertCircle className="text-orange-600" />}
              title="Needs attention"
              subtitle={
                active
                  ? 'Keep your account ready for offers.'
                  : 'What to do next to get on the road.'
              }
              href="/rider/messages"
              action="Messages"
            />
            <div className="border-border divide-border mt-2 divide-y border-t">
              {attention.length === 0 && docsToDo === 0 && !agreementWaiting ? (
                <p className={`${subtle} py-5`}>Nothing needs you right now.</p>
              ) : null}
              {agreementWaiting ? (
                <ActionRow
                  icon={<FileText />}
                  tone="orange"
                  title="Rider Agreement"
                  detail="A new version of the Rider Agreement is waiting for you."
                  href="/rider/profile"
                  button="Review"
                />
              ) : null}
              {attention.map((item) => (
                <ActionRow
                  key={item.kind}
                  icon={<AlertCircle />}
                  tone={item.tone === 'danger' || item.tone === 'orange' ? 'orange' : 'blue'}
                  title={item.title}
                  detail={item.body}
                  href={item.href}
                  button={item.action}
                />
              ))}
              {docsToDo > 0 &&
              !attention.some((item) => item.href.startsWith('/rider/documents')) ? (
                <ActionRow
                  icon={<FileText />}
                  tone="orange"
                  title={`${docsToDo} ${docsToDo === 1 ? 'document needs' : 'documents need'} you`}
                  detail="Upload or replace them so rider ops can check them."
                  href="/rider/documents"
                  button="Documents"
                />
              ) : null}
            </div>
          </section>

          {active ? (
            <section className={`${panel} p-3`}>
              <SectionHead
                icon={<Bike />}
                title="Today’s jobs"
                subtitle={`${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'} today`}
                href="/rider/jobs"
                action="View jobs"
              />
              {jobs.length === 0 ? (
                <p className={`${subtle} border-border mt-2 border-t py-4`}>
                  No jobs yet today. Go online to receive offers.
                </p>
              ) : (
                <ul className="border-border divide-border mt-2 divide-y border-t">
                  {jobs.slice(0, 5).map((job) => (
                    <li key={job.id} className="flex min-h-[48px] items-center gap-2 py-1">
                      <IconBubble tone={job.delivered_at ? 'green' : 'orange'}>
                        <Package />
                      </IconBubble>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-extrabold">
                          {job.reference}
                          {job.merchant ? ` · ${job.merchant}` : ''}
                        </p>
                        <p className={`${subtle} truncate`}>
                          {job.dropoff ?? job.pickup ?? 'Address on the job'}
                        </p>
                      </div>
                      <span className="bg-bg text-muted rounded-full px-2.5 py-1 text-[11px] font-bold capitalize">
                        {job.delivered_at ? 'Delivered' : job.stage.replaceAll('_', ' ')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <section className={`${panel} p-3`}>
              <SectionHead
                icon={<CheckCircle2 />}
                title="Getting started"
                subtitle={`${done} of ${total} steps done · rider ops activates you after a test delivery`}
                href="/rider/documents"
                action="Documents"
              />
              <ol className="border-border divide-border mt-2 divide-y border-t">
                {STEPS.map((step, index) => {
                  const finished = progress ? Boolean(progress[step.key]) : false;
                  const next = !finished && STEPS.slice(0, index).every((s) => progress?.[s.key]);
                  return (
                    <li key={step.key} className="flex min-h-[52px] items-center gap-2 py-1">
                      <IconBubble tone={finished ? 'green' : next ? 'orange' : 'blue'}>
                        {finished ? (
                          <CheckCircle2 />
                        ) : (
                          <span className="text-[11px] font-extrabold">{index + 1}</span>
                        )}
                      </IconBubble>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-extrabold">{step.title}</p>
                        <p className={`${subtle} mt-0.5`}>{finished ? 'Done' : step.body}</p>
                      </div>
                      {!finished ? (
                        <Link
                          href={step.href}
                          className={`${next ? 'bg-gold text-ink' : 'bg-gold-soft text-amber-900'} inline-flex h-9 w-[112px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-2 text-center text-[11px] font-extrabold focus-visible:outline focus-visible:outline-2`}
                        >
                          {step.button}
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
        </div>

        <div className="space-y-2.5">
          <section className={`${panel} p-3`}>
            <SectionHead
              icon={<Wallet />}
              title="Today at a glance"
              subtitle={active ? 'Your deliveries and pay today.' : 'Your account so far.'}
              href={active ? '/rider/earnings' : '/rider/documents'}
              action={active ? 'View earnings' : 'View documents'}
            />
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {active ? (
                <>
                  <Metric
                    href="/rider/jobs"
                    icon={<Bike />}
                    tone="orange"
                    label="Trips today"
                    value={String(h.trips_today ?? 0)}
                  />
                  <Metric
                    href="/rider/earnings"
                    icon={<Wallet />}
                    tone="green"
                    label="Earned today"
                    value={kes(h.earned_today_kes)}
                  />
                  <Metric
                    href="/rider/earnings"
                    icon={<CalendarDays />}
                    tone="blue"
                    label="This week"
                    value={kes(h.earned_week_kes)}
                  />
                  <Metric
                    href="/rider/cash"
                    icon={<Banknote />}
                    tone="orange"
                    label="Cash on hand"
                    value={kes(h.cash_on_hand)}
                  />
                </>
              ) : (
                <>
                  <Metric
                    href="/rider/documents"
                    icon={<FileText />}
                    tone="orange"
                    label="Documents to do"
                    value={String(docsToDo)}
                  />
                  <Metric
                    href="/rider/messages"
                    icon={<MessageSquare />}
                    tone="blue"
                    label="Unread messages"
                    value={String(h.unread_messages ?? 0)}
                  />
                  <Metric
                    href="/rider/kit"
                    icon={<Package />}
                    tone="green"
                    label="Rider kit"
                    value="Order"
                  />
                  <Metric
                    href="/rider/profile"
                    icon={<CheckCircle2 />}
                    tone="green"
                    label="Setup"
                    value={`${h.readiness_pct ?? 0}%`}
                  />
                </>
              )}
            </div>
          </section>

          {active ? (
            <section className={`${panel} p-3`}>
              <SectionHead
                icon={<Banknote />}
                title="This week’s pay"
                subtitle={`${week?.deliveries ?? 0} deliveries since Monday · paid every Friday`}
                href="/rider/earnings"
                action="Earnings"
              />
              <dl className="border-border divide-border mt-2 divide-y border-t text-[12px]">
                {[
                  ['Delivery fees', (week?.base_kes ?? 0) + (week?.distance_kes ?? 0)],
                  ['Bonuses', week?.bonus_kes ?? 0],
                  ['Tips', week?.tip_kes ?? 0],
                  ['Deductions', -(week?.penalty_kes ?? 0)],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex justify-between py-1.5">
                    <dt className="text-muted">{label}</dt>
                    <dd className="font-bold tabular-nums">{kes(value as number)}</dd>
                  </div>
                ))}
                <div className="flex justify-between py-1.5">
                  <dt className="font-extrabold">Total</dt>
                  <dd className="font-extrabold tabular-nums">{kes(week?.total_kes ?? 0)}</dd>
                </div>
              </dl>
            </section>
          ) : null}

          <section className={`${panel} p-3`}>
            <SectionHead
              icon={<LifeBuoy />}
              title="Help & safety"
              subtitle="Rider ops is here when you need them."
              href="/rider/support"
              action="Support"
            />
            <div className="border-border divide-border mt-2 divide-y border-t">
              <ActionRow
                icon={<ShieldAlert />}
                tone="orange"
                title="In trouble on the road?"
                detail="SOS reaches rider ops straight away, from any screen."
                href="/rider/incidents"
                button="SOS & incidents"
              />
              <ActionRow
                icon={<MessageSquare />}
                tone="blue"
                title="Questions about a job or pay"
                detail="Send rider support a message and follow the reply here."
                href="/rider/support"
                button="Ask us"
                secondary
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Status({
  icon,
  label,
  value,
  note,
  divider = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  divider?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-2 ${divider ? 'sm:border-border sm:border-l sm:pl-4' : ''}`}
    >
      <span className="[&>svg]:h-5 [&>svg]:w-5" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-extrabold">{label}</span>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${['Active', 'Online', 'Nairobi'].includes(value) ? 'bg-green-100 text-green-800' : 'bg-bg text-muted'}`}
          >
            {value}
          </span>
        </div>
        <p className={`${subtle} mt-0.5`}>{note}</p>
      </div>
    </div>
  );
}

function IconBubble({
  tone,
  children,
}: {
  tone: 'orange' | 'green' | 'blue';
  children: React.ReactNode;
}) {
  const colours = {
    orange: 'bg-orange-100 text-amber-900',
    green: 'bg-green-100 text-green-800',
    blue: 'bg-sky-100 text-sky-900',
  };
  return (
    <span
      className={`${colours[tone]} flex h-8 w-8 shrink-0 items-center justify-center rounded-full [&>svg]:h-4 [&>svg]:w-4`}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

function ActionRow({
  icon,
  tone,
  title,
  detail,
  href,
  button,
  secondary,
}: {
  icon: React.ReactNode;
  tone: 'orange' | 'green' | 'blue';
  title: string;
  detail: string;
  href: string;
  button: string;
  secondary?: boolean;
}) {
  return (
    <div className="flex min-h-[52px] items-center gap-2 py-1">
      <IconBubble tone={tone}>{icon}</IconBubble>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-extrabold">{title}</p>
        <p className={`${subtle} mt-0.5`}>{detail}</p>
      </div>
      <Link
        href={href}
        className={`${secondary ? 'bg-gold-soft text-amber-900' : 'bg-gold text-ink'} inline-flex h-9 w-[112px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-2 text-center text-[11px] font-extrabold focus-visible:outline focus-visible:outline-2`}
      >
        {button}
      </Link>
    </div>
  );
}

function Metric({
  href,
  icon,
  tone,
  label,
  value,
}: {
  href: string;
  icon: React.ReactNode;
  tone: 'orange' | 'green' | 'blue';
  label: string;
  value: string;
}) {
  return (
    <Link
      href={href}
      className="border-border flex min-h-[52px] min-w-0 items-center gap-1.5 rounded-lg border p-1.5 focus-visible:outline focus-visible:outline-2"
    >
      <IconBubble tone={tone}>{icon}</IconBubble>
      <span className="min-w-0 flex-1">
        <span className={`${subtle} block`}>{label}</span>
        <span className="block whitespace-nowrap text-[13px] font-extrabold tabular-nums tracking-tight">
          {value}
        </span>
      </span>
      <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
    </Link>
  );
}

function SectionHead({
  title,
  subtitle,
  icon,
  href,
  action: label,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  href: string;
  action: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-[16px] font-extrabold">
          <span className="[&>svg]:h-5 [&>svg]:w-5" aria-hidden="true">
            {icon}
          </span>
          {title}
        </h2>
        <p className={`${subtle} mt-0.5 pl-7`}>{subtitle}</p>
      </div>
      <Link href={href} className={`${action} shrink-0 pt-1`}>
        {label} <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
