import { NextResponse } from 'next/server';

import { createPublicClient } from '@/lib/supabase/public';

/**
 * A catalogue item's photo, for Discovery's store pages and cards.
 *
 * Photos sit in the private catalogue-images bucket and Discovery reads
 * Supabase from the browser with the public key only, so it cannot sign them.
 * This route signs with the public key too: the bucket's read policy
 * (catalogue_images_read) lets a visitor read only a photo that belongs to an
 * item of a live, Explore-visible merchant, so anything else is a 404 here.
 *
 * The file is served exactly as the merchant uploaded it (no resizing or
 * re-compression), at full quality. The redirect may be cached for five
 * minutes, well inside the signed link's hour.
 */

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const PATH = /^[0-9a-f-]{36}\/[A-Za-z0-9._/-]{1,200}\.(?:jpe?g|png|webp)$/i;

function missing() {
  return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(_request: Request, { params }: { params: { path: string[] } }) {
  const path = (params.path ?? []).map((part) => decodeURIComponent(part)).join('/');
  if (!PATH.test(path) || path.includes('..')) return missing();

  const { data } = await createPublicClient()
    .storage.from('catalogue-images')
    .createSignedUrl(path, 60 * 60);
  if (!data?.signedUrl) return missing();

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  });
}
