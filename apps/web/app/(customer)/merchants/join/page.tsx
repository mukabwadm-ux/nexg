import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import type { PartnerHome } from '@/lib/auth-portals';
import { acceptMerchantInvites } from '@/lib/merchant-invites';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Join a business on NexG',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

/**
 * Where a team invitation points: nexgapp.com/merchants/join.
 *
 * Signed out, it asks for a sign-in and comes back here. Signed in, it
 * accepts every open invitation for the account's confirmed email (signing
 * in already does, so this mostly matters to somebody who was signed in when
 * the invitation arrived) and opens the business. With nothing to accept it
 * says so, with the address it checked, instead of sending them somewhere
 * that looks like an error.
 */
export default async function JoinBusinessPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) redirect('/sign-in?next=%2Fmerchants%2Fjoin&reason=join');

  await acceptMerchantInvites(supabase);
  const { data } = await supabase.rpc('fn_partner_home');
  const home = (data as PartnerHome | null) ?? null;
  if (home?.kind === 'merchant' && home.home) redirect(home.home);

  return (
    <main className="mx-auto max-w-xl px-4 py-12 sm:py-16">
      <h1 className="font-display text-2xl font-bold">No team invitation for this account</h1>
      <p className="text-muted mt-3 leading-relaxed">
        You are signed in as <strong className="text-ink">{user.email}</strong>, and no business
        has an open invitation for that address. Ask the owner to invite this exact address from
        their Team page, or sign in with the address the invitation was sent to.
      </p>
      <p className="mt-6">
        <Link href="/" className="text-gold-text font-bold underline">
          Back to NexG
        </Link>
      </p>
    </main>
  );
}
