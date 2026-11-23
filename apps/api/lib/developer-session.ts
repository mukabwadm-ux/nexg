import type { Database } from '@nexg/db';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Where the developer's own sign-in stands (rpc_developer_session,
 * 20270203000500).
 *
 * A developer who belongs to a merchant is signed out after a few minutes
 * without activity, the same rule as the merchant workspace. The console
 * reports activity (a page load, a click or a key press, at most once a
 * minute) so that a busy developer is never cut off, and sends an idle one to
 * sign in again with a reason, instead of a console whose keys, webhooks and
 * merchants have quietly disappeared behind row-level security.
 *
 * "unknown" is any answer that is not a clear yes or no, such as the database
 * function not being there yet: the console then behaves as it did before,
 * and the guarded calls still decide.
 */
export type DeveloperSession =
  | { state: 'current'; expiresAt: string | null }
  | { state: 'lapsed' }
  | { state: 'unknown' };

/** Where an idle developer is sent. */
export const IDLE_SIGN_IN = '/sign-in?next=/developers&reason=idle';

export async function developerSession(
  client: SupabaseClient<Database>,
  activity: boolean,
): Promise<DeveloperSession> {
  try {
    const { data, error } = await client.rpc('rpc_developer_session', { p_activity: activity });
    if (error) return { state: 'unknown' };
    const session = data as { valid?: unknown; expires_at?: unknown } | null;
    if (session?.valid === true) {
      return {
        state: 'current',
        expiresAt: typeof session.expires_at === 'string' ? session.expires_at : null,
      };
    }
    if (session?.valid === false) return { state: 'lapsed' };
    return { state: 'unknown' };
  } catch {
    return { state: 'unknown' };
  }
}
