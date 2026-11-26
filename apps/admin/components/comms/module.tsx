import { cn } from '@nexg/ui';
import {
  BarChart3,
  Bell,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  DatabaseZap,
  FileText,
  Inbox,
  LayoutGrid,
  ListChecks,
  Mail,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  ShieldCheck,
  Smartphone,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { RangeControl } from '@/components/portal/client-kit';
import {
  DashCard,
  DashHeader,
  GoldTabs,
  StatusChip,
  type ChipTone,
} from '@/components/portal/dash';
import { DashSelect } from '@/components/portal/dash-filters';
import {
  AUDIENCE_TAG,
  CHANNEL_LABEL,
  COMMS_PAGES,
  commsHref,
  label,
  PROVIDER_LABEL,
  PROVIDER_NEEDS,
  STATE_LABEL,
  type ChannelState,
} from '@/lib/comms';
import type { Period } from '@/lib/portal';

export {
  DataTable,
  ErrorNote,
  FilterRow,
  Footnote,
  Funnel,
  MeterRows,
  PanelLine,
} from '@/components/riders/module';
export { Empty, Fact, PanelHint, ShareBars, SidePanel, WithPanel } from '@/components/stays/module';

/*
 * The pieces the Communications screens share, in the designs' look: the
 * header ("Communications & Automations / Email Configuration" with the city
 * and the period), the tab strip, channel and audience chips, provider rows.
 * Server-safe; the buttons that change things are in ./client.
 */

const TAB_ICON: Record<string, LucideIcon> = {
  overview: LayoutGrid,
  email: Mail,
  sms: MessageSquareText,
  push: Bell,
  whatsapp: MessageCircle,
  templates: FileText,
  workflows: Workflow,
  scheduled: CalendarClock,
  bulk: Megaphone,
  queue: Inbox,
  logs: ListChecks,
  analytics: BarChart3,
  consent: ShieldCheck,
};

export function CommsHeader({
  screen,
  subtitle,
  period,
  cities,
  city,
  noPeriod = false,
  action,
}: {
  screen: string | null;
  subtitle: string;
  period: Period;
  /** Given on the screens where the city narrows the audience. */
  cities?: { id: string; name: string }[];
  city?: string | null;
  noPeriod?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <DashHeader
      title={screen ? `Communications & Automations / ${screen}` : 'Communications & Automations'}
      subtitle={subtitle}
      actions={
        <>
          {cities && cities.length > 0 && (
            <DashSelect
              label="City"
              param="city"
              value={city ?? 'all'}
              options={cities.map((c) => ({ value: c.id, label: c.name }))}
              className="min-w-[11rem]"
            />
          )}
          {!noPeriod && <RangeControl from={period.from} to={period.to} />}
          {action}
        </>
      }
    />
  );
}

/** The module's own tab strip, the same on every screen. */
export function CommsTabs({ active, period }: { active: string; period: Period }) {
  return (
    <GoldTabs
      label="Communications screens"
      active={active}
      tabs={COMMS_PAGES.map((p) => ({
        key: p.key,
        label: p.tab,
        icon: TAB_ICON[p.key],
        href: commsHref(p.href, period),
      }))}
    />
  );
}

/* ─────────────────────────────────────────────────────────────── chips */

const CHANNEL_ICON: Record<string, LucideIcon> = {
  email: Mail,
  sms: MessageSquareText,
  whatsapp: MessageCircle,
  in_app: Bell,
  push: Bell,
  console: Smartphone,
};

const CHANNEL_TONE: Record<string, string> = {
  email: 'text-[#E8730C]',
  sms: 'text-[#2F6FDB]',
  whatsapp: 'text-[#1F9D55]',
  in_app: 'text-[#A855F7]',
  push: 'text-[#A855F7]',
};

export const CHANNEL_COLOR: Record<string, string> = {
  email: '#F5A623',
  sms: '#2F6FDB',
  whatsapp: '#1F9D55',
  in_app: '#A855F7',
  console: '#C9C4B8',
};

/** A channel's icon in its colour, with the name for screen readers. */
export function ChannelIcon({ channel, className }: { channel: string; className?: string }) {
  const Icon = CHANNEL_ICON[channel] ?? Mail;
  return (
    <span title={label(CHANNEL_LABEL, channel)} className="inline-flex">
      <Icon
        aria-hidden="true"
        strokeWidth={1.9}
        className={cn('h-[1.15rem] w-[1.15rem]', CHANNEL_TONE[channel] ?? 'text-muted', className)}
      />
      <span className="sr-only">{label(CHANNEL_LABEL, channel)}</span>
    </span>
  );
}

export function ChannelIcons({ channels }: { channels: string[] }) {
  return (
    <span className="flex items-center gap-1.5">
      {channels.map((c) => (
        <ChannelIcon key={c} channel={c} />
      ))}
    </span>
  );
}

export const AUDIENCE_COLOR: Record<string, string> = {
  guests: '#F5A623',
  hosts: '#FFC94D',
  riders: '#141414',
  merchants: '#E8730C',
  property_managers: '#C9A227',
  staff: '#8F8A80',
  other: '#D9D4CA',
};

const AUDIENCE_TONE: Record<string, string> = {
  guests: 'bg-[#E3EEFB] text-[#1F5FAD]',
  hosts: 'bg-[#F3E8FF] text-[#7B3FB8]',
  riders: 'bg-[#FFF1C7] text-[#9A6700]',
  merchants: 'bg-[#FFE9D6] text-[#B4520A]',
  property_managers: 'bg-[#FCE7F3] text-[#A3245E]',
  staff: 'bg-[#EFEDE8] text-[#5E5A52]',
  all: 'bg-[#EFEDE8] text-[#5E5A52]',
  other: 'bg-[#EFEDE8] text-[#5E5A52]',
};

/** The designs' coloured audience pill: Guest, Host, Rider… */
export function AudienceChip({ audience, plural = false }: { audience: string; plural?: boolean }) {
  const text = plural
    ? label(
        {
          guests: 'Guests',
          hosts: 'Hosts',
          riders: 'Riders',
          merchants: 'Merchants',
          property_managers: 'Property Mgrs',
          staff: 'Staff',
          other: 'System',
        },
        audience,
      )
    : label(AUDIENCE_TAG, audience);
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold',
        AUDIENCE_TONE[audience] ?? AUDIENCE_TONE.other,
      )}
    >
      {text}
    </span>
  );
}

const STATUS_TONE: Record<string, ChipTone> = {
  sent: 'green',
  delivered: 'green',
  completed: 'green',
  active: 'green',
  connected: 'green',
  granted: 'green',
  scheduled: 'green',
  queued: 'amber',
  waiting: 'blue',
  sending: 'amber',
  in_progress: 'amber',
  processing: 'amber',
  retrying: 'gold',
  paused: 'amber',
  draft: 'grey',
  inactive: 'grey',
  skipped: 'grey',
  cancelled: 'grey',
  unknown: 'grey',
  not_installed: 'grey',
  updated: 'blue',
  failed: 'red',
  withdrawn: 'red',
  not_connected: 'red',
};

/** Any status in this module as the designs' chip. */
export function Chip({ status, text }: { status: string; text: string }) {
  return <StatusChip tone={STATUS_TONE[status] ?? 'grey'}>{text}</StatusChip>;
}

/* ────────────────────────────────────────────────────────── providers */

/** Connected (green, with a tick) or Not connected, as the designs draw it. */
export function StateBadge({ state }: { state: ChannelState }) {
  const Icon =
    state === 'connected' ? CheckCircle2 : state === 'not_connected' ? CircleAlert : CircleDashed;
  return (
    <StatusChip tone={STATUS_TONE[state] ?? 'grey'} className="gap-1.5">
      {STATE_LABEL[state]}
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
    </StatusChip>
  );
}

const LOGO_TONE: Record<string, string> = {
  resend: 'bg-[#141414] text-white',
  africastalking: 'bg-[#FF8A00] text-white',
  twilio: 'bg-[#F22F46] text-white',
  meta: 'bg-[#25D366] text-white',
  vapid: 'bg-[#2F6FDB] text-white',
  fcm: 'bg-[#FFCA28] text-[#1A1A1A]',
  apns: 'bg-[#141414] text-white',
};

const LOGO_TEXT: Record<string, string> = {
  resend: 'R',
  africastalking: 'at',
  twilio: 'T',
  meta: 'W',
  vapid: 'W',
  fcm: 'F',
  apns: '',
};

/**
 * One provider: a small letter tile (never a brand logo), its name and what
 * it is for, and whether it is really set up. When it is not, the secrets
 * the owner must add are listed by name.
 */
export function ProviderRow({
  provider,
  name,
  note,
  state,
  needs,
  selected = false,
  extra,
}: {
  provider: string;
  name?: string;
  note: string;
  state: ChannelState;
  needs?: string;
  selected?: boolean;
  extra?: React.ReactNode;
}) {
  const need = PROVIDER_NEEDS[needs ?? provider];
  return (
    <li
      className={cn(
        'rounded-xl border p-3',
        selected ? 'border-[#F5D27A] bg-[#FFFBF0]' : 'border-border',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[0.875rem] font-extrabold',
            LOGO_TONE[provider] ?? 'bg-[#FFF4D6] text-[#8A5C00]',
          )}
        >
          {LOGO_TEXT[provider] ?? (name ?? provider).slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{name ?? label(PROVIDER_LABEL, provider)}</span>
          <span className="text-muted block text-[0.8125rem] font-semibold">{note}</span>
        </span>
        <StateBadge state={state} />
      </div>
      {state !== 'connected' && need && (
        <p className="text-muted mt-2 text-[0.8125rem] leading-relaxed">
          To connect, the owner adds{' '}
          {need.secrets.map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && (i === need.secrets.length - 1 ? ' and ' : ', ')}
              <code className="bg-bg rounded px-1 py-0.5 text-[0.75rem] font-bold">{s}</code>
            </React.Fragment>
          ))}{' '}
          in {need.where}.
        </p>
      )}
      {extra}
    </li>
  );
}

/** A coloured icon tile, as the designs' KPI and card icons. */
export function IconTile({
  icon: Icon,
  tone = 'gold',
  className,
}: {
  icon: LucideIcon;
  tone?: 'gold' | 'green' | 'red' | 'blue' | 'purple';
  className?: string;
}) {
  const tones = {
    gold: 'bg-[#FFF4D6] text-[#B57A00]',
    green: 'bg-[#E3F5E6] text-[#1E7B34]',
    red: 'bg-[#FDE7E5] text-[#C62D22]',
    blue: 'bg-[#E3EEFB] text-[#1F5FAD]',
    purple: 'bg-[#F3E8FF] text-[#7B3FB8]',
  };
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
        tones[tone],
        className,
      )}
    >
      <Icon className="h-5 w-5" strokeWidth={1.8} />
    </span>
  );
}

/** A titled card with its one-line description under the title, as every panel in the designs. */
export function Panel({
  title,
  note,
  icon,
  aside,
  children,
  className,
}: {
  title: string;
  note?: string;
  icon?: LucideIcon;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = icon;
  return (
    <DashCard className={className}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <Icon
              aria-hidden="true"
              className="mt-0.5 h-6 w-6 shrink-0 text-[#E5A800]"
              strokeWidth={1.7}
            />
          )}
          <div className="min-w-0">
            <h2 className="text-[1.125rem] font-extrabold tracking-[-0.01em]">{title}</h2>
            {note && <p className="text-muted text-[0.8125rem] font-semibold">{note}</p>}
          </div>
        </div>
        {aside}
      </div>
      {children}
    </DashCard>
  );
}

/** Shown while the database has not got the Communications functions yet. */
export function WaitingForDatabase() {
  return (
    <DashCard>
      <div className="mx-auto flex max-w-[36rem] flex-col items-center py-14 text-center">
        <DatabaseZap aria-hidden="true" className="h-10 w-10 text-[#E5A800]" strokeWidth={1.6} />
        <p className="mt-4 text-[1.125rem] font-extrabold">Waiting for a database update</p>
        <p className="text-muted mt-2 text-sm font-semibold leading-relaxed">
          These Communications screens are ready, but the database they read from has not been
          updated yet. They fill in on their own once it is. Email designs and routing still work
          meanwhile in Settings.
        </p>
        <Link
          href="/settings?tab=notifications"
          className="mt-4 font-bold text-[#826D18] underline underline-offset-4"
        >
          Open Settings › Notifications & templates
        </Link>
      </div>
    </DashCard>
  );
}

/** A small "label: value" list used in the side panels. */
export function KeyValues({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="divide-border divide-y text-[0.875rem]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-start justify-between gap-3 py-2">
          <dt className="text-muted font-semibold">{k}</dt>
          <dd className="min-w-0 break-words text-right font-bold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A legend dot and a row, for the donut and outcome lists. */
export function LegendRow({
  color,
  name,
  value,
  share,
}: {
  color: string;
  name: string;
  value: string;
  share?: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 text-[0.875rem]">
      <span className="flex min-w-0 items-center gap-2 font-semibold">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: color }}
        />
        <span className="truncate">{name}</span>
      </span>
      <span className="font-extrabold tabular-nums">
        {value}
        {share && <span className="text-muted ml-1.5 font-semibold">{share}</span>}
      </span>
    </li>
  );
}
