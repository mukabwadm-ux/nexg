import { NextResponse } from 'next/server';

import { PROMO_MEDIA_BUCKET } from '@/lib/promo-media';
import { createPublicClient } from '@/lib/supabase/public';

/**
 * A running promotion's picture, video or video still, for a store's banner in
 * Discovery (discovery/src/components/storefronts/PromotionBanner.tsx).
 *
 * The files sit in the private promo-media bucket, and Discovery reads
 * Supabase from the browser with GETs and the public key only, so it cannot
 * sign them. This route looks the creative up in promotion_banner_v (a running
 * promotion, approved media, a live merchant) and redirects to a link signed
 * for an hour. Anything else is a 404, so a paused or ended promotion's files
 * stop being reachable here at once. The redirect may be cached for five
 * minutes, well inside the link's hour.
 */

export const dynamic = 'force-dynamic';
/* The view's answer must be live: Next 14 would otherwise keep supabase-js's
   fetch in the Data Cache with no expiry (lib/supabase/public.ts). */
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function missing() {
  return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(
  _request: Request,
  { params }: { params: { creativeId: string; file: string } },
) {
  const id = params.creativeId.toLowerCase();
  if (!UUID.test(id) || (params.file !== 'media' && params.file !== 'poster')) return missing();

  const supabase = createPublicClient();
  const { data } = await supabase
    .from('promotion_banner_v')
    .select('media_path, poster_path')
    .eq('creative_id', id)
    .maybeSingle();
  const path = params.file === 'media' ? data?.media_path : data?.poster_path;
  if (!path) return missing();

  const { data: signed } = await supabase.storage
    .from(PROMO_MEDIA_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (!signed?.signedUrl) return missing();

  return NextResponse.redirect(signed.signedUrl, {
    status: 302,
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  });
}
