import { notFound, redirect } from 'next/navigation';
import { MerchantApplicationRecord } from '@nexg/contracts/merchant-application';
import { ConnectedApplication } from '@/components/onboarding/connected-application';
import { createClient } from '@/lib/supabase/server';
import { loadApplicationView } from '@/lib/merchant-application-load';
import { OnboardingDemoEntry } from '@/components/onboarding/demo-entry';
import { ApplicationSessionBootstrap } from '@/components/onboarding/application-session-bootstrap';
import { MerchantRegistrationPage } from '@/components/onboarding/merchant-registration-page';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default async function Registration({
  searchParams,
}: {
  searchParams: {
    merchantId?: string;
    operationId?: string;
    /* From the register card on /merchants, carried through /merchants/apply. */
    trading_name?: string;
    contact_name?: string;
    phone?: string;
    email?: string;
    category?: string;
    town?: string;
  };
}) {
  if (process.env.MERCHANT_ONBOARDING_V1_ENABLED === 'false')
    return (
      <MerchantRegistrationPage>
        <main className="mx-auto max-w-xl p-6">
          <h2 className="text-2xl font-extrabold">Merchant onboarding</h2>
          <p className="mt-3">
            Real registration is temporarily unavailable. You can still explore the demo.
          </p>
          <OnboardingDemoEntry />
        </main>
      </MerchantRegistrationPage>
    );
  const client = createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user)
    return (
      <MerchantRegistrationPage>
        <main className="mx-auto max-w-xl p-6">
          <h2 className="text-2xl font-extrabold">Merchant onboarding</h2>
          <p className="mt-3">Start with the short form. You can secure your account from Home.</p>
          <div className="mt-5">
            <ApplicationSessionBootstrap />
          </div>
          <OnboardingDemoEntry />
        </main>
      </MerchantRegistrationPage>
    );
  if (!searchParams.merchantId && !searchParams.operationId) {
    const existing = await client.rpc('fn_partner_home');
    if (existing.error)
      return (
        <MerchantRegistrationPage>
          <main className="mx-auto max-w-xl p-6">
            <h2>We could not check your saved workspace</h2>
            <p>
              Refresh before starting another registration. Your existing records have not changed.
            </p>
            <OnboardingDemoEntry />
          </main>
        </MerchantRegistrationPage>
      );
    const home = existing.data as { kind?: string; id?: string } | null;
    if (
      !home ||
      !['guest', 'merchant', 'rider', 'host', 'staff'].includes(home.kind ?? '') ||
      (home.kind === 'merchant' && (!home.id || !uuid.test(home.id)))
    )
      return (
        <MerchantRegistrationPage>
          <main className="mx-auto max-w-xl p-6">
            <h2>We could not check your saved workspace</h2>
            <p>
              Refresh before starting another registration. Your existing records have not changed.
            </p>
            <OnboardingDemoEntry />
          </main>
        </MerchantRegistrationPage>
      );
    if (home?.kind === 'merchant' && home.id) redirect('/merchant');
  }
  let record: MerchantApplicationRecord | undefined;
  const rpc = client.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
  if (searchParams.merchantId || searchParams.operationId) {
    const id = searchParams.merchantId ?? searchParams.operationId!;
    if (!uuid.test(id)) notFound();
    const result = await rpc.call(
      client,
      searchParams.merchantId
        ? 'rpc_merchant_application_read'
        : 'rpc_merchant_application_operation_read',
      searchParams.merchantId ? { p_merchant_id: id } : { p_operation_id: id },
    );
    if (result.error)
      return (
        <MerchantRegistrationPage>
          <main className="p-6">
            <h2>We could not load your application</h2>
            <p>Your saved data has not been replaced. Refresh or contact support.</p>
          </main>
        </MerchantRegistrationPage>
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
  const prefill = saved ? undefined : prefillFrom(searchParams);
  return (
    <MerchantRegistrationPage>
      <ConnectedApplication
        key={`${data.user.id}:${saved?.record.merchant_id ?? 'new'}:${saved?.record.revision ?? 0}:${saved?.record.review.state ?? 'draft'}`}
        actorId={data.user.id}
        anonymousSession={data.user.is_anonymous}
        emailOtpEnabled={process.env.MERCHANT_EMAIL_OTP_ENABLED !== 'false'}
        initialRecord={saved?.record}
        initialPayout={saved?.payout}
        {...(prefill ? { prefill } : {})}
      />
    </MerchantRegistrationPage>
  );
}

/**
 * What the register card on /merchants already asked, in the shape the
 * registration form starts from, so nobody types it twice. Trimmed and
 * length-capped: it arrives in the URL.
 */
function prefillFrom(params: Record<string, string | undefined>) {
  const text = (value: string | undefined, max = 120) => (value ?? '').trim().slice(0, max);
  const [firstName = '', ...rest] = text(params.contact_name).split(/\s+/).filter(Boolean);
  const business = {
    name: text(params.trading_name),
    firstName,
    lastName: rest.join(' '),
    phone: text(params.phone, 20),
    email: text(params.email, 160),
  };
  const categoryId = text(params.category, 60);
  const town = text(params.town, 60);
  if (!Object.values(business).some(Boolean) && !categoryId && !town) return undefined;
  return {
    business: Object.fromEntries(Object.entries(business).filter(([, value]) => value)),
    ...(/^[a-z_]+$/.test(categoryId) ? { categoryId } : {}),
    ...(town ? { location: { town } } : {}),
  };
}
