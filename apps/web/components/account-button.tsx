'use client';

import { User } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { signOut } from '@/app/(customer)/sign-in/actions';
import { createClient } from '@/lib/supabase/client';

const iconClass =
  'focus-visible:ring-gold text-gold flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 sm:h-11 sm:w-11';

const LINKS = [
  { href: '/account', label: 'My account' },
  { href: '/account?tab=orders', label: 'Orders' },
  { href: '/account?tab=bookings', label: 'Bookings' },
  { href: '/account?tab=stays', label: 'Stays' },
  { href: '/account?tab=receipts', label: 'Receipts' },
  { href: '/account?tab=notifications', label: 'Notifications' },
];

function initials(meta: Record<string, unknown>, email: string | undefined): string {
  const first = typeof meta.first_name === 'string' ? meta.first_name.trim() : '';
  const last = typeof meta.last_name === 'string' ? meta.last_name.trim() : '';
  const fromName = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
  return fromName || (email ?? '?').charAt(0).toUpperCase();
}

/**
 * The account button at the top right of every public page, Discovery included
 * (owner, 20 Nov 2026: sign-in lands on Discovery, and "My account" opens from here).
 *
 * Signed out it is the plain link it always was: /account sends a visitor to sign in and back.
 * Signed in it shows the person's initials and opens a menu. The session is read in the browser,
 * so the header itself stays cacheable.
 */
export function AccountButton({ href, label }: { href: string; label: string }) {
  const [person, setPerson] = React.useState<{ initials: string; email: string } | null>(null);
  const [open, setOpen] = React.useState(false);
  const wrap = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const supabase = createClient();
    const read = () =>
      void supabase.auth.getSession().then(({ data }) => {
        const user = data.session?.user;
        setPerson(
          user && !user.is_anonymous
            ? { initials: initials(user.user_metadata ?? {}, user.email), email: user.email ?? '' }
            : null,
        );
      });
    read();
    const { data } = supabase.auth.onAuthStateChange(() => read());
    return () => data.subscription.unsubscribe();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !wrap.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!person)
    return (
      <Link href={href} aria-label={label} className={iconClass}>
        <User className="h-4 w-4" aria-hidden="true" fill="currentColor" />
      </Link>
    );

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-label="My account"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${iconClass} !bg-gold !text-ink border-0 text-[0.8125rem] font-extrabold`}
      >
        {person.initials}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="My account"
          className="text-ink border-border-strong absolute right-0 top-[calc(100%+0.5rem)] z-[60] w-64 rounded-xl border bg-white p-2 shadow-xl"
        >
          <p className="border-border mb-1 truncate border-b px-3 pb-2 pt-1 text-[0.8125rem] font-semibold text-[#4d4a44]">
            {person.email}
          </p>
          {LINKS.map((link, i) => (
            <Link
              key={link.href}
              role="menuitem"
              href={link.href}
              onClick={() => setOpen(false)}
              className={`flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-[#f6f3ec] ${
                i === 0 ? 'bg-[#fbf7ea] font-extrabold' : 'font-semibold'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <div className="border-border my-1 border-t" />
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await signOut();
              window.location.assign('/discover');
            }}
            className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold text-[#4d4a44] hover:bg-[#f6f3ec]"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
