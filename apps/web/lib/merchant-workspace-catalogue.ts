import 'server-only';

import { loadApplicationView } from '@/lib/merchant-application-load';
import type { AuthorizedMerchant } from '@/lib/partner';
import type { createClient } from '@/lib/supabase/server';
import { profiles } from '@/components/merchant/offerings/model';

export type WorkspaceCatalogueRow = {
  id: string;
  name: string;
  description: string | null;
  price_kes: number | null;
  available: boolean;
  updated_at: string;
  image?: string;
};

export async function loadWorkspaceCatalogue(
  client: ReturnType<typeof createClient>,
  merchant: AuthorizedMerchant,
) {
  const [identity, catalogue] = await Promise.all([
    client.from('merchant').select('subcategory').eq('id', merchant.id).single(),
    client
      .from('catalogue_item')
      .select('id,name,description,price_kes,available,updated_at,photo_path')
      .eq('merchant_id', merchant.id)
      .order('sort'),
  ]);
  if (identity.error || catalogue.error)
    throw new Error('Your saved catalogue could not be loaded.');

  const selected =
    merchant.access.state !== 'legacy' && merchant.access.setup
      ? (await loadApplicationView(client, merchant.id, { includePayout: false })).record.payload
          .subcategories
      : [identity.data.subcategory].filter((id): id is string => Boolean(id));
  const activities = selected.flatMap((id) => {
    const profile = profiles.find((entry) => entry.id === id);
    return profile ? [{ id: profile.id, name: profile.name }] : [];
  });
  const paths = catalogue.data.flatMap((row) => (row.photo_path ? [row.photo_path] : []));
  const signed = paths.length
    ? await client.storage.from('catalogue-images').createSignedUrls(paths, 3600)
    : null;
  const images = new Map(
    (signed?.data ?? []).flatMap((entry) =>
      entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl] as const] : [],
    ),
  );
  const rows: WorkspaceCatalogueRow[] = catalogue.data.map(({ photo_path, ...row }) => ({
    ...row,
    image: photo_path ? images.get(photo_path) : undefined,
  }));
  return {
    activities,
    rows,
    canEditDrafts: merchant.access.state !== 'legacy' && merchant.access.setup,
  };
}
