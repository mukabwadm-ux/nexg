'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  isMissingWorkspaceSetupRpc,
  merchantActionClient,
  type WorkspaceSetupLoadFailure,
} from '@/lib/merchant-action-access';

const locationSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(100),
  type: z.enum(['physical', 'service_base', 'digital_operation']),
  address: z.string().max(1000),
  contact: z.string().max(100),
  activityIds: z.array(z.string().min(1).max(100)).max(128),
  updatedAt: z.string().nullable(),
});
export type SetupLocation = z.infer<typeof locationSchema>;
type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
type SetupRpc = (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;

export async function loadSetupLocations(): Promise<
  { ok: true; locations: SetupLocation[] } | WorkspaceSetupLoadFailure
> {
  try {
    const { client, merchantId } = await merchantActionClient({ access: 'workspace-setup' });
    const rpc = client.rpc.bind(client) as unknown as SetupRpc;
    const { data, error } = await rpc('rpc_merchant_setup_locations', {
      p_merchant_id: merchantId,
    });
    if (isMissingWorkspaceSetupRpc(error))
      return {
        ok: false,
        unavailable: true,
        message: 'The setup location editor is temporarily unavailable.',
      };
    const parsed = z.array(locationSchema).safeParse(data);
    if (error || !parsed.success) return { ok: false, message: 'Could not load your locations.' };
    return { ok: true, locations: parsed.data };
  } catch {
    return { ok: false, message: 'Could not access your locations.' };
  }
}

export async function saveSetupLocation(
  input: SetupLocation,
): Promise<{ ok: true; location: SetupLocation } | { ok: false; message: string }> {
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Check the location details and try again.' };
  try {
    const { client, merchantId } = await merchantActionClient({ access: 'workspace-setup' });
    const value = parsed.data;
    const rpc = client.rpc.bind(client) as unknown as SetupRpc;
    const { data, error } = await rpc('rpc_merchant_setup_location_save', {
      p_merchant_id: merchantId,
      p_branch_id: value.id,
      p_name: value.name,
      p_place_type: value.type,
      p_address: value.address,
      p_contact: value.contact,
      p_activity_ids: value.activityIds,
      p_expected_updated_at: value.updatedAt,
    });
    if (error)
      return {
        ok: false,
        message:
          error.code === '40001'
            ? 'This location changed elsewhere. Reopen it to load the latest details.'
            : 'Could not save this location. Your changes are still open.',
      };
    const result = locationSchema.safeParse(data);
    if (!result.success)
      return {
        ok: false,
        message:
          'Location saved, but the updated details could not be read. Reopen it before editing again.',
      };
    revalidatePath('/merchant');
    revalidatePath('/merchant/stores');
    return { ok: true, location: result.data };
  } catch {
    return { ok: false, message: 'Could not save this location. Your changes are still open.' };
  }
}
