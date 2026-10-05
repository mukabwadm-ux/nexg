import { Card } from '@nexg/ui';
import Link from 'next/link';
import * as React from 'react';

/** The vocabulary every Settings tab shares. */

export const DASH = '[—]';

export const TABS = [
  { key: 'cities', label: 'Cities & coverage' },
  { key: 'fees', label: 'Fees & dispatch' },
  { key: 'payments', label: 'Payments & integrations' },
  { key: 'notifications', label: 'Notifications & templates' },
  { key: 'branding', label: 'Branding & legal' },
  { key: 'retention', label: 'Data & retention' },
] as const;

export type SettingsTab = (typeof TABS)[number]['key'];

export const TAB_COPY: Record<string, { title: string; subtitle: string }> = {
  cities: {
    title: 'Settings',
    subtitle:
      'Where NexG operates, when, and what every city inherits · changes take effect next 00:00 unless marked immediate',
  },
  fees: {
    title: 'Fees & dispatch',
    subtitle:
      'Rate card and dispatch parameters per city · every number here is versioned, dated and two-person approved',
  },
  payments: {
    title: 'Payments & integrations',
    subtitle: 'How money comes in and goes out, and every external service NexG depends on',
  },
  notifications: {
    title: 'Notifications & templates',
    subtitle: 'Every message NexG sends, in both languages, with who gets what and when',
  },
  branding: {
    title: 'Branding & legal',
    subtitle: 'How NexG looks and what it promises · public pages update when a version goes live',
  },
  retention: {
    title: 'Data & retention',
    subtitle: 'What NexG keeps, for how long, and the choices guests and partners are given',
  },
};

/* Which group each tab writes. Drives the lock icons. */
export const TAB_GROUP: Record<string, string> = {
  cities: 'cities',
  fees: 'fees',
  payments: 'payments',
  notifications: 'notifications',
  branding: 'branding',
  retention: 'retention',
};

export const STATUS_TONE: Record<string, string> = {
  live: 'bg-success-bg text-success',
  soft_launch: 'bg-warning-bg text-warning',
  waitlist: 'bg-info-bg text-info',
  paused: 'bg-bg text-muted-light',
  connected: 'bg-success-bg text-success',
  limited: 'bg-warning-bg text-warning',
  live_hotels: 'bg-success-bg text-success',
  pending: 'bg-warning-bg text-warning',
  not_set_up: 'bg-bg text-muted-light',
  to_do: 'bg-danger-bg text-danger',
  error: 'bg-danger-bg text-danger',
  disabled: 'bg-bg text-muted-light',
  current: 'bg-success-bg text-success',
  draft: 'bg-bg text-muted',
  scheduled: 'bg-info-bg text-info',
  archived: 'bg-bg text-muted-light',
};

export const STATUS_LABEL: Record<string, string> = {
  live: 'LIVE',
  soft_launch: 'SOFT LAUNCH',
  waitlist: 'WAITLIST',
  paused: 'PAUSED',
  connected: 'CONNECTED',
  limited: 'LIMITED',
  live_hotels: 'LIVE · HOTELS',
  not_set_up: 'NOT SET UP',
  to_do: 'TO DO',
  pending: 'PENDING',
  error: 'ERROR',
  disabled: 'DISABLED',
  current: 'CURRENT',
  draft: 'DRAFT',
  scheduled: 'SCHEDULED',
  archived: 'ARCHIVED',
};

export const TIER_TONE: Record<string, string> = {
  core: 'bg-ink text-white',
  extended: 'bg-bg text-muted',
  trial: 'border border-dashed border-gold text-gold-text',
};

export const CATEGORY_LABEL: Record<string, string> = {
  food_drinks: 'Food & drinks',
  laundry_cleaning: 'Laundry & cleaning',
  flowers_gifts: 'Flowers & gifts',
  pharmacy: 'Pharmacy',
  beauty_fashion: 'Beauty & fashion',
  concierge_offplatform: 'Concierge · off-platform purchase',
};

export const RAIL_LABEL: Record<string, string> = {
  mpesa_b2b_bank: 'M-Pesa B2B + bank',
  mpesa_b2c: 'M-Pesa B2C',
  credit_note: 'Credit note',
  bank_eft: 'Bank EFT',
  manual: 'Manual',
};

export const LEGAL_LABEL: Record<string, string> = {
  guest_terms: 'Guest terms',
  privacy: 'Privacy notice',
  cookies: 'Cookies',
  merchant_terms: 'Merchant terms',
  rider_agreement: 'Rider agreement',
  host_terms: 'Host terms',
  hotel_agreement_template: 'Hotel agreement template',
  featured_terms: 'Featured placement terms',
  api_terms: 'API terms',
  kdpa_notice: 'KDPA notice',
};

// ───────────────────────────────────────────────────── formatting

export function num(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return DASH;
  return Number(v).toLocaleString('en-KE');
}

/**
 * Money, and the reason this function exists.
 *
 * Almost every money figure in this module is deliberately unset —
 * Finance has not agreed them. `KES [—]` is the honest rendering;
 * `KES 0` would be a number somebody could invoice against.
 */
export function kes(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return `KES ${DASH}`;
  return `KES ${Number(v).toLocaleString('en-KE')}`;
}

export function pct(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return `${DASH}%`;
  return `${Number(v)}%`;
}

export function when(iso: string | null | undefined): string {
  if (!iso) return DASH;
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  });
}

export function day(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : DASH;
}

export function hoursLabel(hours: Record<string, unknown> | null | undefined): string {
  if (!hours) return DASH;
  const h = hours as { from?: string; to?: string };
  return h.from && h.to ? `${h.from} – ${h.to}` : DASH;
}

// ───────────────────────────────────────────────────── primitives

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

export function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'danger' | 'warning' | 'success';
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
            : tone === 'warning'
              ? 'text-warning'
              : tone === 'success'
                ? 'text-success'
                : ''
        }`}
      >
        {value}
      </p>
      {hint && (
        <p className="text-gold-text mt-1 text-[0.6875rem] font-semibold leading-snug">{hint}</p>
      )}
    </Card>
  );
}

/**
 * Where a value came from.
 *
 * Carries text, never colour alone: "inherits Nairobi v3" and
 * "overridden" have to be distinguishable in greyscale and to a
 * screen reader, because the difference decides whether editing
 * here changes one city or five.
 */
export function SourceChip({ source, label }: { source?: string | null; label?: string | null }) {
  if (!source || source === 'unknown') return null;
  const inherited = source === 'global' || source === 'category' || source === 'default';
  return (
    <span
      className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-[0.1em] ${
        inherited ? 'bg-bg text-muted-light' : 'border-gold text-gold-text border'
      }`}
    >
      {inherited ? `inherits · ${label ?? source}` : 'overridden'}
    </span>
  );
}

export function Locked({ group, who }: { group: string; who: string }) {
  return (
    <span className="text-muted-light inline-flex items-center gap-1 text-[0.6875rem] font-semibold">
      <span aria-hidden="true">🔒</span>
      <span>{who} edits {group}</span>
    </span>
  );
}

export function Section({
  title,
  sub,
  right,
  children,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.0625rem] font-extrabold tracking-tight">{title}</h2>
          {sub && (
            <p className="text-muted mt-1 max-w-[52rem] text-[0.8125rem] font-semibold leading-[1.7]">
              {sub}
            </p>
          )}
        </div>
        {right}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card className="p-8 text-center">
      <p className="text-muted mx-auto max-w-[34rem] text-[0.875rem] font-semibold leading-[1.8]">
        {children}
      </p>
    </Card>
  );
}

export function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="px-4 py-2.5 text-[0.625rem] font-extrabold uppercase tracking-[0.1em]"
    >
      {children}
    </th>
  );
}

export function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}

export function SettingsTabs({ current }: { current: string }) {
  return (
    <nav
      className="border-border -mx-4 flex gap-6 overflow-x-auto border-b px-4 sm:-mx-8 sm:px-8"
      aria-label="Settings sections"
    >
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/settings?tab=${t.key}`}
          className={`-mb-px shrink-0 border-b-2 pb-3 text-sm font-bold transition-colors ${
            current === t.key ? 'border-gold text-ink' : 'text-muted hover:text-ink border-transparent'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

// ──────────────────────────────────────────────────────── row types

export interface ResolvedValue {
  value: unknown;
  version_id: string | null;
  source: string;
  source_label: string;
  effective_from?: string;
  is_set: boolean;
  unknown_key?: boolean;
}

export interface CityRow {
  city_id: string;
  slug: string;
  name: string;
  status: string;
  currency: string;
  timezone: string;
  hours: Record<string, string> | null;
  late_night_from: string | null;
  max_radius_km: number | null;
  launched_at: string | null;
  city_manager_id: string | null;
  order_cutoff_min: number | null;
  outside_zone_behaviour: string | null;
  languages: string[] | null;
  holiday_calendar: string | null;
  zones: number;
  zones_active: number;
  zones_trial: number;
  sort: number;
}

export interface ZoneRow {
  zone_id: string;
  city_id: string;
  name: string;
  tier: string;
  enabled: boolean;
  eta_min: number | null;
  eta_max: number | null;
  delivery_band: number | null;
  cod_allowed: boolean;
  trial_review_due: boolean;
}

export interface PricingRow {
  city_id: string;
  category: string;
  commission_pct: number | null;
  min_order: number | null;
  featured_eligible: boolean;
  note: string | null;
  delivery_band_1: number | null;
  delivery_band_2: number | null;
  delivery_band_3: number | null;
  night_surcharge: number | null;
  service_pct: number | null;
  concierge_flat: number | null;
  small_basket_threshold: number | null;
  small_basket_fee: number | null;
  cash_handling: number | null;
  host_credit_rule: string | null;
}

export interface DispatchRow {
  city_id: string;
  selection: string | null;
  accept_window_s: number | null;
  rounds_before_boost: number | null;
  search_radius_km: number | null;
  radius_increment_km: number | null;
  boost_fee: number | null;
  escalate_min: number | null;
  rider_cash_cap: number | null;
  stacking: boolean | null;
  max_radius_km: number | null;
}

export interface SettlementRow {
  city_id: string;
  cycle: string | null;
  cutoff: string | null;
  approvals: string | null;
  instant_cashout: boolean | null;
}

export interface PaymentRow {
  key: string;
  label: string;
  provider: string | null;
  status: string;
  enabled: boolean;
  checkout_order: number;
  limits: Record<string, unknown>;
  health: Record<string, unknown>;
  note: string | null;
  disabled_reason: string | null;
  success_24h_pct: number | null;
  callbacks_failed: number | null;
}

export interface IntegrationRow {
  key: string;
  label: string;
  provider: string | null;
  status: string;
  enabled: boolean;
  config: Record<string, unknown>;
  secrets: number;
  key_rotated_at: string | null;
  rotation_days: number;
  rotation_due: boolean;
  rotation_due_on: string | null;
  health: Record<string, unknown>;
  last_checked_at: string | null;
  blocks: string[];
  notes: string | null;
}

export interface RailRow {
  party: string;
  rail: string;
  float_alert_amount: number | null;
  note: string | null;
}

export interface LegalRow {
  key: string;
  version: number;
  effective_from: string | null;
  status: string;
  pdf_path: string | null;
  requires_reacceptance_by: string | null;
  changelog: string | null;
  approved_at: string | null;
  approved_by_name: string | null;
  second_approver_name: string | null;
}

export interface ChangeSetRow {
  change_set_id: string;
  title: string;
  group: string;
  city_id: string | null;
  city_name: string | null;
  status: string;
  effective_from: string | null;
  immediate: boolean;
  reason: string | null;
  diff: Record<string, { label: string; from: unknown; to: unknown; unit: string | null; sensitive: boolean }>;
  impact: Record<string, Record<string, unknown>>;
  requested_by: string | null;
  requested_by_name: string | null;
  requested_at: string | null;
  approved_by_name: string | null;
  changes: number;
}

export interface DefinitionRow {
  key: string;
  group: string;
  scope_kind: string;
  value_type: string;
  unit: string | null;
  label: string;
  help: string | null;
  sensitive: boolean;
  can_be_immediate: boolean;
  effective_pair: string;
  default_value: unknown;
  sort: number;
}

export interface RetentionRow {
  key: string;
  subject: string;
  retain_for_label: string;
  basis: string;
  anonymise: boolean;
  module: string | null;
  last_run_at: string | null;
  period_not_set: boolean;
  not_approved: boolean;
}
