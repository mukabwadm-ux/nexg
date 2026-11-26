/*
 * Deleting the signed-in customer's account from the website, in the same
 * order as the app: first the businesses they booked through NexG forget the
 * name reserved under (POST /api/public/booking/forget; anything it misses is
 * queued and retried daily), then the database deletes the account
 * (rpc_my_account_deletion_request), then the browser drops its session.
 */

export interface DeletionClient {
  auth: {
    getSession(): Promise<{ data: { session: { access_token: string } | null } }>;
    signOut(options: { scope: 'local' }): Promise<unknown>;
  };
  rpc(fn: string): PromiseLike<{ error: { code?: string; message: string } | null }>;
}

export type DeletionResult = { ok: true } | { ok: false; message: string };

export async function deleteMyAccount(
  supabase: DeletionClient,
  send: (url: string, init: RequestInit) => Promise<unknown> = (url, init) => fetch(url, init),
): Promise<DeletionResult> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { ok: false, message: 'Sign in again, then delete your account.' };

  try {
    await send('/api/public/booking/forget', {
      method: 'POST',
      headers: { authorization: `Bearer ${data.session.access_token}` },
    });
  } catch {
    // The database queues these when the account goes, and a daily job retries.
  }

  const { error } = await supabase.rpc('rpc_my_account_deletion_request');
  if (error) {
    // 23514: something has to finish first, and the message says what.
    return {
      ok: false,
      message:
        error.code === '23514'
          ? error.message
          : 'Your account could not be deleted. Try again, or email us and we will delete it.',
    };
  }

  // The account is gone; only this browser's cookie is left to clear.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  return { ok: true };
}
