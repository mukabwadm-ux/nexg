import Link from 'next/link';

import { signOut } from '@/app/sign-in/actions';
import { Logo } from '@/components/logo';
import type { StaffContext } from '@/lib/staff';

/**
 * The console chrome: dark rail on the left, grouped by what the section is
 * for, with the signed-in staff member pinned to the bottom.
 *
 * The rail is built from role_module_access, not from a list in this file.
 * A module a role cannot reach is simply absent — which is what the
 * permission matrix promises, and the only way to keep that promise is for
 * both to read the same table.
 *
 * Modules that are designed but not built are shown greyed rather than
 * linked. Leaving them out entirely would make the console look smaller
 * than the plan; linking them would 404.
 */
const SECTION_ORDER = ['Operate', 'Partners', 'Grow', 'Money', 'Control'];

export function ConsoleShell({
  staff,
  current,
  children,
}: {
  staff: StaffContext;
  current: string;
  children: React.ReactNode;
}) {
  const initials = staff.displayName
    .replace(/[[\]]/g, '')
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const sections = SECTION_ORDER.map((heading) => ({
    heading,
    items: staff.modules.filter((m) => m.section === heading),
  })).filter((s) => s.items.length > 0);

  const scope = staff.allCities
    ? 'All cities'
    : staff.cities.length > 0
      ? staff.cities.join(', ')
      : 'No city scope';

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside aria-label="Console sidebar" className="bg-ink flex flex-col text-white lg:min-h-dvh">
        <div className="flex items-center gap-2 px-5 py-5">
          <Logo className="h-7 w-auto shrink-0" onDark />
          <span className="border-gold/40 text-gold rounded-full border px-2 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-[0.16em]">
            Admin
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Console">
          {sections.map((section) => (
            <div key={section.heading} className="mt-5 first:mt-0">
              <p className="px-3 text-[0.5625rem] font-extrabold uppercase tracking-[0.18em] text-white/35">
                {section.heading}
              </p>
              <ul className="mt-2 space-y-1">
                {section.items.map((item) => {
                  const active =
                    item.href === '/'
                      ? current === '/'
                      : !!item.href && current.startsWith(item.href);

                  if (!item.href) {
                    return (
                      <li key={item.key}>
                        <span
                          title="Designed, not built yet"
                          className="block cursor-default rounded-lg px-3 py-2 text-sm font-bold text-white/25"
                        >
                          {item.label}
                        </span>
                      </li>
                    );
                  }

                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        className={`block rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                          active ? 'bg-gold text-ink' : 'text-white/70 hover:text-white'
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-3 border-t border-white/10 px-5 py-4">
          <span
            aria-hidden="true"
            className="bg-gold text-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold"
          >
            {initials || '—'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.8125rem] font-bold">{staff.email}</span>
            <span className="block truncate text-[0.625rem] font-semibold uppercase tracking-wide text-white/40">
              {(staff.isSuperAdmin ? 'Super admin' : staff.roles.join(' · ') || 'No role') +
                ' · ' +
                scope}
            </span>
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="text-[0.625rem] font-bold uppercase tracking-wide text-white/40 transition-colors hover:text-white"
            >
              Out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
