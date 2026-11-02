import { applicationHandler } from '@/lib/merchant-application-http';
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
  return applicationHandler({
    enabled: process.env.MERCHANT_ONBOARDING_V1_ENABLED === 'true',
    authenticate: async () => {
      const { data, error } = await getClient().auth.getUser();
      return {
        authenticated: !error && !!data.user,
        anonymous: !error && data.user?.is_anonymous === true,
      };
    },
    rpc: async (name, args, signal) => {
      // Additive RPC types are checked in their versioned contract until the
      // deployment's generated types can be regenerated from that real schema.
      const activeClient = getClient();
      const rpc = activeClient.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => {
        abortSignal(
          signal: AbortSignal,
        ): PromiseLike<{
          data: unknown;
          error: null | { code?: string; message?: string; hint?: string };
        }>;
      };
      return await rpc.call(activeClient, name, args).abortSignal(signal);
    },
  })(request);
}
export { route as GET, route as POST };
