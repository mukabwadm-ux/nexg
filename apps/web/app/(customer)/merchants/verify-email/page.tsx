import { MerchantApplicationRecord } from '@nexg/contracts/merchant-application';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { MerchantEmailVerification } from '@/components/onboarding/merchant-email-verification';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Verify your email' };
export const dynamic = 'force-dynamic';

function Unavailable({ message }: { message: string }) {
  return (
    <main className="bg-bg flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="border-border bg-surface w-full max-w-md rounded-2xl border p-8">
        <h1 className="text-ink text-2xl font-extrabold">Email verification</h1>
        <p className="text-muted mt-3 text-sm leading-6">{message}</p>
        <Link href="/merchant" className="text-ink mt-5 inline-block font-bold underline underline-offset-4">Return to Home</Link>
      </div>
    </main>
  );
}

/** Do not attempt a conversion if Auth is configured to confirm email automatically. */
async function emailConfirmationRequired(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key }, cache: 'no-store', signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const settings = await response.json() as { mailer_autoconfirm?: boolean; external?: { email?: boolean } };
    return settings.mailer_autoconfirm === false && settings.external?.email === true;
  } catch {
    return false;
  }
}

export default async function VerifyMerchantEmail() {
  if (process.env.MERCHANT_EMAIL_OTP_ENABLED !== 'true' || !(await emailConfirmationRequired()))
    return <Unavailable message="Email verification is not available yet. Your saved application is still available from Home." />;

  const client = createClient();
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) redirect('/sign-in?role=merchant&next=%2Fmerchant');
  if (!auth.user.is_anonymous) redirect('/merchant');

  const { data: home, error: homeError } = await client.rpc('fn_partner_home');
  const partner = home as { kind?: string; id?: string } | null;
  if (homeError || partner?.kind !== 'merchant' || !partner.id)
    return <Unavailable message="We could not find your saved application. Return to Home or contact support." />;

  const rpc = client.rpc as unknown as (name: string, args: Record<string, unknown>) =>
    PromiseLike<{ data: unknown; error: unknown }>;
  const response = await rpc.call(client, 'rpc_merchant_application_read', { p_merchant_id: partner.id });
  const application = MerchantApplicationRecord.safeParse(response.data);
  if (response.error || !application.success || !application.data.review.submitted_revision || !application.data.payload.business.email)
    return <Unavailable message="Submit your registration with an email address before requesting a code." />;

  return (
    <main className="bg-bg flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-[460px]">
        <MerchantEmailVerification actorId={auth.user.id} email={application.data.payload.business.email} />
      </div>
    </main>
  );
}
