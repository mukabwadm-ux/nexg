'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Json } from '@nexg/db';
import {
  isMissingWorkspaceSetupRpc,
  merchantActionClient,
  type WorkspaceSetupLoadFailure,
} from '@/lib/merchant-action-access';
import {
  availableSchemas,
  createOffering,
  profiles,
  validateOffering,
  type Offering,
} from '@/components/merchant/offerings/model';
import { schemas } from '@/components/merchant/offerings/schemas';

const draftSchema = z
  .object({
    id: z.string().uuid(),
    profileId: z.string().min(1).max(100),
    schemaId: z.string().min(1).max(100),
    name: z.string().min(1).max(150),
    description: z.string().max(400),
    price: z.string().max(30),
    priceMode: z.enum(['fixed', 'unit', 'quote', 'enquiry']),
    unit: z.string().max(100),
    publication: z.literal('draft'),
    version: z.number().int().min(0).max(99999999),
    fields: z.record(z.union([z.string(), z.number()])),
    attributes: z.record(z.unknown()),
    resources: z.array(z.string()),
    availabilityLinked: z.boolean(),
    sources: z.object({
      details: z.enum(['nexg', 'external']),
      price: z.enum(['nexg', 'external']),
      availability: z.enum(['nexg', 'external']),
    }),
    sync: z.enum(['current', 'stale', 'offline', 'pending']),
    updatedAt: z.string(),
    history: z.array(z.object({ at: z.string(), action: z.string(), version: z.number().int() })),
    variants: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          sku: z.string(),
          price: z.string(),
          stock: z.number().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const legacySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  price: z.string(),
  available: z.boolean(),
  updatedAt: z.string(),
  live: z.boolean(),
});
export type LegacyOffering = z.infer<typeof legacySchema>;

export async function loadLegacySetupOfferings(): Promise<
  { ok: true; items: LegacyOffering[] } | { ok: false; message: string }
> {
  try {
    const { client, merchantId } = await merchantActionClient({ access: 'workspace-setup' });
    const { data, error } = await client.rpc('rpc_merchant_setup_legacy_offerings', {
      p_merchant_id: merchantId,
    });
    const parsed = z.array(legacySchema).safeParse(data);
    if (error || !parsed.success)
      return { ok: false, message: 'Could not load existing catalogue entries.' };
    return { ok: true, items: parsed.data };
  } catch {
    return { ok: false, message: 'Could not access existing catalogue entries.' };
  }
}

export async function adoptLegacySetupOffering(
  itemId: string,
  updatedAt: string,
  profileId: string,
): Promise<{ ok: true; item: Offering } | { ok: false; message: string }> {
  try {
    if (
      !z.string().uuid().safeParse(itemId).success ||
      !z.string().datetime({ offset: true }).safeParse(updatedAt).success
    )
      return { ok: false, message: 'Reload the catalogue before opening this offering.' };
    const profile = profiles.find((entry) => entry.id === profileId);
    if (!profile) return { ok: false, message: 'Choose a business activity for this offering.' };
    const item = createOffering(profile, profile.schema, itemId);
    const schema = schemas[profile.schema];
    if (schema?.priceModes.includes('fixed')) item.priceMode = 'fixed';
    else if (schema?.priceModes.includes('unit')) item.priceMode = 'unit';
    const { client, merchantId } = await merchantActionClient({ access: 'workspace-setup' });
    const { data, error } = await client.rpc('rpc_merchant_setup_adopt_offering', {
      p_merchant_id: merchantId,
      p_item_id: itemId,
      p_expected_updated_at: updatedAt,
      p_data: item as unknown as Json,
    });
    if (error || !data)
      return { ok: false, message: error?.message ?? 'Could not open this catalogue entry.' };
    const parsed = draftSchema.safeParse(data);
    if (!parsed.success) return { ok: false, message: 'This offering uses an unsupported format.' };
    return { ok: true, item: parsed.data as Offering };
  } catch {
    return { ok: false, message: 'Could not open this catalogue entry.' };
  }
}

export async function loadSetupOfferings(): Promise<
  { ok: true; merchantId: string; items: Offering[] } | WorkspaceSetupLoadFailure
> {
  try {
    const { client, merchantId } = await merchantActionClient({ access: 'workspace-setup' });
    const { data, error } = await client.rpc('rpc_merchant_setup_offerings', {
      p_merchant_id: merchantId,
    });
    if (isMissingWorkspaceSetupRpc(error))
      return {
        ok: false,
        unavailable: true,
        message: 'The setup offerings editor is temporarily unavailable.',
      };
    if (error || !Array.isArray(data))
      return { ok: false, message: 'Could not load your saved offering drafts.' };
    for (const value of data) {
      const parsed = draftSchema.safeParse(value);
      const profile = parsed.success
        ? profiles.find((entry) => entry.id === parsed.data.profileId)
        : undefined;
      if (!parsed.success || !profile || !availableSchemas(profile).includes(parsed.data.schemaId))
        return {
          ok: false,
          message:
            'A saved offering uses an unsupported format. Contact support before changing it.',
        };
    }
    /* The draft rows always say "draft"; whether guests can order an
       offering is its catalogue item's `available`, which Publish sets. */
    const items = data as Offering[];
    const { data: live } = items.length
      ? await client
          .from('catalogue_item')
          .select('id')
          .eq('merchant_id', merchantId)
          .eq('available', true)
          .in(
            'id',
            items.map((item) => item.id),
          )
      : { data: [] as { id: string }[] };
    const published = new Set((live ?? []).map((row) => row.id));
    return {
      ok: true,
      merchantId,
      items: items.map((item) =>
        published.has(item.id) ? { ...item, publication: 'published' as const } : item,
      ),
    };
  } catch {
    return { ok: false, message: 'Could not access your saved offering drafts.' };
  }
}

/**
 * Saves an offering from the setup editor and publishes or unpublishes it.
 *
 * The details are always saved through the setup draft (the same checks as
 * Save draft); publishing then switches its catalogue item on, the same
 * switch the menu page uses. A published item is switched off for the save,
 * because the draft save only edits hidden items, and back on after it, so a
 * failed save leaves it as it was.
 */
export async function saveSetupOfferingPublication(
  input: Offering,
  publish: boolean,
): Promise<{ ok: true; item: Offering } | { ok: false; message: string }> {
  try {
    const { client, merchantId } = await merchantActionClient({ access: 'workspace-setup' });
    const profile = profiles.find((entry) => entry.id === input.profileId);
    if (publish && profile) {
      const issues = validateOffering({ ...input, publication: 'published' }, true, profile);
      if (issues.length) return { ok: false, message: issues[0]!.message };
    }
    const { data: current } = await client
      .from('catalogue_item')
      .select('available')
      .eq('id', input.id)
      .eq('merchant_id', merchantId)
      .maybeSingle();
    const wasLive = current?.available === true;
    const setAvailable = async (available: boolean) => {
      const { data, error } = await client
        .from('catalogue_item')
        .update({ available })
        .eq('id', input.id)
        .eq('merchant_id', merchantId)
        .select('id')
        .maybeSingle();
      return !error && Boolean(data);
    };

    if (wasLive && !(await setAvailable(false)))
      return { ok: false, message: 'Could not update this offering. Please try again.' };
    const saved = await saveSetupOffering({ ...input, publication: 'draft' });
    if (!saved.ok) {
      if (wasLive) await setAvailable(true);
      return saved;
    }
    if (publish && !(await setAvailable(true)))
      return {
        ok: false,
        message: 'Saved as a draft, but it could not be published. Try Publish again.',
      };
    revalidatePath('/merchant');
    revalidatePath('/merchant/menu');
    return {
      ok: true,
      item: { ...saved.item, publication: publish ? 'published' : 'draft' },
    };
  } catch {
    return { ok: false, message: 'Could not save this offering. Your changes are still open.' };
  }
}

export async function saveSetupOffering(
  input: Offering,
): Promise<{ ok: true; item: Offering } | { ok: false; message: string }> {
  try {
    // Signed URLs are temporary bearer credentials: save only the private object path.
    const persistable = { ...input };
    delete persistable.image;
    const parsed = draftSchema.safeParse(persistable);
    if (!parsed.success || JSON.stringify(persistable).length > 100000)
      return { ok: false, message: 'Check the offering details and try again.' };
    const item = parsed.data as Offering;
    const profile = profiles.find((entry) => entry.id === item.profileId);
    if (!profile || !availableSchemas(profile).includes(item.schemaId))
      return { ok: false, message: 'Choose an offering type for your selected activity.' };
    const issues = validateOffering(item, false, profile);
    if (issues.length) return { ok: false, message: issues[0]!.message };
    const { client, merchantId } = await merchantActionClient({ access: 'workspace-setup' });
    if (item.imageStoragePath && !item.imageStoragePath.startsWith(`${merchantId}/${item.id}/`))
      return { ok: false, message: 'The photo does not belong to this offering.' };
    const { data, error } = await client.rpc('rpc_merchant_setup_offering_save', {
      p_merchant_id: merchantId,
      p_data: item as unknown as Json,
    });
    if (error || !data)
      return { ok: false, message: error?.message ?? 'Could not save this offering.' };
    revalidatePath('/merchant');
    return { ok: true, item: data as Offering };
  } catch {
    return { ok: false, message: 'Could not save this offering. Your changes are still open.' };
  }
}
