import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Puts an offering's photo where guests can see it.
 *
 * The Offerings editor uploads into the private merchant-offering-media
 * bucket, which only the business owner can read. The catalogue the store
 * pages read (catalogue_item.photo_path) points into catalogue-images, whose
 * read policy lets anyone see the photo of an item on a live merchant. Until
 * now nothing moved a photo from one to the other, so every photo added in
 * the editor stayed invisible on the storefront.
 *
 * This copies the file byte for byte (no resizing, so it keeps its full
 * quality) to `<merchant>/<same file name>` in catalogue-images and points the
 * catalogue item at it. It runs with the merchant's own session, so the
 * storage and row policies decide as usual. Running it again for the same
 * photo does nothing. Failures are reported, never thrown: a photo must not
 * stop an offering from saving.
 */
export async function syncOfferingPhoto(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any>,
  merchantId: string,
  itemId: string,
  sourcePath: string | null | undefined,
): Promise<{ ok: boolean; changed: boolean }> {
  if (!sourcePath || !sourcePath.startsWith(`${merchantId}/${itemId}/`)) {
    return { ok: true, changed: false };
  }
  const file = sourcePath.split('/').pop() ?? '';
  if (!/^[0-9a-f-]{36}\.(?:jpe?g|png|webp)$/i.test(file)) return { ok: false, changed: false };
  const target = `${merchantId}/${file}`;

  const { data: item } = await client
    .from('catalogue_item')
    .select('photo_path')
    .eq('id', itemId)
    .eq('merchant_id', merchantId)
    .maybeSingle();
  if (!item) return { ok: false, changed: false };
  if (item.photo_path === target) return { ok: true, changed: false };

  const { data: blob, error: readError } = await client.storage
    .from('merchant-offering-media')
    .download(sourcePath);
  if (readError || !blob) return { ok: false, changed: false };

  const extension = file.split('.').pop()!.toLowerCase();
  const contentType =
    blob.type ||
    (extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg');
  const { error: writeError } = await client.storage
    .from('catalogue-images')
    .upload(target, blob, { contentType, cacheControl: '31536000', upsert: false });
  /* Already there from an earlier, interrupted run: use it. */
  if (writeError && !/exists|duplicate/i.test(writeError.message)) {
    return { ok: false, changed: false };
  }

  const { error: pointError } = await client
    .from('catalogue_item')
    .update({ photo_path: target })
    .eq('id', itemId)
    .eq('merchant_id', merchantId);
  return { ok: !pointError, changed: !pointError };
}
