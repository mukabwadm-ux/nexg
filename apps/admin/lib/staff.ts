import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

export type AccessLevel =
  | 'full'
  | 'view'
  | 'own_city'
  | 'limited'
  | 'view_invoices'
  | 'own_actions'
  | 'none';

export interface ConsoleModule {
  key: string;
  label: string;
  section: string;
  href: string | null;
  sort: number;
  level: AccessLevel;
  note: string | null;
}

export interface StaffContext {
  staffId: string;
  displayName: string;
  email: string;
  /** Role keys granted to this account, across all cities. */
  roles: string[];
  isSuperAdmin: boolean;
  /** Null city on any grant means every city. */
  allCities: boolean;
  cities: string[];
  /** The modules this person may reach, best level first where roles overlap. */
  modules: ConsoleModule[];
}

/** Which level wins when someone holds two roles that both reach a module. */
const STRENGTH: Record<AccessLevel, number> = {
  full: 6,
  own_city: 5,
  limited: 4,
  view_invoices: 3,
  view: 2,
  own_actions: 1,
  none: 0,
};

/**
 * The signed-in staff member, or a redirect to sign-in.
 *
 * Being signed in is not the same as being staff: an applicant holds an
 * anonymous session against the same Supabase project. What makes someone
 * staff is a row in staff_user, and what they may do comes from role_grant —
 * both of which RLS enforces on every query regardless of what this returns.
 * This exists so the console can render the right chrome, not to grant
 * anything.
 *
 * The module list is the same one the permission matrix draws, so the
 * sidebar a person sees and the row the matrix shows for their role cannot
 * disagree.
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
    .select('city_id, city(name), role(key)')
    .eq('staff_user_id', staff.id)
    .is('revoked_at', null);

  const rows = grants ?? [];
  const roles = rows.flatMap((g) => {
    const role = g.role as { key: string } | null;
    return role ? [role.key] : [];
  });

  const allCities = rows.some((g) => g.city_id === null);
  const cities = [
    ...new Set(
      rows.flatMap((g) => {
        const city = g.city as { name: string } | null;
        return city ? [city.name] : [];
      }),
    ),
  ].sort();

  /* Modules, merged across every role held. */
  const [{ data: modules }, { data: access }] = await Promise.all([
    supabase.from('console_module').select('key, label, section, href, sort').order('sort'),
    roles.length > 0
      ? supabase.from('role_module_access').select('module_key, level, note').in('role_key', roles)
      : Promise.resolve({ data: [] }),
  ]);

  const best = new Map<string, { level: AccessLevel; note: string | null }>();
  for (const a of (access ?? []) as {
    module_key: string;
    level: AccessLevel;
    note: string | null;
  }[]) {
    const current = best.get(a.module_key);
    if (!current || STRENGTH[a.level] > STRENGTH[current.level]) {
      best.set(a.module_key, { level: a.level, note: a.note });
    }
  }

  const reachable: ConsoleModule[] = (
    (modules ?? []) as {
      key: string;
      label: string;
      section: string;
      href: string | null;
      sort: number;
    }[]
  )
    .map((m) => ({
      ...m,
      level: best.get(m.key)?.level ?? ('none' as AccessLevel),
      note: best.get(m.key)?.note ?? null,
    }))
    .filter((m) => m.level !== 'none');

  return {
    staffId: staff.id,
    displayName: staff.display_name ?? staff.email,
    email: staff.email,
    roles,
    /*
     * This read `roles.includes('ops_manager')`, which is a different role.
     * It only drove a label, so nothing was granted wrongly — but anything
     * that later gated on it would have handed every ops manager the
     * console's most privileged chrome.
     */
    isSuperAdmin: roles.includes('super_admin'),
    allCities,
    cities,
    modules: reachable,
  };
}

/**
 * Refuses a page the signed-in person's roles do not reach.
 *
 * The sidebar already leaves those modules out, so arriving here means a
 * typed URL or a stale link. It redirects rather than throwing, because a
 * stack trace tells someone probing the console more than a redirect does.
 */
export function requireModule(staff: StaffContext, moduleKey: string): ConsoleModule {
  const found = staff.modules.find((m) => m.key === moduleKey);
  if (!found) redirect('/?denied=' + encodeURIComponent(moduleKey));
  return found;
}
