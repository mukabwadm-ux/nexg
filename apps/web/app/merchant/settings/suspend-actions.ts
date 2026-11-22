'use server';

import { revalidatePath } from 'next/cache';

import { isMissingWorkspaceSetupRpc, merchantActionClient } from '@/lib/merchant-action-access';

export type SuspendResult = { ok: true; suspended: boolean } | { ok: false; message: string };

/**
 * The owner suspends or resumes their business from Settings
 * (rpc_merchant_self_suspend). Suspended: no new orders and hidden from
 * Discovery; the workspace stays open so they can resume. The database
 * checks the caller is the owner.
 */
export async function setBusinessSuspended(input: {
  suspend: boolean;
  reason?: string;
}): Promise<SuspendResult> {
  const { client, merchantId } = await merchantActionClient({ access: 'support' });
  const { error } = await client.rpc(
    'rpc_merchant_self_suspend' as never,
    {
      p_merchant_id: merchantId,
      p_suspend: Boolean(input?.suspend),
      p_reason: typeof input?.reason === 'string' ? input.reason.slice(0, 300) : null,
    } as never,
  );
  if (error) {
    return {
      ok: false,
      message: isMissingWorkspaceSetupRpc(error)
        ? 'Suspending is not available yet. Please try again later or contact support.'
        : error.message,
    };
  }
  revalidatePath('/merchant', 'layout');
  revalidatePath('/discover');
  return { ok: true, suspended: Boolean(input?.suspend) };
}
