import {
  approvalBlocker,
  merchantApplicationReviewHandler,
} from '@/lib/merchant-application-review-http';
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
    approvalBlocker: async (merchantId, signal) => {
      const [required, documents, primary] = await Promise.all([
        client.rpc('fn_merchant_required_docs', { p_merchant_id: merchantId }).abortSignal(signal),
        client
          .from('document')
          .select('requirement_id, status')
          .eq('owner_type', 'merchant')
          .eq('owner_id', merchantId)
          .is('superseded_at', null)
          .abortSignal(signal),
        client
          .from('merchant_branch')
          .select('merchant_id', { count: 'exact', head: true })
          .eq('merchant_id', merchantId)
          .eq('is_primary', true)
          .abortSignal(signal),
      ]);
      if (required.error || documents.error || primary.error)
        throw new Error('Approval readiness could not be read.');
      return approvalBlocker(
        (required.data as { id: string; label?: string | null }[] | null) ?? [],
        (documents.data as { requirement_id: string; status: string }[] | null) ?? [],
        primary.count ?? 0,
      );
    },
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
  })(request);
}
