import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

export interface StaffContext {
  staffId: string;
  displayName: string;
  email: string;
  /** Role keys granted to this account, across all cities. */
  roles: string[];
  isSuperAdmin: boolean;
}

/**
 * The signed-in staff member, or a redirect to sign-in.
 *
 * Being signed in is not the same as being staff: an applicant holds an
 * anonymous session against the same Supabase project. What makes someone
 * staff is a row in staff_user, and what they may do comes from role_grant —
 * both of which RLS enforces on every query regardless of what this returns.
 * This exists so the console can render the right chrome, not to grant
 * anything.
 */
export async function requireStaff(): Promise<StaffContext> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/sign-in');

  const { data: staff } = await supabase
    .from('staff_user')
    .select('id, display_name, email, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!staff || staff.status !== 'active') redirect('/sign-in?denied=1');

  const { data: grants } = await supabase
    .from('role_grant')
    .select('role(key)')
    .eq('staff_user_id', staff.id);

  const roles = (grants ?? []).flatMap((grant) => {
    const role = grant.role as { key: string } | null;
    return role ? [role.key] : [];
  });

  return {
    staffId: staff.id,
    displayName: staff.display_name ?? staff.email,
    email: staff.email,
    roles,
    isSuperAdmin: roles.includes('ops_manager'),
  };
}
