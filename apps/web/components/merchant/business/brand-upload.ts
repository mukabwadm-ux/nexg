'use client';

import { createClient } from '@/lib/supabase/client';

export type BrandImageKind = 'logo' | 'banner';

/**
 * Store a live business's logo or banner.
 *
 * The image arrives already resized and compressed to WebP by the profile
 * form (as a data URL). It goes into the public merchant-brand bucket under
 * the merchant's own folder with an opaque name, and the database is pointed
 * at its public URL. Storage policies and rpc_merchant_set_brand_image both
 * check the caller is the business's owner or a manager, so this client is
 * not the security boundary. `null` removes the image.
 */
export async function saveBrandImage(
  merchantId: string,
  kind: BrandImageKind,
  dataUrl: string | null,
): Promise<string | null> {
  const supabase = createClient();
  let url: string | null = null;

  if (dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${merchantId}/${crypto.randomUUID()}.webp`;
    const { error } = await supabase.storage
      .from('merchant-brand')
      .upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
    if (error) throw new Error('The image could not be uploaded. Try again.');
    url = supabase.storage.from('merchant-brand').getPublicUrl(path).data.publicUrl;
  }

  const { error } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>
  )('rpc_merchant_set_brand_image', { p_merchant_id: merchantId, p_kind: kind, p_url: url });
  if (error) throw new Error(error.message || 'The image could not be saved. Try again.');
  return url;
}
