import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SignOut } from '@/components/partner/sign-out';
import { loadMerchantWorkspaceAccess } from '@/lib/merchant-access';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Your application decision | NexG',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Decision = 'rejected' | 'restricted' | 'unavailable' | 'sign-in' | 'workspace';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function currentDecision(): Promise<Decision> {
  try {
    const client = createClient();
    const auth = await client.auth.getUser();
    if (auth.error || !auth.data.user || auth.data.user.is_anonymous) return 'sign-in';
    const home = await client.rpc('fn_partner_home');
    if (home.error) return 'unavailable';
    const merchant = home.data as { kind?: string; id?: string } | null;
    if (merchant?.kind !== 'merchant' || typeof merchant.id !== 'string' || !uuid.test(merchant.id))
      return 'restricted';
    // The existing RPC checks current membership and the current Auth session.
    // No application, payout or document reads are needed for this status page.
    const access = await loadMerchantWorkspaceAccess(client, merchant.id);
    if (access.state === 'rejected') {
      const expiry = typeof access.expires_at === 'string' ? Date.parse(access.expires_at) : NaN;
      return Number.isFinite(expiry) && expiry > Date.now() ? 'rejected' : 'restricted';
    }
    if (access.setup || access.operations) return 'workspace';
    return 'restricted';
  } catch {
    return 'unavailable';
  }
}

export default async function MerchantDecisionPage() {
  const decision = await currentDecision();
  if (decision === 'sign-in') redirect('/merchants/sign-in?reason=workspace-session');
  if (decision === 'workspace') redirect('/merchant');
  const title =
    decision === 'rejected'
      ? 'Application not approved'
      : decision === 'restricted'
        ? 'Workspace access is restricted'
        : 'We could not check your application';
  const description =
    decision === 'rejected'
      ? 'Your application was not approved. Contact support if you need help with the decision.'
      : decision === 'restricted'
        ? 'We cannot open this workspace with your current access. You can sign out or contact support.'
        : 'Try checking again. If the problem continues, contact support.';

  return (
    <main className="bg-ink flex min-h-screen items-center justify-center px-6 py-12 text-white">
      <section
        className="w-full max-w-xl rounded-2xl border border-white/15 p-8"
        aria-labelledby="decision-title"
      >
        <p className="text-sm font-bold text-white/60">NexG merchant application</p>
        <h1 id="decision-title" className="mt-3 text-3xl font-extrabold">
          {title}
        </h1>
        <p className="mt-4 leading-relaxed text-white/75">{description}</p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="/help"
            prefetch={false}
            className="bg-gold text-ink rounded-lg px-4 py-2 font-bold"
          >
            Contact support
          </Link>
          <a href="/merchants/decision" className="text-sm font-bold underline underline-offset-4">
            Check again
          </a>
          <SignOut signInPage="/merchants/sign-in" />
        </div>
      </section>
    </main>
  );
}
