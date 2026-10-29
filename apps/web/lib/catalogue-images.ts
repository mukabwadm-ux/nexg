'use client';

import { createClient } from '@/lib/supabase/client';

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type CatalogueImageUpload =
  | { ok: true; path: string; url: string }
  | { ok: false; message: string };

export async function uploadCatalogueImage(
  merchantId: string,
  file: File,
): Promise<CatalogueImageUpload> {
  const extension = IMAGE_TYPES[file.type];
  if (!extension) return { ok: false, message: 'Choose a JPEG, PNG, or WebP image.' };
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, message: 'Choose an image smaller than 5 MB.' };
  }

  const path = `${merchantId}/${crypto.randomUUID()}.${extension}`;
  const storage = createClient().storage.from('catalogue-images');
  const { error } = await storage.upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) return { ok: false, message: error.message };

  const { data: signed, error: signedError } = await storage.createSignedUrl(path, 60 * 60);
  if (signedError || !signed) {
    return {
      ok: false,
      message: signedError?.message ?? 'The photo uploaded but its preview could not be opened.',
    };
  }

  return {
    ok: true,
    path,
    url: signed.signedUrl,
  };
}
