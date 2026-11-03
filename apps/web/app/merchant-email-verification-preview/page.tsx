import type { ReactNode } from 'react';
import { MerchantApplicationRecord } from '@nexg/contracts/merchant-application';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EmailVerificationCard } from '@/components/onboarding/email-verification-card';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Email verification preview' };
export const dynamic = 'force-dynamic';

/** Read only the current owner's application; a preview must never change an account. */
async function currentApplicationEmail(): Promise<string | null> {
  try {
    const client = createClient();
    const { data: auth, error } = await client.auth.getUser();
    if (error || !auth.user) return null;
    const { data: home, error: homeError } = await client.rpc('fn_partner_home');
    const partner = home as { kind?: string; id?: string } | null;
    if (homeError || partner?.kind !== 'merchant' || !partner.id) return null;
    const rpc = client.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: unknown }>;
    const application = await rpc.call(client, 'rpc_merchant_application_read', {
      p_merchant_id: partner.id,
    });
    if (application.error) return null;
    const parsed = MerchantApplicationRecord.safeParse(application.data);
    return parsed.success ? parsed.data.payload.business.email || null : null;
  } catch {
    return null;
  }
}

export default async function MerchantEmailVerificationPreview(): Promise<ReactNode> {
  if (process.env.NODE_ENV !== 'development') notFound();
  const savedEmail = await currentApplicationEmail();
  const email = savedEmail ?? 'hello@yourbusiness.com';

  return (
    <main className="bg-bg flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-[460px]">
        <div
          className="border-border bg-surface mb-4 rounded-xl border px-4 py-3 text-xs leading-5"
          role="note"
        >
          <strong className="text-ink block">Design preview</strong>
          <span className="text-muted">No verification email is sent or checked here.</span>
        </div>
        <EmailVerificationCard email={email} preview />
        <div className="text-muted-light mt-5 text-center text-xs leading-5">
          <p>
            {savedEmail
              ? 'Showing the email from your saved application.'
              : 'Showing an example email. The finished step will use the email from onboarding.'}
          </p>
          <Link
            href="/merchants/register"
            className="text-ink hover:text-gold-text mt-2 inline-block font-bold underline underline-offset-4"
          >
            Back to onboarding
          </Link>
        </div>
      </div>
    </main>
  );
}
