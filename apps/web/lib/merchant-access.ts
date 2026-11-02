/** The database owns approval, membership and Supabase session deadlines. */
export interface MerchantWorkspaceAccess {
  state: 'legacy' | 'blocked' | 'pending' | 'approved' | 'changes_requested' | 'rejected';
  setup: boolean;
  operations: boolean;
  review_state?: string | null;
  revision?: number | null;
  needs_resubmission?: boolean;
  absolute_expires_at?: string;
  idle_expires_at?: string;
  expires_at?: string;
}

export class MerchantAccessError extends Error {
  constructor(
    message: string,
    public readonly status: 403 | 503,
  ) {
    super(message);
    this.name = 'MerchantAccessError';
  }
}

export interface MerchantAccessClient {
  rpc: (
    name: string,
    args: { p_merchant_id: string },
  ) => PromiseLike<{ data: unknown; error: unknown }>;
}

export async function loadMerchantWorkspaceAccess(
  client: unknown,
  merchantId: string,
): Promise<MerchantWorkspaceAccess> {
  let result: { data: unknown; error: unknown };
  try {
    result = await (client as MerchantAccessClient).rpc(
      'rpc_merchant_workspace_access',
      { p_merchant_id: merchantId },
    );
  } catch {
    throw new MerchantAccessError('Your workspace permissions could not be checked.', 503);
  }
  const { data, error } = result;
  if (error || !data || typeof data !== 'object' || Array.isArray(data))
    throw new MerchantAccessError('Your workspace permissions could not be checked.', 503);
  const value = data as Partial<MerchantWorkspaceAccess>;
  if (
    !['legacy', 'blocked', 'pending', 'approved', 'changes_requested', 'rejected'].includes(value.state ?? '') ||
    typeof value.setup !== 'boolean' ||
    typeof value.operations !== 'boolean' ||
    (value.operations && value.state !== 'approved' && value.state !== 'legacy') ||
    ((value.state === 'blocked' || value.state === 'rejected') && value.setup) ||
    (value.revision !== undefined && value.revision !== null &&
      (!Number.isSafeInteger(value.revision) || value.revision < 1)) ||
    (value.needs_resubmission !== undefined && typeof value.needs_resubmission !== 'boolean') ||
    (value.operations && value.needs_resubmission === true) ||
    (value.state !== 'legacy' && value.operations &&
      (value.review_state !== 'approved' || !Number.isSafeInteger(value.revision) || value.needs_resubmission !== false)) ||
    (value.state !== 'legacy' && (value.setup || value.operations) &&
      (typeof value.expires_at !== 'string' || !Number.isFinite(Date.parse(value.expires_at)) ||
        Date.parse(value.expires_at) <= Date.now()))
  )
    throw new MerchantAccessError('Your workspace permissions could not be checked.', 503);
  return value as MerchantWorkspaceAccess;
}

export async function requireMerchantWorkspaceOperations(client: unknown, merchantId: string) {
  const access = await loadMerchantWorkspaceAccess(client, merchantId);
  if (!access.operations)
    throw new MerchantAccessError('Workspace approval is required to open this section.', 403);
  return access;
}
