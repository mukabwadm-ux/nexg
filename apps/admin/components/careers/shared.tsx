import { Card } from '@nexg/ui';
import Link from 'next/link';
import * as React from 'react';

/** The vocabulary every Careers ATS tab shares. */

export const DASH = '[—]';

export function num(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : String(value);
}

export function pct(value: number | null | undefined): string {
  return value === null || value === undefined ? `${DASH}%` : `${Math.round(Number(value))}%`;
}

export function kes(value: number | null | undefined): string {
  return value === null || value === undefined
    ? `KES ${DASH}`
    : `KES ${Number(value).toLocaleString('en-KE')}`;
}

export function plural(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : (many ?? `${one}s`)}`;
}

export function when(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function shortDate(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : DASH;
}

/** "today" when it just moved, otherwise the count. */
export function daysLabel(days: number | null | undefined): string {
  if (days === null || days === undefined) return DASH;
  return days === 0 ? 'today' : `${days} d`;
}

export const STAGES = [
  { key: 'new', label: 'New' },
  { key: 'screening', label: 'Screening' },
  { key: 'intro_call', label: 'Intro call' },
  { key: 'work_sample', label: 'Work sample' },
  { key: 'team_conversation', label: 'Team conversation' },
  { key: 'offer', label: 'Offer' },
  { key: 'hired', label: 'Hired' },
] as const;

export const STAGE_LABEL: Record<string, string> = {
  new: 'NEW',
  screening: 'SCREENING',
  intro_call: 'INTRO CALL',
  work_sample: 'WORK SAMPLE',
  team_conversation: 'TEAM CONVO',
  offer: 'OFFER',
  hired: 'HIRED',
  on_file: 'ON FILE',
  rejected: 'REJECTED',
  withdrawn: 'WITHDRAWN',
};

export const STAGE_TONE: Record<string, string> = {
  new: 'bg-bg text-muted',
  screening: 'bg-warning-bg text-warning',
  intro_call: 'bg-gold-soft text-gold-text',
  work_sample: 'bg-gold-soft text-gold-text',
  team_conversation: 'bg-purple-100 text-purple-800',
  offer: 'bg-success-bg text-success',
  hired: 'bg-success-bg text-success',
  on_file: 'bg-info-bg text-info',
  rejected: 'bg-danger-bg text-danger',
  withdrawn: 'bg-bg text-muted-light',
};

export const JOB_TONE: Record<string, string> = {
  open: 'bg-success-bg text-success',
  draft: 'bg-bg text-muted',
  paused: 'bg-warning-bg text-warning',
  closed: 'bg-bg text-muted-light',
  always_open: 'bg-info-bg text-info',
};

export const CONTRACT_LABEL: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract_6mo: '6-mo contract',
  internship: 'Internship',
};

export const WORK_MODE_LABEL: Record<string, string> = {
  on_site: 'On-site',
  on_site_shifts: 'On-site · shifts',
  hybrid: 'Hybrid',
  remote_eat: 'Remote (EAT)',
};

export const SOURCE_LABEL: Record<string, string> = {
  careers_page: 'Careers page',
  linkedin: 'LinkedIn',
  brightermonday: 'BrighterMonday',
  fuzu: 'Fuzu',
  whatsapp_card: 'WhatsApp card',
  referral: 'Referral',
  general_application: 'General',
  manual: 'Added by staff',
};

export function Pill({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold ${
        tone ?? 'bg-bg text-muted'
      }`}
    >
      {children}
    </span>
  );
}

/**
 * A screening score. Carries the number, never only the colour —
 * somebody reading this in greyscale still needs to know.
 */
export function ScoreChip({ score, max }: { score: number | null; max: number | null }) {
  if (score === null || max === null) {
    return <span className="text-muted-light text-[0.75rem] font-semibold">{DASH}</span>;
  }
  const out = max > 0 ? (score / max) * 10 : 0;
  const tone =
    out >= 8
      ? 'bg-success-bg text-success'
      : out >= 5
        ? 'bg-warning-bg text-warning'
        : 'bg-danger-bg text-danger';
  return (
    <span className={`rounded px-1.5 py-0.5 text-[0.6875rem] font-extrabold ${tone}`}>
      {score}/{max}
    </span>
  );
}

/** nights ✓ / nights ✗, from the flags the questions set. */
export function FlagChips({ flags }: { flags: Record<string, unknown> }) {
  const entries = Object.entries(flags ?? {});
  if (entries.length === 0) return null;

  return (
    <>
      {entries.map(([key, value]) => {
        const yes = value === true;
        const no = value === false;
        return (
          <span
            key={key}
            className={`rounded px-1.5 py-0.5 text-[0.625rem] font-bold ${
              no ? 'bg-danger-bg text-danger' : 'bg-bg text-muted'
            }`}
          >
            {key}
            {yes ? ' ✓' : no ? ' ✗' : ` ${String(value)}`}
          </span>
        );
      })}
    </>
  );
}

export function Tile({
  label,
  value,
  children,
  tone,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
  tone?: 'danger' | 'success' | 'warning';
}) {
  return (
    <Card className="p-4">
      <p className="text-muted-light text-[0.5625rem] font-extrabold uppercase leading-tight tracking-[0.12em]">
        {label}
      </p>
      <p
        className={`mt-2 text-[1.75rem] font-extrabold leading-tight tracking-tight ${
          tone === 'danger'
            ? 'text-danger'
            : tone === 'success'
              ? 'text-success'
              : tone === 'warning'
                ? 'text-warning'
                : ''
        }`}
      >
        {value}
      </p>
      {children && (
        <p className="text-muted-light mt-1.5 text-[0.6875rem] font-semibold leading-snug">
          {children}
        </p>
      )}
    </Card>
  );
}

export function Chip({
  on,
  href,
  children,
}: {
  on: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-extrabold transition-colors ${
        on ? 'bg-ink text-white' : 'border-border-strong bg-surface text-ink hover:border-ink border'
      }`}
    >
      {children}
    </Link>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-muted px-4 py-10 text-center text-sm font-semibold">
        {children}
      </td>
    </tr>
  );
}

export function Avatar({ name }: { name: string | null }) {
  const initials = (name ?? '')
    .replace(/[[\]]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span
      aria-hidden="true"
      className="bg-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-extrabold text-white"
    >
      {initials || '—'}
    </span>
  );
}

export function NotMeasured({ what, why }: { what: string; why: string }) {
  return (
    <Card className="p-5">
      <p className="text-[0.8125rem] font-extrabold">{what}</p>
      <p className="text-muted mt-2 text-[0.75rem] font-semibold leading-[1.7]">{why}</p>
    </Card>
  );
}

// ─────────────────────────────────────────────────────── row types

export interface JobRow {
  id: string;
  slug: string;
  title: string;
  team_id: string | null;
  team_name: string | null;
  city_id: string | null;
  city_name: string | null;
  location_label: string | null;
  work_mode: string | null;
  contract: string | null;
  status: string;
  openings: number;
  salary_min: number | null;
  salary_max: number | null;
  salary_public: boolean;
  posted_at: string | null;
  closes_at: string | null;
  is_general: boolean;
  stage_targets: Record<string, number>;
  hiring_manager_name: string | null;
  total_applicants: number;
  new_applicants: number;
  unreviewed_over_3d: number;
  in_interviews: number;
  offers: number;
  new_this_week: number;
}

export interface ApplicantRow {
  id: string;
  job_id: string;
  job_title: string;
  job_slug: string;
  candidate_id: string;
  full_name: string | null;
  phone_masked: string | null;
  email_masked: string | null;
  city: string | null;
  anonymised_at: string | null;
  talent_pool_opt_in: boolean;
  has_cv: boolean;
  stage: string;
  public_stage: string | null;
  stage_entered_at: string;
  days_in_stage: number;
  stage_target_days: number | null;
  source: string;
  source_detail: string | null;
  screening_score: number | null;
  screening_max: number | null;
  must_failed: string[];
  flags: Record<string, unknown>;
  why_nexg: string | null;
  created_at: string;
  rejected_reason_code: string | null;
  rejected_reason_text: string | null;
  on_file_until: string | null;
  start_date: string | null;
  owner_name: string | null;
  needs_action: boolean;
  note_count: number;
  work_sample_score: number | null;
  work_sample_hours: number | null;
  work_sample_payment: string | null;
}

export interface Badges {
  open_jobs: number;
  draft_jobs: number;
  needs_action: number;
  new_applications: number;
  unreviewed: number;
  applied_this_week: number;
  on_file: number;
  hired: number;
  offers_open: number;
  time_to_hire_days: number | null;
  offer_acceptance_pct: number | null;
  offers_total: number;
  offers_declined: number;
}

export interface MetricsRow {
  job_id: string;
  in_pipeline: number;
  new_count: number;
  needs_action: number;
  rejected_count: number;
  avg_score: number | null;
  avg_max: number | null;
  new_to_offer_pct: number | null;
  median_days_in_stage: number | null;
  rejected_with_feedback_pct: number | null;
}
