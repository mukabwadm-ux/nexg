'use client';

import { Card } from '@nexg/ui';
import * as React from 'react';

/** Shapes and small pieces the Staff & roles tabs share. */

export interface StaffRow {
  staff_id: string;
  email: string;
  display_name: string;
  status: 'active' | 'suspended' | 'offboarded';
  roles: string[];
  role_labels: string[];
  primary_role: string | null;
  primary_role_label: string | null;
  all_cities: boolean;
  cities: string[];
  mfa_enrolled: boolean;
  last_sign_in_at: string | null;
  active_sessions: number;
  access_expires_at: string | null;
  invited: boolean;
  created_at: string;
}

export interface MatrixCell {
  role_key: string;
  module_key: string;
  level: string;
  note: string | null;
}

export interface ApprovalRow {
  id: string;
  role: string;
  personName: string;
  personEmail: string;
  reason: string | null;
  requestedBy: string;
  requestedByMe: boolean;
  forMe: boolean;
  createdAt: string;
}

/**
 * super_admin and finance are missing on purpose: those two are proposed
 * and countersigned, never ticked on a form.
 */
export const DIRECT_ROLES = [
  'ops_manager',
  'concierge_agent',
  'city_lead',
  'merchant_ops',
  'rider_ops',
  'hr',
  'growth',
  'dpo',
  'read_only',
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/*
 * Nairobi wall time, built by hand. This renders on the server and again in
 * the browser, which do not always carry the same ICU data, and a time that
 * differs between them is a hydration mismatch. Nairobi is UTC+3 all year.
 */
export function when(iso: string): string {
  const at = new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000);
  const hh = String(at.getUTCHours()).padStart(2, '0');
  const mm = String(at.getUTCMinutes()).padStart(2, '0');
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${hh}:${mm}`;
}

export function Tile({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value: string;
  tone?: 'danger';
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
        {label}
      </p>
      <p className={`mt-2 text-4xl font-extrabold ${tone === 'danger' ? 'text-danger' : ''}`}>
        {value}
      </p>
      <p className="text-muted mt-2 text-xs font-semibold leading-[1.6]">{children}</p>
    </Card>
  );
}

export function RoleBadge({ role, label }: { role: string | null; label: string | null }) {
  if (!role) return <span className="text-muted-light text-xs font-bold">no role</span>;
  const strong = role === 'super_admin';
  return (
    <span
      className={`inline-block rounded px-2 py-1 text-[0.625rem] font-extrabold uppercase tracking-wide ${
        strong ? 'bg-ink text-gold' : 'bg-bg text-ink border-border border'
      }`}
    >
      {label ?? role}
    </span>
  );
}

export function StatusBadge({ row }: { row: StaffRow }) {
  if (row.status !== 'active') {
    return (
      <span className="bg-danger-bg text-danger rounded px-2 py-1 text-[0.625rem] font-extrabold uppercase">
        {row.status}
      </span>
    );
  }
  if (row.invited) {
    return (
      <span className="bg-warning-bg text-warning rounded px-2 py-1 text-[0.625rem] font-extrabold uppercase">
        Invited · never signed in
      </span>
    );
  }
  if (row.access_expires_at) {
    return (
      <span className="bg-warning-bg text-warning rounded px-2 py-1 text-[0.625rem] font-extrabold uppercase">
        Expires {when(row.access_expires_at)}
      </span>
    );
  }
  return (
    <span className="bg-success-bg text-success rounded px-2 py-1 text-[0.625rem] font-extrabold uppercase">
      Active
    </span>
  );
}
