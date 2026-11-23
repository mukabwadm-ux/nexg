import { requireMerchant } from './partner';
import { MerchantAccessError } from './merchant-access';
import { createClient } from './supabase/server';

/** Page layouts do not authorize directly invoked server actions. */
export async function merchantActionClient(
  options: {
    access?: 'operations' | 'setup' | 'workspace-setup' | 'support';
    merchantId?: string;
  } = {},
): Promise<{ client: ReturnType<typeof createClient>; merchantId: string }> {
  const me = await requireMerchant({
    ...options,
    access: options.access === 'support' ? 'shell' : options.access,
  });
  const client = createClient();
  return { client, merchantId: me.id };
}

export type WorkspaceSetupLoadFailure = { ok: false; message: string; unavailable?: true };

/** A rolling schema upgrade can leave the older editor available while this RPC is missing. */
export function isMissingWorkspaceSetupRpc(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883';
}

/** Bind object-only RPC arguments to the already authorized current workspace. */
export async function requireMerchantActionObject(
  client: ReturnType<typeof createClient>,
  table:
    | 'merchant_branch'
    | 'featured_booking'
    | 'merchant_invite'
    | 'order_rating'
    | 'dispute'
    | 'merchant_promotion'
    | 'catalogue_item'
    | 'catalogue_setup_review'
    | 'merchant_import_batch'
    | 'vacancy',
  id: string,
  merchantId: string,
) {
  const { data, error } = await client
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('merchant_id', merchantId)
    .maybeSingle();
  if (error) throw new MerchantAccessError('The workspace record could not be checked.', 503);
  if (!data) throw new MerchantAccessError('This record is not in your current workspace.', 403);
}

/** A job application, through the vacancy it answers, must be the current business's. */
export async function requireMerchantApplicant(
  client: ReturnType<typeof createClient>,
  applicationId: string,
  merchantId: string,
): Promise<string> {
  const { data, error } = await client
    .from('vacancy_application')
    .select('vacancy_id')
    .eq('id', applicationId)
    .maybeSingle();
  if (error) throw new MerchantAccessError('The workspace record could not be checked.', 503);
  if (!data) throw new MerchantAccessError('This record is not in your current workspace.', 403);
  await requireMerchantActionObject(client, 'vacancy', data.vacancy_id, merchantId);
  return data.vacancy_id;
}
