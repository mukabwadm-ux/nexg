'use client';

import { Button, Card, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import type { RoleRow } from '@/app/staff/page';
import { requestRole, setRoles, setScope, setStatus, signOutEverywhere } from '@/app/staff/actions';

import { DIRECT_ROLES, RoleBadge, when, type StaffRow } from './shared';

/**
 * One person: what they may do, where, until when, and how their account is
 * secured.
 *
 * Everything on the Security block is read from Supabase Auth rather than
 * described — second factor, last sign-in, open sessions. The two figures
 * the artboard shows that nothing records yet, phone-number reveals and
 * data exports, render as [—] rather than as zero, because zero would be a
 * claim that nobody has done it.
 */
export function PersonPanel({
  me,
  person,
  cities,
  roles,
  superAdmins,
  superAdminMin,
}: {
  me: { staffId: string; isSuperAdmin: boolean };
  person: StaffRow;
  cities: { id: string; name: string }[];
  roles: RoleRow[];
  superAdmins: number;
  superAdminMin: number | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<string[]>(
    person.roles.filter((r) => DIRECT_ROLES.includes(r)),
  );
  const [cityId, setCityId] = React.useState<string>(
    person.all_cities ? '' : (cities.find((c) => person.cities.includes(c.name))?.id ?? ''),
  );
  const [expires, setExpires] = React.useState<string>(
    person.access_expires_at ? person.access_expires_at.slice(0, 10) : '',
  );
  const [proposing, setProposing] = React.useState<'super_admin' | 'finance' | null>(null);

  React.useEffect(() => {
    setPicked(person.roles.filter((r) => DIRECT_ROLES.includes(r)));
    setCityId(
      person.all_cities ? '' : (cities.find((c) => person.cities.includes(c.name))?.id ?? ''),
    );
    setExpires(person.access_expires_at ? person.access_expires_at.slice(0, 10) : '');
  }, [person, cities]);

  const run = async (key: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    toast({
      title: r.ok ? 'Done' : 'Not allowed',
      description: r.message,
      tone: r.ok ? 'success' : 'danger',
    });
    if (r.ok) router.refresh();
  };

  const isSelf = person.staff_id === me.staffId;
  const lastSuperAdmin =
    person.roles.includes('super_admin') && superAdmins <= (superAdminMin ?? 1);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-[1.0625rem] font-extrabold">{person.display_name}</span>
            <RoleBadge role={person.primary_role} label={person.primary_role_label} />
          </p>
          <p className="text-muted mt-1 text-xs font-semibold">
            {person.email} · joined {when(person.created_at)}
          </p>
        </div>
      </div>

      {/* ───────────────────────────────────────────── role and scope */}
      <div className="border-border mt-5 border-t pt-4">
        <p className="text-[0.8125rem] font-extrabold">Role &amp; scope</p>

        <div className="mt-3 flex flex-wrap gap-2">
          {roles
            .filter((r) => DIRECT_ROLES.includes(r.key))
            .map((role) => {
              const on = picked.includes(role.key);
              return (
                <button
                  key={role.key}
                  type="button"
                  aria-pressed={on}
                  disabled={!me.isSuperAdmin}
                  title={role.description ?? undefined}
                  onClick={() =>
                    setPicked(on ? picked.filter((k) => k !== role.key) : [...picked, role.key])
                  }
                  className={`rounded-full px-3 py-1.5 text-xs font-extrabold transition-colors disabled:opacity-50 ${
                    on
                      ? 'bg-ink text-gold'
                      : 'border-border-strong bg-surface text-ink hover:border-ink border'
                  }`}
                >
                  {role.label}
                </button>
              );
            })}
        </div>

        {person.roles.includes('super_admin') && (
          <p className="text-muted-light mt-3 text-xs font-semibold">
            Also holds <strong>Super admin</strong>, which is not changed here — it was
            countersigned.
          </p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-muted-light text-xs font-semibold">City scope</span>
            <select
              value={cityId}
              disabled={!me.isSuperAdmin}
              onChange={(e) => setCityId(e.target.value)}
              className="border-border-strong bg-bg mt-1 w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
            >
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-muted-light text-xs font-semibold">Access expires</span>
            <input
              type="date"
              value={expires}
              disabled={!me.isSuperAdmin}
              onChange={(e) => setExpires(e.target.value)}
              className="border-border-strong bg-bg mt-1 w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
            />
          </label>
        </div>
        <p className="text-muted-light mt-2 text-xs font-semibold leading-[1.6]">
          Leave the date empty for permanent staff. City scope filters what they see; it never
          widens what they may do. Super admin always stays at every city.
        </p>

        {me.isSuperAdmin && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              loading={busy === 'roles'}
              onClick={() => void run('roles', () => setRoles(person.staff_id, picked))}
            >
              Save roles
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={busy === 'scope'}
              onClick={() =>
                void run('scope', () =>
                  setScope(
                    person.staff_id,
                    cityId || null,
                    expires ? new Date(expires + 'T12:00:00Z').toISOString() : null,
                  ),
                )
              }
            >
              Save scope
            </Button>
          </div>
        )}
      </div>

      {/* ───────────────────────────────────── the two that need two people */}
      {me.isSuperAdmin && (
        <div className="border-border mt-5 border-t pt-4">
          <p className="text-[0.8125rem] font-extrabold">Roles that need a second person</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(['super_admin', 'finance'] as const).map((role) =>
              person.roles.includes(role) ? (
                <span
                  key={role}
                  className="bg-success-bg text-success rounded-full px-3 py-1.5 text-xs font-extrabold"
                >
                  Holds {role === 'super_admin' ? 'Super admin' : 'Finance'}
                </span>
              ) : (
                <Button key={role} size="sm" variant="outline" onClick={() => setProposing(role)}>
                  Propose {role === 'super_admin' ? 'Super admin' : 'Finance'}
                </Button>
              ),
            )}
          </div>
          <p className="text-muted-light mt-2 text-xs font-semibold leading-[1.6]">
            You propose; someone else accepts. Nobody can promote themselves, and nobody can promote
            another person without that person agreeing.
          </p>
        </div>
      )}

      {/* ────────────────────────────────────────────────────── security */}
      <div className="border-border mt-5 border-t pt-4">
        <p className="text-[0.8125rem] font-extrabold">Security</p>
        <dl className="mt-3 space-y-2 text-[0.8125rem]">
          <Row label="Two-step verification">
            <span className={person.mfa_enrolled ? 'text-success' : 'text-warning'}>
              {person.mfa_enrolled ? 'Enrolled' : 'Not enrolled · not enforced yet'}
            </span>
          </Row>
          <Row label="Last sign-in">
            {person.last_sign_in_at ? when(person.last_sign_in_at) : 'never'}
          </Row>
          <Row label="Active sessions">{String(person.active_sessions)}</Row>
          {/* Nothing records these yet. Zero would be a claim. */}
          <Row label="Phone-number reveals · 30 d">[—]</Row>
          <Row label="Data exports · 30 d">[—]</Row>
        </dl>
      </div>

      {me.isSuperAdmin && (
        <div className="border-border mt-5 flex flex-wrap gap-2 border-t pt-4">
          <Button
            size="sm"
            variant="outline"
            loading={busy === 'signout'}
            onClick={() => void run('signout', () => signOutEverywhere(person.staff_id))}
          >
            Sign out everywhere
          </Button>
          {person.status === 'active' ? (
            <Button
              size="sm"
              variant="danger"
              disabled={isSelf || lastSuperAdmin}
              loading={busy === 'status'}
              onClick={() => {
                const reason = window.prompt('Why? This goes in the audit trail with your name.');
                if (reason === null) return;
                void run('status', () => setStatus(person.staff_id, 'suspended', reason));
              }}
            >
              Deactivate
            </Button>
          ) : (
            <Button
              size="sm"
              loading={busy === 'status'}
              onClick={() =>
                void run('status', () => setStatus(person.staff_id, 'active', 'Reinstated'))
              }
            >
              Reactivate
            </Button>
          )}
        </div>
      )}

      <p className="text-muted-light mt-3 text-xs font-semibold leading-[1.6]">
        {isSelf
          ? 'This is you. You cannot deactivate your own account — ask another admin.'
          : lastSuperAdmin
            ? `Cannot deactivate: the policy expects ${superAdminMin} super admins and there ${superAdmins === 1 ? 'is' : 'are'} ${superAdmins}.`
            : 'Role changes take effect on next sign-in. Deactivation and signing out are immediate.'}
      </p>

      {proposing && (
        <ProposeDialog
          role={proposing}
          person={person}
          onClose={() => setProposing(null)}
          onDone={() => {
            setProposing(null);
            router.refresh();
          }}
        />
      )}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-light shrink-0 font-semibold">{label}</dt>
      <dd className="text-right font-bold">{children}</dd>
    </div>
  );
}

function ProposeDialog({
  role,
  person,
  onClose,
  onDone,
}: {
  role: 'super_admin' | 'finance';
  person: StaffRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="bg-ink/40 absolute inset-0"
      />
      <div className="border-border bg-surface relative w-full max-w-lg rounded-2xl border p-6">
        <h2 className="text-xl font-extrabold tracking-tight">
          Propose {role === 'super_admin' ? 'Super admin' : 'Finance'} for {person.display_name}
        </h2>
        <p className="text-muted mt-2 text-[0.9375rem] leading-[1.8]">
          This writes a request, not the role. {person.display_name} — or another super admin — has
          to accept it before it takes effect.
        </p>
        <label className="mt-4 block">
          <span className="text-muted-light text-xs font-semibold">
            Why. Whoever accepts is reading this.
          </span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="border-border-strong bg-bg mt-1 w-full rounded-xl border px-3 py-2 text-[0.875rem] font-semibold"
          />
        </label>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            loading={busy}
            disabled={!reason.trim()}
            onClick={async () => {
              setBusy(true);
              const r = await requestRole(person.staff_id, role, reason);
              setBusy(false);
              toast({
                title: r.ok ? 'Proposed' : 'Not allowed',
                description: r.message,
                tone: r.ok ? 'success' : 'danger',
              });
              if (r.ok) onDone();
            }}
          >
            Propose it
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
