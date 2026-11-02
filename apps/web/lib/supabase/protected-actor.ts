'use client';

import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { stopProtectedBrowserRequests } from './protected-request';

/** Actor events invalidate cached data; they never grant workspace authority. */
export function subscribeProtectedActor(
  client: unknown,
  actorId: string,
  onInvalid: () => void,
): () => void {
  let active = true;
  const auth = (client as { auth: { onAuthStateChange: (
    callback: (event: AuthChangeEvent, session: Session | null) => void,
  ) => { data: { subscription: { unsubscribe: () => void } } } } }).auth;
  const { data } = auth.onAuthStateChange((event, session) => {
    if (!active) return;
    if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session) || (session?.user.id && session.user.id !== actorId)) {
      active = false;
      stopProtectedBrowserRequests();
      onInvalid();
    }
  });
  return () => { active = false; data.subscription.unsubscribe(); };
}
