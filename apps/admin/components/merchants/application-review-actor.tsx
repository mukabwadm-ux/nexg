'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { createClient } from '@/lib/supabase/client';

/** Private application content is removed when this browser no longer has its requesting actor. */
export function ApplicationReviewActor({
  actorId,
  children,
}: {
  actorId: string;
  children: ReactNode;
}) {
  const [session, setSession] = useState<{
    actorId: string;
    state: 'checking' | 'ready' | 'ended';
  }>({ actorId, state: 'checking' });
  const state = session.actorId === actorId ? session.state : 'checking';
  useEffect(() => {
    let active = true;
    let ended = false;
    const client = createClient();
    const end = () => {
      ended = true;
      if (active) setSession({ actorId, state: 'ended' });
    };
    const deadline = setTimeout(end, 10_000);
    const check = async () => {
      try {
        const result = await client.auth.getUser();
        if (!active || ended) return;
        if (result.error || result.data.user?.id !== actorId || result.data.user.is_anonymous)
          end();
        else setSession({ actorId, state: 'ready' });
        clearTimeout(deadline);
      } catch {
        if (active) end();
      }
    };
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (!session || session.user.id !== actorId || session.user.is_anonymous) end();
    });
    const focus = () => {
      void check();
    };
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) end();
    };
    window.addEventListener('focus', focus);
    window.addEventListener('pageshow', restored);
    window.addEventListener('merchant-application-review-access-ended', end);
    void check();
    return () => {
      active = false;
      clearTimeout(deadline);
      listener.subscription.unsubscribe();
      window.removeEventListener('focus', focus);
      window.removeEventListener('pageshow', restored);
      window.removeEventListener('merchant-application-review-access-ended', end);
    };
  }, [actorId]);
  if (state === 'ready') return children;
  return (
    <main className="bg-bg min-h-dvh p-6 sm:p-8">
      <p role="status" className="text-sm font-semibold">
        {state === 'checking'
          ? 'Checking your current staff session…'
          : 'This application view is closed. Reload with your current staff account.'}
      </p>
      {state === 'ended' && (
        <a
          href="/merchants/applications"
          className="text-gold-text mt-4 inline-flex min-h-11 items-center text-sm font-bold underline"
        >
          Reload applications
        </a>
      )}
    </main>
  );
}
