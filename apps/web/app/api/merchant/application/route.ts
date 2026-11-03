import { applicationHandler } from '@/lib/merchant-application-http';
import { MerchantApplicationRecord } from '@nexg/contracts/merchant-application';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function route(request: Request) {
  // Check the feature gate and request shape before constructing the server
  // client. A disabled endpoint must return its safe Problem Details response
  // even when the local Supabase runtime has not been configured.
  let client: ReturnType<typeof createClient> | undefined;
  const getClient = () => (client ??= createClient());
  const rpc = async (name: string, args: Record<string, unknown>, signal: AbortSignal) => {
    const activeClient = getClient();
    const invoke = activeClient.rpc as unknown as (
      functionName: string,
      functionArgs: Record<string, unknown>,
    ) => {
      abortSignal(
        abortSignal: AbortSignal,
      ): PromiseLike<{
        data: unknown;
        error: null | { code?: string; message?: string; hint?: string };
      }>;
    };
    return await invoke.call(activeClient, name, args).abortSignal(signal);
  };
  return applicationHandler({
    enabled: process.env.MERCHANT_ONBOARDING_V1_ENABLED !== 'false',
    emailVerificationRequired: process.env.MERCHANT_EMAIL_OTP_ENABLED !== 'false',
    authenticate: async () => {
      const { data, error } = await getClient().auth.getUser();
      return {
        authenticated: !error && !!data.user,
        anonymous: !error && data.user?.is_anonymous === true,
        email: !error ? data.user?.email : null,
        emailConfirmed: !error && !!data.user?.email_confirmed_at,
      };
    },
    verifyApplicationEmail: async (merchantId, email, signal) => {
      const result = await rpc(
        'rpc_merchant_application_read',
        { p_merchant_id: merchantId },
        signal,
      );
      if (result.error) throw new Error('The saved application email could not be checked.');
      const application = MerchantApplicationRecord.safeParse(result.data);
      if (!application.success) throw new Error('The saved application contract could not be checked.');
      return application.data.payload.business.email.trim().toLowerCase() === email.trim().toLowerCase();
    },
    rpc,
  })(request);
}
export { route as GET, route as POST };
