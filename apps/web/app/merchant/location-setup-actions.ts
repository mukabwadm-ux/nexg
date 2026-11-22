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
  /* "latitude, longitude" from the map pin field; '' while unpinned. */
  pin: z.string().trim().max(60).default(''),
  /* Read only: whether the pin is inside an area NexG serves. */
  inServiceArea: z.boolean().optional(),
  /* Read only: the NexG area (zone) the pin is in, if any. */
  area: z.string().nullable().optional(),
});
export type SetupLocation = z.infer<typeof locationSchema>;

/* The same "lat, lng" the pin field writes (a client module, so not imported here). */
function pinPoint(pin: string): { lat: number; lng: number } | null {
  const match = pin.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
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
    const point = pinPoint(value.pin);
    if (value.pin !== '' && !point)
      return { ok: false, message: 'That map pin is not a real place. Pin it on the map again.' };
    const rpc = client.rpc.bind(client) as unknown as SetupRpc;
    const args = {
      p_merchant_id: merchantId,
      p_branch_id: value.id,
      p_name: value.name,
      p_place_type: value.type,
      p_address: value.address,
      p_contact: value.contact,
      p_activity_ids: value.activityIds,
      p_expected_updated_at: value.updatedAt,
    };
    let { data, error } = await rpc('rpc_merchant_setup_location_save', {
      ...args,
      p_latitude: point?.lat ?? null,
      p_longitude: point?.lng ?? null,
    });
    /* Until 20270130009700 is on the database the save has no pin arguments. */
    if (error?.code === 'PGRST202')
      ({ data, error } = await rpc('rpc_merchant_setup_location_save', args));
    if (error)
      return {
        ok: false,
        message:
          error.code === '40001'
            ? 'This location changed elsewhere. Reopen it to load the latest details.'
            : error.code === '22023'
              ? error.message
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
