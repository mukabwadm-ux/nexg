import { merchantApplicationReviewHandler } from '@/lib/merchant-application-review-http';
import { createClient } from '@/lib/supabase/server';
import type { ReviewRpcResult } from '@/lib/merchant-application-review-contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  // Client creation stays inside the bounded handler's authentication step so
  // a missing environment returns a private safe problem instead of a throw.
  let client: ReturnType<typeof createClient>;
  return merchantApplicationReviewHandler({
    authenticate: async () => {
      client = createClient();
      const { data, error } = await client.auth.getUser();
      return !error && data.user && !data.user.is_anonymous ? data.user.id : null;
    },
    rpc: async (name, args, signal) => {
      const rpc = client.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => {
        abortSignal(signal: AbortSignal): PromiseLike<ReviewRpcResult>;
      };
      return await rpc.call(client, name, args).abortSignal(signal);
    },
  })(request);
}
