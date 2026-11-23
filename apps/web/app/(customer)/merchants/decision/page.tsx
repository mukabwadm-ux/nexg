import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { SignOut } from '@/components/partner/sign-out';
import { switchBusiness } from '@/app/merchant/switch-business-actions';
import {
  listBusinesses,
  resolveCurrentBusiness,
  type BusinessChoice,
} from '@/lib/current-business';
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

/*
 * An owner whose current business was turned down may own another one that
 * is fine. They get a way back to it here instead of only Sign out.
 */
async function otherBusinesses(
  client: ReturnType<typeof createClient>,
  userId: string,
  currentId: string | null,
): Promise<BusinessChoice[]> {
  try {
    return (await listBusinesses(client, userId)).filter((business) => business.id !== currentId);
  } catch {
    return [];
  }
}

type Checked = {
  decision: Decision;
  others?: { client: ReturnType<typeof createClient>; userId: string; currentId: string | null };
};

async function currentDecision(): Promise<Checked> {
  try {
    const client = createClient();
    const auth = await client.auth.getUser();
    if (auth.error || !auth.data.user || auth.data.user.is_anonymous)
      return { decision: 'sign-in' };
    const userId = auth.data.user.id;
    const home = await client.rpc('fn_partner_home');
    if (home.error) return { decision: 'unavailable' };
    const merchant = home.data
      ? await resolveCurrentBusiness(
          client,
          userId,
          home.data as unknown as { kind: string; id?: string; home: string },
        )
      : null;
    const valid =
      merchant?.kind === 'merchant' && typeof merchant.id === 'string' && uuid.test(merchant.id);
    const others = { client, userId, currentId: valid ? merchant!.id! : null };
    if (!valid) return { decision: 'restricted', others };
    // The existing RPC checks current membership and the current Auth session.
    // No application, payout or document reads are needed for this status page.
    const access = await loadMerchantWorkspaceAccess(client, merchant!.id!);
    if (access.state === 'rejected') {
      const expiry = typeof access.expires_at === 'string' ? Date.parse(access.expires_at) : NaN;
      return {
        decision: Number.isFinite(expiry) && expiry > Date.now() ? 'rejected' : 'restricted',
        others,
      };
    }
    if (access.setup || access.operations) return { decision: 'workspace' };
    return { decision: 'restricted', others };
  } catch {
    return { decision: 'unavailable' };
  }
}

export default async function MerchantDecisionPage() {
  const { decision, others: who } = await currentDecision();
  if (decision === 'sign-in') redirect('/merchants/sign-in?reason=workspace-session');
  if (decision === 'workspace') redirect('/merchant');
  const others = who ? await otherBusinesses(who.client, who.userId, who.currentId) : [];
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
        {others.length > 0 ? (
          <div className="mt-6">
            <p className="text-sm font-bold text-white/60">Your other businesses</p>
            <ul className="mt-2 space-y-2">
              {others.map((business) => (
                <li key={business.id}>
                  <form action={switchBusiness}>
                    <input type="hidden" name="merchantId" value={business.id} />
                    <button
                      type="submit"
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/15 px-4 py-2.5 text-left font-bold hover:bg-white/5"
                    >
                      <span className="truncate">{business.name}</span>
                      <span className="shrink-0 text-xs text-white/60">{business.label}</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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
