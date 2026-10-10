'use client';

import { ChevronDown, LogOut, Settings as SettingsIcon, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { signOut } from '@/app/sign-in/actions';

/**
 * The account button, and the way out.
 *
 * Sign out was already in the top bar and nobody could see it:
 * it was styled for the dark sidebar — `text-white/70` on
 * `border-white/20` — and rendered on the light `bg-surface`
 * header, so it was white text on a near-white strip. Present,
 * invisible, and reported as missing, which is fair.
 *
 * It is a menu now, the way the artboard draws it, so the one
 * control everybody eventually needs is where they look for it
 * rather than hidden in the chrome.
 */
export function AccountMenu({
  personName,
  role,
  businessName,
  live,
}: {
  personName: string;
  role: string;
  businessName: string;
  live: boolean;
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
      .toUpperCase() || 'ME';

  /* Close on a click anywhere else, and on Escape. A menu that
     only closes by pressing its own button is one people leave
     open and then click through. */
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
            {role} · {businessName}
            {live ? '' : ' · setup'}
          </span>
        </span>
        <ChevronDown
          className={`text-muted-light h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
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
            <p className="text-muted-light text-[0.6875rem] font-semibold">
              {role} · {businessName}
            </p>
          </div>

          <Link
            href="/merchant/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="text-muted hover:bg-bg hover:text-ink flex items-center gap-2.5 px-4 py-2.5 text-[0.8125rem] font-extrabold"
          >
            <SettingsIcon className="h-4 w-4" aria-hidden="true" />
            Settings
          </Link>
          <Link
            href="/merchant/team"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="text-muted hover:bg-bg hover:text-ink flex items-center gap-2.5 px-4 py-2.5 text-[0.8125rem] font-extrabold"
          >
            <User className="h-4 w-4" aria-hidden="true" />
            Your team
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
