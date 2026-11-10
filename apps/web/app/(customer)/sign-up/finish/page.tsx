import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/auth/auth-shell';
import { FinishProfile } from '@/components/auth/finish-profile';
import { safeNext } from '@/lib/auth-portals';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Finish your profile' };
export const dynamic = 'force-dynamic';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * After a first Google or Apple sign-in: confirm the name and, optionally,
 * a phone number. Google shares the name every time; Apple only on the first
 * sign-in, which is why this asks once and saves it to the account.
 */
export default async function FinishProfilePage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const next = safeNext(searchParams?.next);
  const { data } = await createClient().auth.getUser();
  const user = data.user;
  if (!user || user.is_anonymous) redirect('/sign-in');
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const full = text(meta['full_name']) || text(meta['name']);
  const [fallbackFirst = '', ...fallbackRest] = full.split(/\s+/).filter(Boolean);
  const firstName = text(meta['first_name']) || text(meta['given_name']) || fallbackFirst;
  const lastName = text(meta['last_name']) || text(meta['family_name']) || fallbackRest.join(' ');
  const relay = /@privaterelay\.appleid\.com$/i.test(user.email ?? '');
  return (
    <AuthShell portal="customer">
      <FinishProfile
        next={next}
        email={user.email ?? ''}
        privateRelay={relay}
        initialFirstName={firstName}
        initialLastName={lastName}
        initialPhone={text(meta['phone']) || null}
      />
    </AuthShell>
  );
}
