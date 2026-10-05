import Link from 'next/link';
import * as React from 'react';

import { Logo } from '@/components/logo';

import { SignOut } from './sign-out';

export interface PartnerNavItem {
  href: string;
  label: string;
  /** A number worth interrupting someone for. Zero is not one. */
  badge?: number | null;
  tone?: 'danger' | 'gold';
}

/**
 * The frame both partner dashboards sit in.
 *
 * One shell rather than two, because a merchant and a rider want
 * the same three things from a frame — know who they are signed in
 * as, get between sections, and get out — and two copies of that
 * is two places for it to drift.
 *
 * It is not the marketing header. A partner at work does not need
 * "Become a merchant" in their navigation, and the dark bar is the
 * cue that this is the inside of the account rather than the shop
 * window.
 */
export function PartnerShell({
  kind,
  name,
  subtitle,
  nav,
  current,
  banner,
  children,
}: {
  kind: 'merchant' | 'rider';
  name: string;
  subtitle: string;
  nav: PartnerNavItem[];
  current: string;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-bg min-h-dvh">
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link
            href={kind === 'merchant' ? '/merchant' : '/rider'}
            className="flex items-center gap-3"
          >
            <Logo className="h-8 w-auto" onDark />
            <span className="text-gold/90 text-[0.6875rem] font-extrabold uppercase tracking-[0.18em]">
              {kind === 'merchant' ? 'Merchant' : 'Rider'}
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[0.8125rem] font-extrabold leading-tight">{name}</p>
              <p className="text-[0.6875rem] font-semibold text-white/50">{subtitle}</p>
            </div>
            <SignOut />
          </div>
        </div>

        <nav
          aria-label={`${kind} sections`}
          className="mx-auto flex max-w-6xl gap-5 overflow-x-auto px-4 sm:px-6"
        >
          {nav.map((item) => {
            const on = current === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={on ? 'page' : undefined}
                className={`-mb-px shrink-0 border-b-2 pb-3 text-[0.8125rem] font-extrabold transition-colors ${
                  on
                    ? 'border-gold text-white'
                    : 'border-transparent text-white/55 hover:text-white'
                }`}
              >
                {item.label}
                {item.badge ? (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[0.625rem] ${
                      item.tone === 'danger' ? 'bg-danger text-white' : 'bg-gold text-ink'
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </header>

      {banner}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <footer className="text-muted-light mx-auto max-w-6xl px-4 pb-10 text-[0.6875rem] font-semibold sm:px-6">
        Nexgenius Concierge Limited · Anything you change here is logged against your account.
      </footer>
    </div>
  );
}

/**
 * The one thing standing between a partner and working.
 *
 * At most one of these shows at a time. A page that greets somebody
 * with four warnings has told them nothing about which to do first.
 */
export function Blocker({
  tone = 'gold',
  title,
  body,
  action,
}: {
  tone?: 'gold' | 'danger';
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={tone === 'danger' ? 'bg-danger-bg' : 'bg-gold-soft'}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div>
          <p
            className={`text-[0.875rem] font-extrabold ${
              tone === 'danger' ? 'text-danger' : 'text-gold-text'
            }`}
          >
            {title}
          </p>
          <p className="text-ink/75 text-[0.8125rem] font-semibold">{body}</p>
        </div>
        {action}
      </div>
    </div>
  );
}
