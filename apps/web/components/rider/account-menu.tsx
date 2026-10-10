'use client';

import { ChevronDown, LogOut, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { signOut } from '@/app/sign-in/actions';

/**
 * The rider's account button, and the way out.
 *
 * The old `SignOut` was styled for the dark sidebar and sat in
 * the light header — white text on a near-white strip, present
 * and invisible on every page that had a shell at all.
 */
export function RiderAccountMenu({
  personName,
  riderCode,
  vehicle,
  active,
}: {
  personName: string;
  riderCode: string;
  vehicle: string | null;
  active: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [going, setGoing] = React.useState(false);
  const box = React.useRef<HTMLDivElement>(null);

  const initials =
    personName
      .split(' ')
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'RD';

  /* Close on a click elsewhere, and on Escape. */
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const role = active ? 'Rider' : 'Applicant';
  const subtitle = vehicle ? `${role} · ${riderCode} · ${vehicle}` : `${role} · ${riderCode}`;

  return (
    <div ref={box} className="border-border relative border-l pl-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="hover:bg-bg flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors"
      >
        <span className="bg-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-extrabold text-white">
          {initials}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-[0.8125rem] font-extrabold leading-tight">{personName}</span>
          <span className="text-muted-light block text-[0.6875rem] font-semibold leading-tight">
            {subtitle}
          </span>
        </span>
        <ChevronDown
          className={`text-muted-light h-4 w-4 shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="border-border bg-surface shadow-raised absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60 overflow-hidden rounded-xl border"
        >
          <div className="border-border border-b px-4 py-3">
            <p className="text-[0.8125rem] font-extrabold">{personName}</p>
            <p className="text-muted-light text-[0.6875rem] font-semibold">{subtitle}</p>
          </div>

          <Link
            href="/rider/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="text-muted hover:bg-bg hover:text-ink flex items-center gap-2.5 px-4 py-2.5 text-[0.8125rem] font-extrabold"
          >
            <User className="h-4 w-4" aria-hidden="true" />
            Your profile
          </Link>

          <button
            type="button"
            role="menuitem"
            disabled={going}
            onClick={async () => {
              setGoing(true);
              await signOut();
              router.push('/sign-in');
              router.refresh();
            }}
            className="border-border text-danger hover:bg-danger-bg flex w-full items-center gap-2.5 border-t px-4 py-2.5 text-left text-[0.8125rem] font-extrabold disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {going ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
