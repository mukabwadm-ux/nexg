import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Downloads one of the merchant's signed agreements: a link valid for a
 * minute to the PDF in the private bucket. The list it is looked up in only
 * answers the merchant's own members, and storage only signs a link for a
 * copy NexG issued to them.
 */
export async function GET(request: NextRequest) {
  const merchant = request.nextUrl.searchParams.get('merchant') ?? '';
  const copy = request.nextUrl.searchParams.get('copy') ?? '';
  const back = new URL('/merchant/business?tab=documents', request.url);
  if (!UUID.test(merchant) || !UUID.test(copy)) return NextResponse.redirect(back);
  const supabase = createClient();
  const { data, error } = await supabase.rpc('rpc_merchant_agreement_signed_list', {
    p_merchant_id: merchant,
  });
  const found = (
    (data as unknown as { id: string; storage_path: string; reference: string }[] | null) ?? []
  ).find((entry) => entry.id === copy);
  if (error || !found) return NextResponse.redirect(back);
  const { data: link } = await supabase.storage
    .from('merchant-agreements')
    .createSignedUrl(found.storage_path, 60, {
      download: `NexG-Merchant-Agreement-${found.reference}.pdf`,
    });
  if (!link?.signedUrl) return NextResponse.redirect(back);
  return NextResponse.redirect(link.signedUrl);
}
