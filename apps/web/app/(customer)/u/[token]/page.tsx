import type { Metadata } from 'next';

import { createPublicClient } from '@/lib/supabase/public';

import { StopForm } from './stop-form';

export const metadata: Metadata = {
  title: 'Stop NexG marketing messages',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type Untyped = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/**
 * The opt-out link in every NexG marketing message. Opening it changes
 * nothing (mail scanners open links); the button does. Order, stay and
 * account messages keep coming: they are not marketing.
 */
export default async function UnsubscribePage({ params }: { params: { token: string } }) {
  const token = /^[0-9a-f]{20}$/.test(params.token) ? params.token : null;
  let state: 'unknown' | 'ready' | 'done' = 'unknown';
  if (token) {
    const db = createPublicClient() as unknown as Untyped;
    const { data } = await db.rpc('rpc_comms_unsubscribe_lookup', { p_token: token });
    const r = (data ?? {}) as { ok?: boolean; used?: boolean };
    state = r.ok ? (r.used ? 'done' : 'ready') : 'unknown';
  }
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-[36rem] flex-col justify-center px-4 py-16 text-center">
      <h1 className="text-balance text-[clamp(1.75rem,5vw,2.25rem)] font-extrabold leading-tight tracking-[-0.02em]">
        {state === 'done'
          ? 'You will not get NexG marketing any more'
          : 'Stop NexG marketing messages'}
      </h1>
      {state === 'unknown' ? (
        <p className="text-page-muted mt-4 text-base font-semibold leading-relaxed">
          We could not read that link. Reply to any NexG message or write to info@nexgapp.com and we
          will stop marketing to you.
        </p>
      ) : state === 'done' ? (
        <p className="text-page-muted mt-4 text-base font-semibold leading-relaxed">
          Your choice is saved. You will still get messages about your own orders, stays and
          account.
        </p>
      ) : (
        token && <StopForm token={token} />
      )}
    </main>
  );
}
