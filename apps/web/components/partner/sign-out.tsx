'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { signOut } from '@/app/sign-in/actions';

export function SignOut() {
  const router = useRouter();
  const [going, setGoing] = React.useState(false);

  return (
    <button
      type="button"
      disabled={going}
      onClick={async () => {
        setGoing(true);
        await signOut();
        router.push('/sign-in');
        router.refresh();
      }}
      className="rounded-lg border border-white/20 px-3 py-1.5 text-[0.6875rem] font-extrabold text-white/70 transition-colors hover:border-white/50 hover:text-white disabled:opacity-40"
    >
      {going ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
