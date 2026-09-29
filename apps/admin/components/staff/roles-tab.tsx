'use client';

import { Card } from '@nexg/ui';
import * as React from 'react';

import type { ModuleRow, RoleRow } from '@/app/staff/page';

import type { MatrixCell } from './shared';

/**
 * Roles & permissions — the matrix.
 *
 * Read from role_module_access, which is also what builds the sidebar. That
 * is the whole point of keeping it in a table: the picture staff are shown
 * here and the console they actually get come from one place and cannot
 * drift apart.
 *
 * What this is not is the enforcement of data access. That is RLS, which
 * runs whatever the console believes. This decides what is worth showing
 * someone; the policies decide what they may have. The note at the bottom
 * says so, because a matrix that looks like the security model and is not
 * would be worse than no matrix.
 */

const LEVELS: Record<string, { label: string; className: string }> = {
  full: { label: 'Full', className: 'bg-ink text-white' },
  view: { label: 'View', className: 'bg-success-bg text-success' },
  own_city: { label: 'Own city', className: 'bg-gold-soft text-gold-text' },
  limited: { label: 'Limited', className: 'bg-bg text-ink border-border-strong border' },
  view_invoices: { label: 'View + invoices', className: 'bg-success-bg text-success' },
  own_actions: { label: 'Own actions', className: 'bg-gold-soft text-gold-text' },
};

/** The order the artboard lists the roles across the top. */
const ORDER = [
  'super_admin',
  'ops_manager',
  'concierge_agent',
  'city_lead',
  'finance',
  'merchant_ops',
  'rider_ops',
  'hr',
  'read_only',
  'growth',
  'dpo',
];

export function RolesTab({
  roles,
  modules,
  matrix,
}: {
  roles: RoleRow[];
  modules: ModuleRow[];
  matrix: MatrixCell[];
}) {
  const ordered = [...roles].sort((a, b) => {
    const ai = ORDER.indexOf(a.key);
    const bi = ORDER.indexOf(b.key);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const cell = (roleKey: string, moduleKey: string) =>
    matrix.find((m) => m.role_key === roleKey && m.module_key === moduleKey);

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      <Card className="overflow-x-auto p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[0.9375rem] font-extrabold">Permission matrix · modules × roles</h2>
          <p className="text-muted-light text-xs font-semibold">
            {ordered.length} roles · {modules.length} modules
          </p>
        </div>

        <table className="mt-4 w-full min-w-[56rem] border-separate border-spacing-1 text-left">
          <thead>
            <tr>
              <th />
              {ordered.map((r) => (
                <th key={r.key} className="px-1 pb-2 align-bottom">
                  <span
                    className={`block rounded px-2 py-1 text-center text-[0.5625rem] font-extrabold uppercase leading-tight tracking-wide ${
                      r.key === 'super_admin' ? 'bg-ink text-gold' : 'bg-bg text-muted'
                    }`}
                  >
                    {r.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <tr key={m.key}>
                <th className="w-48 py-1 pr-3 text-left align-middle text-xs font-bold">
                  {m.label}
                  {!m.href && (
                    <span className="text-muted-light ml-1 text-[0.625rem] font-semibold">
                      · not built
                    </span>
                  )}
                </th>
                {ordered.map((r) => {
                  const c = cell(r.key, m.key);
                  const level = c && c.level !== 'none' ? LEVELS[c.level] : null;
                  return (
                    <td key={r.key} className="px-0.5 py-0.5">
                      {level ? (
                        <span
                          title={c?.note ?? undefined}
                          className={`block rounded px-2 py-1.5 text-center text-[0.625rem] font-extrabold ${level.className}`}
                        >
                          {level.label}
                        </span>
                      ) : (
                        <span className="bg-bg/60 text-muted-light block rounded px-2 py-1.5 text-center text-[0.625rem]">
                          —
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="text-muted-light mt-4 space-y-1 text-[0.6875rem] font-semibold">
          <li>
            <Swatch className="bg-ink text-white">Full</Swatch> create, edit, approve ·{' '}
            <Swatch className="bg-success-bg text-success">View</Swatch> read only ·{' '}
            <Swatch className="bg-gold-soft text-gold-text">Own city</Swatch> full, filtered to
            assigned cities
          </li>
          <li>
            <Swatch className="bg-bg text-ink border-border-strong border">Limited</Swatch> and{' '}
            <Swatch className="bg-success-bg text-success">View + invoices</Swatch> carry a note —
            hover the cell
          </li>
        </ul>

        <p className="text-muted mt-4 text-xs font-semibold leading-[1.7]">
          This table builds the sidebar: a module a role cannot reach is absent, and typing its URL
          sends you back to the overview. It is not what protects the data — row-level security does
          that on every query, whatever the console believes.
        </p>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <h3 className="text-sm font-extrabold uppercase tracking-wide">Two-person actions</h3>
          <dl className="mt-3 space-y-2 text-[0.8125rem]">
            <TwoPerson
              action="New super admin or finance role"
              who="Proposer + the recipient"
              live
            />
            <TwoPerson action="Suspend a merchant" who="Requester + a second ops manager" live />
            <TwoPerson action="Refund above the cap" who="Ops manager" />
            <TwoPerson action="Weekly settlement release" who="Finance + ops manager" />
            <TwoPerson action="Fee / commission change" who="Finance + ops manager" />
            <TwoPerson action="Data erasure (KDPA)" who="Super admin" />
          </dl>
          <p className="text-muted-light mt-3 text-xs font-semibold leading-[1.6]">
            Ticked ones are enforced in the database today. The rest are designed and wait on the
            orders and settlement work — they are listed so the gap is visible, not to imply they
            are on.
          </p>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-extrabold uppercase tracking-wide">Role landing pages</h3>
          <dl className="mt-3 space-y-1.5 text-[0.8125rem]">
            {ordered.map((r) => (
              <div key={r.key} className="flex justify-between gap-3">
                <dt className="text-muted-light font-semibold">{r.label}</dt>
                <dd className="font-bold">
                  {modules.find((m) => m.key === r.landing_module)?.label ?? 'Overview'}
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-extrabold uppercase tracking-wide">Principles</h3>
          <ul className="text-muted mt-3 space-y-2 text-xs font-semibold leading-[1.7]">
            <li>Permissions live on roles, never on people.</li>
            <li>Finance never sees guest phone numbers or chat.</li>
            <li>Concierge never sees settlement amounts.</li>
            <li>City scope filters data; it never widens permissions.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Swatch({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={`mr-1 inline-block rounded px-1.5 py-0.5 text-[0.5625rem] font-extrabold ${className}`}
    >
      {children}
    </span>
  );
}

function TwoPerson({ action, who, live }: { action: string; who: string; live?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-light font-semibold">
        {live && <span className="text-success mr-1">✓</span>}
        {action}
      </dt>
      <dd className={`shrink-0 text-right font-bold ${live ? '' : 'text-muted-light'}`}>{who}</dd>
    </div>
  );
}
