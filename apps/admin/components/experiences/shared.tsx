'use client';

import { Card } from '@nexg/ui';
import * as React from 'react';

/** The vocabulary the Experiences screens share. */

export const DASH = '[—]';

export function kes(value: number | null | undefined): string {
  if (value === null || value === undefined) return DASH;
  return value.toLocaleString('en-KE');
}

export function keslabel(value: number | null | undefined): string {
  return `KES ${kes(value)}`;
}

/** [—] for a figure nobody has recorded. Zero is a different claim. */
export function num(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : String(value);
}

export function when(iso: string | null): string {
  if (!iso) return '—';
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** A countdown the server computed, so a wrong laptop clock cannot lie. */
export function countdown(seconds: number | null): { text: string; tone: string } | null {
  if (seconds === null || seconds === undefined) return null;
  if (seconds < 0) {
    const over = Math.abs(seconds);
    return {
      text:
        over < 3600
          ? `overdue by ${Math.floor(over / 60)} min`
          : `overdue by ${Math.floor(over / 3600)} h`,
      tone: 'text-danger',
    };
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 15) return { text: `${minutes} min`, tone: 'text-danger' };
  if (minutes < 60) return { text: `${minutes} min`, tone: 'text-warning' };
  const hours = Math.floor(minutes / 60);
  return { text: `${hours} h`, tone: 'text-muted' };
}

export const PLAN_TONE: Record<string, string> = {
  draft: 'bg-bg text-muted',
  sent: 'bg-danger-bg text-danger',
  confirming: 'bg-warning-bg text-warning',
  quoted: 'bg-gold-soft text-gold-text',
  changes_requested: 'bg-warning-bg text-warning',
  approved: 'bg-success-bg text-success',
  paid: 'bg-success-bg text-success',
  in_progress: 'bg-success-bg text-success',
  completed: 'bg-success-bg text-success',
  cancelled: 'bg-bg text-muted-light',
  expired: 'bg-bg text-muted-light',
};

export const PLAN_LABEL: Record<string, string> = {
  draft: 'DRAFT',
  sent: 'NEW',
  confirming: 'CONFIRMING',
  quoted: 'QUOTED',
  changes_requested: 'CHANGES ASKED',
  approved: 'APPROVED',
  paid: 'PAID · UPCOMING',
  in_progress: 'RUNNING',
  completed: 'COMPLETED',
  cancelled: 'CANCELLED',
  expired: 'EXPIRED',
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold ${
        PLAN_TONE[status] ?? 'bg-bg text-muted'
      }`}
    >
      {PLAN_LABEL[status] ?? status}
    </span>
  );
}

export function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-muted-light text-xs font-semibold">—</span>;
  return (
    <span className="text-gold text-[0.8125rem] leading-none" aria-label={`${rating} out of 5`}>
      {'★'.repeat(rating)}
      <span className="text-border-strong">{'★'.repeat(5 - rating)}</span>
    </span>
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
  tone?: 'danger' | 'success';
}) {
  return (
    <Card className="p-4">
      <p className="text-muted-light text-[0.5625rem] font-extrabold uppercase leading-tight tracking-[0.12em]">
        {label}
      </p>
      <p
        className={`mt-2 text-3xl font-extrabold tracking-tight ${
          tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : ''
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
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-[0.8125rem] font-extrabold transition-colors ${
        on
          ? 'bg-ink text-white'
          : 'border-border-strong bg-surface text-ink hover:border-ink border'
      }`}
    >
      {children}
    </button>
  );
}

export interface GuestRow {
  user_id: string;
  guest_name: string | null;
  guest_phone: string | null;
  stay_label: string | null;
  city_name: string | null;
  days: number;
  completed_days: number;
  spent_kes: number;
  first_day: string;
  last_plan_id: string;
  last_reference: string;
  last_status: string;
  last_title: string;
  last_date: string | null;
  review_id: string | null;
  review_rating: number | null;
  review_status: string | null;
  review_asked_at: string | null;
  is_repeat: boolean;
}

export interface QueueRow {
  id: string;
  reference: string;
  guest_name: string | null;
  stay_label: string | null;
  city_name: string | null;
  title: string;
  party_type: string;
  party_size: number;
  date: string | null;
  budget_kes: number | null;
  estimate_total_kes: number | null;
  quote_total_kes: number | null;
  moods: string[];
  status: string;
  concierge_name: string | null;
  concierge_id: string | null;
  sent_at: string | null;
  first_reply_due_in_s: number | null;
  quote_expires_in_s: number | null;
  first_reply_at: string | null;
  holds_pending: number;
  blocks_total: number;
  blocks_settled: number;
  flags: { severity: string; kind: string; text: string }[];
}

export interface ReviewRow {
  id: string;
  plan_id: string;
  rating: number;
  body: string;
  word_count: number;
  received_at: string;
  channel: string;
  consent_publish: boolean;
  consent_display: 'initial' | 'full_name' | 'anonymous';
  status: string;
  checks: {
    pii_found?: boolean;
    pii_kinds?: string[];
    partner_staff_named?: boolean;
    negative_mention?: boolean;
  };
  decision_reason: string | null;
  reply_body: string | null;
}

export interface Stats {
  guests: number;
  completed_30d: number;
  repeat_guests: number;
  reviews_to_approve: number;
  oldest_review_days: number | null;
  published_reviews: number;
  average_rating: number | null;
  review_rate_pct: number | null;
  in_queue: number;
  unassigned: number;
  live_today: number;
  avg_day_value_kes: number | null;
}
