'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import type { RiderNavItem } from './shell';

/**
 * The rider navigation, which works out where it is.
 *
 * Same change as the merchant side, for the same reason: a
 * `current` prop meant every page had to render the shell in
 * order to pass one, and five of the twelve did not — Documents,
 * Earnings, Jobs, Messages and Profile rendered with no sidebar
 * and no way to sign out.
 */
function isOn(pathname: string, href: string): boolean {
  if (href === '/rider') return pathname === '/rider';
  return pathname === href || pathname.startsWith(href + '/');
}

export function RiderSideNav({ nav }: { nav: RiderNavItem[] }) {
  const pathname = usePathname() ?? '';

  return (
    <nav aria-label="Rider dashboard" className="flex-1 px-3">
      <ul className="space-y-0.5">
        {nav.map((item) => {
          const on = isOn(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={on ? 'page' : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[0.8125rem] font-extrabold transition-colors ${
                  on ? 'bg-gold text-ink' : 'text-white/65 hover:bg-white/[0.07] hover:text-white'
                }`}
              >
                <span className="shrink-0" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.badge ? (
                  <span
                    className={`h-[1.1rem] min-w-[1.1rem] shrink-0 rounded-full px-1 text-center text-[0.625rem] font-extrabold leading-[1.1rem] ${
                      item.tone === 'danger'
                        ? 'bg-danger text-white'
                        : on
                          ? 'bg-ink text-white'
                          : 'bg-gold text-ink'
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}
                {item.locked ? (
                  <Lock className="h-3 w-3 shrink-0 opacity-50" aria-label="not yet available" />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function RiderPhoneNav({ nav }: { nav: RiderNavItem[] }) {
  const pathname = usePathname() ?? '';

  return (
    <nav
      aria-label="Rider dashboard"
      className="border-border bg-surface fixed bottom-0 left-0 right-0 z-30 flex gap-1 overflow-x-auto border-t px-2 py-2 lg:hidden"
    >
      {nav.slice(0, 6).map((item) => {
        const on = isOn(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? 'page' : undefined}
            className={`relative flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[0.5625rem] font-extrabold ${
              on ? 'bg-gold text-ink' : 'text-muted'
            }`}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span className="whitespace-nowrap">{item.label}</span>
            {item.badge ? (
              <span className="bg-danger absolute right-1 top-0.5 h-1.5 w-1.5 rounded-full" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
