import { redirect } from 'next/navigation';
import * as React from 'react';

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
  /** A lucide name; the shell maps it to a component. */
  icon: string | null;
  level: AccessLevel;
  note: string | null;
}

export interface StaffContext {
  staffId: string;
  displayName: string;
  email: string;
  /** Short-lived signed URL for the profile photo, if they have one. */
  avatarUrl: string | null;
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
/* React.cache exists in the React build Next ships for the app router;
   the plain build tests run on lacks it, and there one call per page is fine. */
const cache: <T extends (...args: never[]) => unknown>(fn: T) => T =
  (React as { cache?: <T>(fn: T) => T }).cache ?? ((fn) => fn);

export const requireStaff = cache(loadStaff);

/** The user id inside the access token, read without a network call (and
    without touching session.user, which logs a warning on the server). */
function subjectOf(token: string | undefined): string | null {
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))) as {
      sub?: unknown;
    };
    return typeof claims.sub === 'string' ? claims.sub : null;
  } catch {
    return null;
  }
}

/*
 * Every console page opens with this, so its round trips are the floor
 * under every page's load time. They used to run one after another (six
 * waits to the database before the page could ask for its own data); now
 * everything that only needs the signed-in user id goes in one batch.
 *
 * The id comes from the session cookie, which costs nothing to read. That
 * is safe to lean on because getUser() still checks the session with
 * Supabase in the same batch and the page stops if it fails, and because
 * every query is made with that same token, so RLS refuses a forged one.
 * cache() makes a page that calls this twice pay for it once.
 */
async function loadStaff(): Promise<StaffContext> {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = subjectOf(session?.access_token);
  if (!userId) redirect('/sign-in');

  const [checked, staffRes, grantsRes, profileRes, modulesRes, accessRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('staff_user')
      .select('id, display_name, email, status')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('role_grant')
      .select(
        'city_id, city(name), role(key), staff_user!role_grant_staff_user_id_fkey!inner(user_id)',
      )
      .eq('staff_user.user_id', userId)
      .is('revoked_at', null),
    /* A photo is optional and never worth failing a page over. The column is
       newer than the generated types, hence the loose read. */
    (
      supabase.rpc('rpc_my_staff_profile' as never) as unknown as Promise<{
        data: { avatar_path?: string | null } | null;
      }>
    ).then(async ({ data: mine }) => {
      if (!mine?.avatar_path) return null;
      const { data: signed } = await supabase.storage
        .from('staff-avatars')
        .createSignedUrl(mine.avatar_path, 3600);
      return signed?.signedUrl ?? null;
    }),
    supabase.from('console_module').select('key, label, section, href, sort, icon').order('sort'),
    /* The whole matrix is a few hundred rows; filtering here saves a wait. */
    supabase.from('role_module_access').select('role_key, module_key, level, note'),
  ]);

  const user = checked.data.user;
  if (!user || user.id !== userId) redirect('/sign-in');

  const staff = staffRes.data;
  if (!staff || staff.status !== 'active') redirect('/sign-in?denied=1');

  const avatarUrl = profileRes;

  const rows = grantsRes.data ?? [];
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
  const modules = modulesRes.data;
  const access = (accessRes.data ?? []).filter((a) => roles.includes(a.role_key));

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
      icon: string | null;
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
    avatarUrl,
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
