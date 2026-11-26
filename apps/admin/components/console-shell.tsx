import { cookies } from 'next/headers';
import * as React from 'react';

import { signOut } from '@/app/sign-in/actions';
import { ConsoleFrame } from '@/components/console-frame';
import { IdleTimer } from '@/components/idle-timer';
import { navFor } from '@/lib/console-nav';
import type { StaffContext } from '@/lib/staff';

/**
 * The console chrome around every page: the grouped sidebar, the top bar
 * and the page canvas (see ConsoleFrame).
 *
 * The sidebar is built from role_module_access through lib/console-nav: an
 * entry whose module a role cannot reach is simply absent, which is what the
 * permission matrix promises. Groups that are designed but not built are
 * shown greyed rather than linked.
 *
 * `current` is kept for the pages that pass it; the frame reads the address
 * itself, tab included, to mark the open view.
 */
export function ConsoleShell({
  staff,
  children,
}: {
  staff: StaffContext;
  current?: string;
  children: React.ReactNode;
}) {
  const name = staff.displayName.replace(/[[\]]/g, '').trim() || staff.email;
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const scope = staff.allCities
    ? 'All cities'
    : staff.cities.length > 0
      ? staff.cities.join(', ')
      : 'No city scope';
  const role = staff.isSuperAdmin
    ? 'Super admin'
    : staff.roles.map((r) => r.replace(/_/g, ' ')).join(' · ') || 'No role';

  /* "settings:full" lets an entry ask for full access to a module, not just any. */
  const nav = navFor(
    new Set(
      staff.modules.flatMap((m) => (m.level === 'full' ? [m.key, `${m.key}:full`] : [m.key])),
    ),
  );
  const collapsed = cookies().get('console_rail')?.value === 'collapsed';

  return (
    <>
      {/* The idle rule's client half; the middleware is the other half. */}
      <IdleTimer />
      <React.Suspense>
        <ConsoleFrame
          nav={nav}
          collapsed={collapsed}
          signOut={signOut}
          staff={{
            name,
            email: staff.email,
            role: `${role} · ${scope}`,
            initials,
            avatarUrl: staff.avatarUrl,
          }}
        >
          {children}
        </ConsoleFrame>
      </React.Suspense>
    </>
  );
}
