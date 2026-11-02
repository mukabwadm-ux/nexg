'use client';

import * as React from 'react';

import { signOutBrowser } from '@/lib/supabase/logout';

export function SignOut() {
  const [going, setGoing] = React.useState(false);
  const [error, setError] = React.useState('');

  return (
    <><button
      type="button"
      disabled={going}
      onClick={async () => {
        setGoing(true);
        setError('');
        try {
          await signOutBrowser();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Sign out could not be completed.');
          setGoing(false);
        }
      }}
      className="rounded-lg border border-white/20 px-3 py-1.5 text-[0.6875rem] font-extrabold text-white/70 transition-colors hover:border-white/50 hover:text-white disabled:opacity-40"
    >
      {going ? 'Signing out…' : 'Sign out'}
    </button>{error ? <p role="alert">{error}</p> : null}</>
  );
}
