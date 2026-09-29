import type { Metadata } from 'next';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import {
  StaffAndRoles,
  type ApprovalRow,
  type MatrixCell,
  type StaffRow,
} from '@/components/staff/staff-and-roles';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Staff & roles' };
export const dynamic = 'force-dynamic';

export default async function StaffPage({
  searchParams,
}: {
  searchParams?: { tab?: string; person?: string };
}) {
  const staff = await requireStaff();
  const supabase = createClient();

  /*
   * The bootstrap banner lives on this page, and only a super admin may
   * reach this page — so the first admin could never get to the thing that
   * makes them one. The page is open to any staff member while the project
   * has no super admin at all, which is exactly the state the banner is for
   * and closes the moment it is used.
   *
   * Nothing is handed over by letting them look: every write on this page
   * goes through an RPC that checks super_admin itself, and rpc_staff_directory
   * returns no rows to anyone else. A non-admin arriving here in the
   * bootstrap state sees an empty table and the Claim it button.
   */
  const { count: superAdmins } = await supabase
    .from('role_grant')
    .select('role!inner(key)', { count: 'exact', head: true })
    .is('revoked_at', null)
    .eq('role.key', 'super_admin');

  if ((superAdmins ?? 0) > 0) requireModule(staff, 'staff');

  const [
    { data: directory },
    { data: roles },
    { data: modules },
    { data: matrix },
    { data: cities },
    { data: approvals },
    { data: settings },
  ] = await Promise.all([
    supabase.rpc('rpc_staff_directory'),
    supabase.from('role').select('key, label, description, landing_module').order('key'),
    supabase.from('console_module').select('key, label, section, href, sort').order('sort'),
    supabase.from('role_module_access').select('role_key, module_key, level, note'),
    supabase.from('city').select('id, name').order('sort'),
    supabase
      .from('approval_request')
      .select('id, kind, target_id, reason, payload, status, requested_by, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabase.from('setting').select('key, value').in('key', ['super_admin_min', 'super_admin_max']),
  ]);

  const rows = (directory as StaffRow[] | null) ?? [];
  const byId = new Map(rows.map((r) => [r.staff_id, r]));

  const pending: ApprovalRow[] = ((approvals ?? []) as RawApproval[])
    .filter((a) => a.kind === 'staff_role_grant')
    .map((a) => ({
      id: a.id,
      role: (a.payload as { role?: string } | null)?.role ?? '—',
      personName:
        byId.get(a.target_id)?.display_name ??
        (a.payload as { display_name?: string } | null)?.display_name ??
        'Unknown',
      personEmail:
        byId.get(a.target_id)?.email ?? (a.payload as { email?: string } | null)?.email ?? '',
      reason: a.reason,
      requestedBy: rows.find((r) => r.staff_id === a.requested_by)?.display_name ?? 'A super admin',
      requestedByMe: a.requested_by === staff.staffId,
      forMe: a.target_id === staff.staffId,
      createdAt: a.created_at,
    }));

  const limits = Object.fromEntries(
    ((settings ?? []) as { key: string; value: unknown }[]).map((s) => [s.key, Number(s.value)]),
  );

  return (
    <ConsoleShell staff={staff} current="/staff">
      <ConsoleHeader
        title="Staff & roles"
        breadcrumb="Control → Staff & roles"
        action={
          <span className="text-muted text-xs font-semibold">
            {rows.length} account{rows.length === 1 ? '' : 's'}
          </span>
        }
      />
      <StaffAndRoles
        me={{ staffId: staff.staffId, isSuperAdmin: staff.isSuperAdmin }}
        tab={searchParams?.tab ?? 'staff'}
        selected={searchParams?.person ?? null}
        rows={rows}
        roles={(roles as RoleRow[] | null) ?? []}
        modules={(modules as ModuleRow[] | null) ?? []}
        matrix={(matrix as MatrixCell[] | null) ?? []}
        cities={(cities as { id: string; name: string }[] | null) ?? []}
        approvals={pending}
        superAdminMin={limits['super_admin_min'] ?? null}
        superAdminMax={limits['super_admin_max'] ?? null}
      />
    </ConsoleShell>
  );
}

interface RawApproval {
  id: string;
  kind: string;
  target_id: string;
  reason: string | null;
  payload: unknown;
  status: string;
  requested_by: string;
  created_at: string;
}

export interface RoleRow {
  key: string;
  label: string;
  description: string | null;
  landing_module: string | null;
}

export interface ModuleRow {
  key: string;
  label: string;
  section: string;
  href: string | null;
  sort: number;
}
