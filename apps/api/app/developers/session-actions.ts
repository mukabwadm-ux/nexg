'use server';

import { developerSession } from '@/lib/developer-session';
import { createClient } from '@/lib/session';

export interface SessionCheck {
  /** The sign-in has lapsed: send the developer to sign in again. */
  lapsed: boolean;
  /** When it lapses without further activity, or null when nothing binds it. */
  expiresAt: string | null;
}

/**
 * The console's heartbeat. With `activity` it reports that the developer is
 * using the console (a click or key press, at most once a minute); without,
 * it only asks whether the sign-in is still current, as the deadline passes.
 * A lapsed sign-in is ended here, this one only (scope "local": the
 * developer's other sign-ins, such as their merchant workspace, stay).
 */
export async function keepDeveloperSession(activity: boolean): Promise<SessionCheck> {
  const supabase = createClient();
  const session = await developerSession(supabase, activity === true);
  if (session.state === 'lapsed') {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    return { lapsed: true, expiresAt: null };
  }
  return { lapsed: false, expiresAt: session.state === 'current' ? session.expiresAt : null };
}
