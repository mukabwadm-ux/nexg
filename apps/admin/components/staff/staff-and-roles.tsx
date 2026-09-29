'use client';

import { Button, Card, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import type { ModuleRow, RoleRow } from '@/app/staff/page';
import { claimFirstSuperAdmin } from '@/app/staff/actions';

import { AddStaffDialog } from './add-staff-dialog';
import { ApprovalsTab, SecurityTab } from './approvals-and-security';
import { PersonPanel } from './person-panel';
import { RolesTab } from './roles-tab';
import { RoleBadge, StatusBadge, Tile, when } from './shared';
import type { ApprovalRow, MatrixCell, StaffRow } from './shared';

export type { ApprovalRow, MatrixCell, StaffRow } from './shared';

/**
 * Staff & roles.
 *
 * Four tabs from the artboards. The numbers on the tiles and the facts in
 * the table are read rather than drawn: MFA, last sign-in and open sessions
 * come from Supabase Auth, city scope and access expiry from role_grant,
 * which already had both columns and had never been written to.
 *
 * Where a figure does not exist yet it renders [—], the convention the
 * artboards themselves use. Nothing here invents a number.
 */
const TABS = [
  { key: 'staff', label: 'Staff' },
  { key: 'roles', label: 'Roles & permissions' },
  { key: 'approvals', label: 'Pending approvals' },
  { key: 'security', label: 'Sessions & security' },
];

export function StaffAndRoles({
  me,
  tab,
  selected,
  rows,
  roles,
  modules,
  matrix,
  cities,
  approvals,
  superAdminMin,
  superAdminMax,
}: {
  me: { staffId: string; isSuperAdmin: boolean };
  tab: string;
  selected: string | null;
  rows: StaffRow[];
  roles: RoleRow[];
  modules: ModuleRow[];
  matrix: MatrixCell[];
  cities: { id: string; name: string }[];
  approvals: ApprovalRow[];
  superAdminMin: number | null;
  superAdminMax: number | null;
}) {
  const router = useRouter();
  const person = rows.find((r) => r.staff_id === selected) ?? null;

  const go = (next: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string | null> = { tab, person: selected, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    router.push(`/staff?${params.toString()}`);
  };

  return (
    <main className="px-4 py-6 sm:px-8">
      <p className="text-muted text-sm font-semibold">
        Company work accounts only · role and city scope set here
      </p>

      <nav className="border-border mt-5 flex flex-wrap gap-6 border-b" aria-label="Staff sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => go({ tab: t.key })}
            className={`-mb-px border-b-2 pb-3 text-sm font-bold transition-colors ${
              tab === t.key
                ? 'border-gold text-ink'
                : 'text-muted hover:text-ink border-transparent'
            }`}
          >
            {t.label}
            {t.key === 'approvals' && approvals.length > 0 && (
              <span className="bg-gold text-ink ml-2 rounded-full px-1.5 py-0.5 text-[0.625rem]">
                {approvals.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      <BootstrapNotice rows={rows} />

      {tab === 'staff' && (
        <StaffTab
          me={me}
          rows={rows}
          person={person}
          cities={cities}
          roles={roles}
          superAdminMin={superAdminMin}
          superAdminMax={superAdminMax}
          onSelect={(id) => go({ person: id })}
        />
      )}
      {tab === 'roles' && <RolesTab roles={roles} modules={modules} matrix={matrix} />}
      {tab === 'approvals' && <ApprovalsTab approvals={approvals} />}
      {tab === 'security' && <SecurityTab rows={rows} />}
    </main>
  );
}

/**
 * The first admin has to come from somewhere.
 *
 * Shown only while the project has no super admin at all. The RPC behind it
 * refuses the moment one exists, whatever the UI decides to draw.
 */
function BootstrapNotice({ rows }: { rows: StaffRow[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  if (rows.some((r) => r.roles.includes('super_admin'))) return null;

  return (
    <Card className="border-warning/40 bg-warning-bg mt-6 p-5">
      <p className="text-warning text-[0.9375rem] font-extrabold">
        This project has no super admin yet
      </p>
      <p className="text-warning mt-2 max-w-3xl text-[0.8125rem] font-semibold leading-[1.7]">
        Adding staff, editing cities and changing fees all need one. The first cannot be
        countersigned, because there is nobody to countersign it — so claiming it is recorded in the
        audit trail as exactly that. Every later super admin needs two people.
      </p>
      <Button
        className="mt-4"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          const r = await claimFirstSuperAdmin();
          setBusy(false);
          toast({
            title: r.ok ? 'Done' : 'Not allowed',
            description: r.message,
            tone: r.ok ? 'success' : 'danger',
          });
          if (r.ok) router.refresh();
        }}
      >
        Claim it
      </Button>
    </Card>
  );
}

function StaffTab({
  me,
  rows,
  person,
  cities,
  roles,
  superAdminMin,
  superAdminMax,
  onSelect,
}: {
  me: { staffId: string; isSuperAdmin: boolean };
  rows: StaffRow[];
  person: StaffRow | null;
  cities: { id: string; name: string }[];
  roles: RoleRow[];
  superAdminMin: number | null;
  superAdminMax: number | null;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = React.useState<string>('all');
  const [adding, setAdding] = React.useState(false);

  const superAdmins = rows.filter((r) => r.roles.includes('super_admin'));
  const withoutMfa = rows.filter((r) => !r.mfa_enrolled && !r.invited);
  const invited = rows.filter((r) => r.invited);
  const expiring = rows.filter(
    (r) => r.access_expires_at && new Date(r.access_expires_at).getTime() - Date.now() < 30 * 864e5,
  );

  const filtered = rows.filter((r) => {
    if (filter === 'active') return r.status === 'active' && !r.invited;
    if (filter === 'invited') return r.invited;
    if (filter === 'nomfa') return !r.mfa_enrolled && !r.invited;
    if (filter === 'expiring') return expiring.includes(r);
    if (filter === 'deactivated') return r.status !== 'active';
    return true;
  });

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            ['all', `All ${rows.length}`],
            ['active', 'Active'],
            ['invited', `Invited ${invited.length}`],
            ['nomfa', `No MFA ${withoutMfa.length}`],
            ['expiring', `Expiring ${expiring.length}`],
            ['deactivated', 'Deactivated'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key as string)}
              className={`rounded-full px-4 py-2 text-[0.8125rem] font-extrabold transition-colors ${
                filter === key
                  ? 'bg-ink text-white'
                  : 'border-border-strong bg-surface text-ink hover:border-ink border'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {me.isSuperAdmin && <Button onClick={() => setAdding(true)}>+ Add staff</Button>}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Staff accounts" value={String(rows.length)}>
          {rows.filter((r) => r.status === 'active' && !r.invited).length} signed in ·{' '}
          {invited.length} never have
        </Tile>
        <Tile
          label="Without two-step"
          value={String(withoutMfa.length)}
          tone={withoutMfa.length > 0 ? 'danger' : undefined}
        >
          two-step is available but not enforced — nobody is blocked
        </Tile>
        <Tile label="Super admins" value={String(superAdmins.length)}>
          {superAdmins.map((s) => s.display_name).join(', ') || 'none'} · minimum{' '}
          {superAdminMin ?? '[—]'}, maximum {superAdminMax ?? '[—]'}
        </Tile>
        <Tile label="Access expiring ≤ 30 d" value={String(expiring.length)}>
          {expiring.length > 0
            ? expiring.map((e) => `${e.display_name} · ${e.primary_role_label}`).join(', ')
            : 'nobody'}
        </Tile>
      </div>

      {superAdmins.length > 0 && superAdmins.length < (superAdminMin ?? 0) && (
        <p className="border-warning/40 bg-warning-bg text-warning mt-4 rounded-xl border p-3 text-[0.8125rem] font-bold leading-[1.7]">
          {superAdmins.length} super admin where the policy expects {superAdminMin}. With one,
          nobody can restore access if that account is lost.
        </p>
      )}

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[42rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Person</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Two-step</th>
                <th className="px-4 py-3">Last seen</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.staff_id}
                  onClick={() => onSelect(r.staff_id)}
                  className={`border-border hover:bg-bg cursor-pointer border-b last:border-b-0 ${
                    person?.staff_id === r.staff_id ? 'bg-bg ring-gold ring-1 ring-inset' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <p className="text-[0.8125rem] font-extrabold">{r.display_name}</p>
                    <p className="text-muted-light text-xs font-semibold">{r.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={r.primary_role} label={r.primary_role_label} />
                    {r.roles.length > 1 && (
                      <span className="text-muted-light ml-1 text-[0.625rem] font-bold">
                        +{r.roles.length - 1}
                      </span>
                    )}
                  </td>
                  <td className="text-muted px-4 py-3 text-xs font-semibold">
                    {r.all_cities ? 'All cities' : r.cities.join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-1 text-[0.625rem] font-extrabold ${
                        r.mfa_enrolled ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'
                      }`}
                    >
                      {r.mfa_enrolled ? 'ON' : 'OFF'}
                    </span>
                  </td>
                  <td className="text-muted px-4 py-3 text-xs font-semibold">
                    {r.last_sign_in_at ? when(r.last_sign_in_at) : 'never'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge row={r} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-muted px-4 py-8 text-center text-sm font-semibold"
                  >
                    Nobody matches that filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        {person ? (
          <PersonPanel
            me={me}
            person={person}
            cities={cities}
            roles={roles}
            superAdmins={superAdmins.length}
            superAdminMin={superAdminMin}
          />
        ) : (
          <Card className="p-6">
            <p className="text-muted text-sm font-semibold">
              Pick someone to see their role, scope and security.
            </p>
          </Card>
        )}
      </div>

      {adding && <AddStaffDialog roles={roles} onClose={() => setAdding(false)} />}
    </>
  );
}
