import Link from 'next/link';

import { signOut } from '@/app/sign-in/actions';
import { BrandMark } from '@/components/brand-mark';
import type { StaffContext } from '@/lib/staff';

/**
 * The console chrome from the pipeline artboards: dark rail on the left,
 * grouped by what the section is for, with the signed-in staff member pinned
 * to the bottom.
 *
 * Only the sections that exist are listed. The artboard draws the whole
 * console — concierge desk, dispatch, finance — and linking to routes that
 * 404 would be worse than leaving them out until they are built.
 */
const SECTIONS = [
  {
    heading: 'Partners',
    items: [
      { label: 'Riders', href: '/riders' },
      { label: 'Merchants', href: '/merchants' },
    ],
  },
] as const;

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

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="bg-ink flex flex-col text-white lg:min-h-dvh">
        <div className="flex items-center gap-2 px-5 py-5">
          <BrandMark className="h-9 w-10 shrink-0" onDark />
          <span className="border-gold/40 text-gold rounded-full border px-2 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-[0.16em]">
            Admin
          </span>
        </div>

        <nav className="flex-1 px-3 pb-4" aria-label="Console">
          <Link
            href="/"
            className={`block rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
              current === '/' ? 'bg-gold text-ink' : 'text-white/70 hover:text-white'
            }`}
          >
            Overview
          </Link>

          {SECTIONS.map((section) => (
            <div key={section.heading} className="mt-6">
              <p className="px-3 text-[0.5625rem] font-extrabold uppercase tracking-[0.18em] text-white/35">
                {section.heading}
              </p>
              <ul className="mt-2 space-y-1">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`block rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                        current.startsWith(item.href)
                          ? 'bg-gold text-ink'
                          : 'text-white/70 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
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
            <span className="block truncate text-[0.8125rem] font-bold">{staff.displayName}</span>
            <span className="block truncate text-[0.625rem] font-semibold uppercase tracking-wide text-white/40">
              {staff.isSuperAdmin ? 'Super admin' : staff.roles.join(' · ') || 'No role granted'}
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
