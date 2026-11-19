import { merchantApplicationReviewHandler } from '@/lib/merchant-application-review-http';
import { issueSignedAgreement, issueSummary } from '@/lib/merchant-agreement-signing';
import { createClient } from '@/lib/supabase/server';
import type { ReviewRpcResult } from '@/lib/merchant-application-review-contracts';

export const runtime = 'nodejs';
/* The decision keeps its 10-second deadline; signing the agreement after it needs a little more. */
export const maxDuration = 30;
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
    // Approval no longer waits for documents or a location (approve first,
    // 20270124000100): the merchant finishes those in its dashboard, and
    // rpc_merchant_go_live refuses until they are done.
    goLive: async (merchantId, signal) => {
      const { error } = await client
        .rpc('rpc_merchant_go_live', {
          p_merchant_id: merchantId,
          p_reason: 'Application approved',
        })
        .abortSignal(signal);
      if (error) return error.message;
      // Live and hidden from Discovery means nobody can find or book it.
      const listed = await client
        .rpc('rpc_merchant_set_controls', {
          p_merchant_id: merchantId,
          p_explore_visible: true,
        })
        .abortSignal(signal);
      return listed.error
        ? `Live, but not shown in Discovery yet (${listed.error.message}).`
        : null;
    },
    issueAgreement: async (merchantId) => {
      const result = await issueSignedAgreement(client, merchantId);
      return {
        issued: result.status === 'issued' || result.status === 'signed',
        detail: issueSummary(result),
      };
    },
  })(request);
}
