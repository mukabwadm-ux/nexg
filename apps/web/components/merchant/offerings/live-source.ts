'use client';

import { loadSetupOfferings, saveSetupOffering } from '@/app/merchant/offering-setup-actions';
import type { WorkspaceCatalogueRow } from '@/lib/merchant-workspace-catalogue';
import { browserUuid } from '@/lib/browser-uuid';
import { createClient } from '@/lib/supabase/client';
import { createOffering, defaultConfiguration, type Offering } from './model';
import type { OfferingsSource } from './source';

export function liveOfferingsSource({
  rows,
  primaryActivity,
  canEditDrafts,
}: {
  rows: WorkspaceCatalogueRow[];
  primaryActivity: string;
  canEditDrafts: boolean;
}) {
  let merchantId: string | undefined;
  const existingIds = new Set(rows.map((row) => row.id));
  let registeredDraftIds = new Set<string>();
  const source: OfferingsSource = {
    async load(profile) {
      const result = canEditDrafts ? await loadSetupOfferings() : null;
      if (result && !result.ok && !result.unavailable) throw new Error(result.message);
      if (result?.ok) merchantId = result.merchantId;
      const drafts = result?.ok ? result.items : [];
      registeredDraftIds = new Set(drafts.map((draft) => draft.id));
      const scopedDrafts = drafts.filter((draft) => draft.profileId === profile.id);
      const client = createClient();
      const confirmedDrafts = await Promise.all(
        scopedDrafts.map(async (draft) => {
          if (!draft.imageStoragePath) return draft;
          const { data } = await client.storage
            .from('merchant-offering-media')
            .createSignedUrl(draft.imageStoragePath, 3600);
          return data?.signedUrl ? { ...draft, image: data.signedUrl } : draft;
        }),
      );
      const existing =
        profile.id === primaryActivity
          ? rows
              .filter((row) => !registeredDraftIds.has(row.id))
              .map((row) => ({
                ...createOffering(profile, profile.schema, row.id),
                name: row.name,
                description: row.description ?? '',
                priceMode: 'fixed' as const,
                price: row.price_kes === null ? '' : String(row.price_kes),
                publication: row.available ? ('published' as const) : ('draft' as const),
                updatedAt: row.updated_at,
                image: row.image,
              }))
          : [];
      const configuration = defaultConfiguration(profile);
      configuration.enabledSchemas = [
        ...new Set([
          ...configuration.enabledSchemas,
          ...confirmedDrafts.map((draft) => draft.schemaId),
        ]),
      ];
      return {
        revision: 1,
        writable: result?.ok === true,
        configuration,
        offerings: [...confirmedDrafts, ...existing],
      };
    },
    async save(_profile, item, publication) {
      if (
        !canEditDrafts ||
        item.publication !== 'draft' ||
        (publication && publication !== 'draft')
      )
        throw new Error('This editor can save setup drafts only.');
      const result = await saveSetupOffering(item);
      if (!result.ok) throw new Error(result.message);
      registeredDraftIds.add(result.item.id);
      return { ...result.item, image: item.image };
    },
    async replace() {
      throw new Error('Bulk changes are unavailable for the saved catalogue.');
    },
    async reset() {
      throw new Error('Saved merchant data cannot be reset here.');
    },
  };
  async function uploadImage(item: Offering, file: File) {
    const extension = (
      { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>
    )[file.type];
    if (!merchantId || !extension || file.size > 2_000_000)
      throw new Error('Choose a JPG, PNG or WebP smaller than 2 MB after the catalogue loads.');
    const client = createClient();
    const bucket = client.storage.from('merchant-offering-media');
    const path = `${merchantId}/${item.id}/${browserUuid()}.${extension}`;
    const upload = await bucket.upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) throw new Error('Could not upload the photo.');
    const signed = await bucket.createSignedUrl(path, 3600);
    if (!signed.data?.signedUrl) throw new Error('Could not open the uploaded photo.');
    return { path, url: signed.data.signedUrl };
  }
  return {
    source,
    uploadImage,
    isExisting: (item: Offering) => existingIds.has(item.id) && !registeredDraftIds.has(item.id),
  };
}
