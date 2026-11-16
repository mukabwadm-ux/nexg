'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * Log in and Sign up, or My applications once signed in.
 *
 * Read in the browser, so the careers pages stay cached and the same for
 * everybody: the server never has to ask who is looking.
 */
export function CareersAccountLinks() {
  const pathname = usePathname() ?? '/careers';
  const [signedIn, setSignedIn] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let live = true;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (live) setSignedIn(Boolean(data.session?.user && !data.session.user.is_anonymous));
      })
      .catch(() => live && setSignedIn(false));
    return () => {
      live = false;
    };
  }, []);

  const next = encodeURIComponent(pathname);

  if (signedIn === null) {
    /* Holds the space, so the bar does not jump when the answer comes. */
    return <span aria-hidden="true" className="h-9 w-[10.5rem]" />;
  }

  if (signedIn) {
    return (
      <Link
        href="/account?tab=applications"
        className="border-border-strong text-ink hover:border-ink inline-flex h-9 items-center rounded-lg border px-3.5 text-[0.8125rem] font-bold transition-colors"
      >
        My applications
      </Link>
    );
  }

  return (
    <>
      <Link
        href={`/sign-in?next=${next}`}
        className="border-border-strong text-ink hover:border-ink inline-flex h-9 items-center rounded-lg border px-3.5 text-[0.8125rem] font-bold transition-colors"
      >
        Log in
      </Link>
      <Link
        href={`/sign-up?next=${next}`}
        className="bg-gold text-ink hover:bg-gold/90 inline-flex h-9 items-center rounded-lg px-3.5 text-[0.8125rem] font-bold transition-colors"
      >
        Sign up
      </Link>
    </>
  );
}
