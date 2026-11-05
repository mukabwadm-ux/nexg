import { notFound } from 'next/navigation';
import { MerchantApplicationRecord } from '@nexg/contracts/merchant-application';
import { ConnectedApplication } from '@/components/onboarding/connected-application';
import { createClient } from '@/lib/supabase/server';
import { loadApplicationView } from '@/lib/merchant-application-load';
import { OnboardingDemoEntry } from '@/components/onboarding/demo-entry';
import { ApplicationSessionBootstrap } from '@/components/onboarding/application-session-bootstrap';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default async function Registration({
  searchParams,
}: {
  searchParams: { merchantId?: string; operationId?: string };
}) {
  if (process.env.MERCHANT_ONBOARDING_V1_ENABLED !== 'true')
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-extrabold">Merchant onboarding</h1>
        <p className="mt-3">
          Real registration is temporarily unavailable. You can still explore the demo.
        </p>
        <OnboardingDemoEntry />
      </main>
    );
  const client = createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user)
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-extrabold">Merchant onboarding</h1>
        <p className="mt-3">Start with the short form. You can secure your account from Home.</p>
        <div className="mt-5"><ApplicationSessionBootstrap /></div>
        <OnboardingDemoEntry />
      </main>
    );
  // Register always starts at the existing short form. Existing workspace
  // membership must not select a different application or skip onboarding.
  // Saved applications are loaded only by their explicit resume links.
  let record: MerchantApplicationRecord | undefined;
  const rpc = client.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
  const merchantId = searchParams.merchantId;
  if (merchantId || searchParams.operationId) {
    const id = merchantId ?? searchParams.operationId!;
    if (!uuid.test(id)) notFound();
    const result = await rpc.call(
      client,
      merchantId
        ? 'rpc_merchant_application_read'
        : 'rpc_merchant_application_operation_read',
      merchantId ? { p_merchant_id: id } : { p_operation_id: id },
    );
    if (result.error)
      return (
        <main className="p-6">
          <h1>We could not load your application</h1>
          <p>Your saved data has not been replaced. Refresh or contact support.</p>
        </main>
      );
    if (result.data) {
      const parsed = MerchantApplicationRecord.safeParse(result.data);
      if (!parsed.success) throw new Error('Application contract could not be loaded.');
      record = parsed.data;
    }
  }
  const saved = record
    ? await loadApplicationView(client, record.merchant_id, {
        includePayout: !data.user.is_anonymous,
      })
    : undefined;
  return (
    <ConnectedApplication
      key={`${data.user.id}:${saved?.record.merchant_id ?? 'new'}:${saved?.record.revision ?? 0}:${saved?.record.review.state ?? 'draft'}`}
      actorId={data.user.id}
      anonymousSession={data.user.is_anonymous}
      emailOtpEnabled={process.env.MERCHANT_EMAIL_OTP_ENABLED === 'true'}
      initialRecord={saved?.record}
      initialPayout={saved?.payout}
    />
  );
}
