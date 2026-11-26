import { NextResponse, type NextRequest } from 'next/server';

import { AGREEMENTS_BUCKET } from '@/lib/merchant-agreement-signing';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Downloads a merchant's signed Data Processing Agreement (the current one,
 * or ?copy= an earlier one) through a link valid for a minute. Only staff
 * who may review the merchant get one: the record and storage both check.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const staff = await requireStaff();
  requireModule(staff, 'merchants');
  const back = new URL(`/merchants/${encodeURIComponent(params.id)}`, request.url);
  if (!UUID.test(params.id)) return NextResponse.redirect(new URL('/merchants', request.url));
  const client = createClient();
  const { data } = await client.rpc('rpc_merchant_dpa_read', { p_merchant_id: params.id });
  const copies =
    (
      data as unknown as {
        acceptances?: {
          id: string;
          storage_path: string | null;
          reference: string;
          current: boolean;
        }[];
      } | null
    )?.acceptances ?? [];
  const wanted = request.nextUrl.searchParams.get('copy');
  const copy = wanted ? copies.find((c) => c.id === wanted) : copies.find((c) => c.current);
  if (!copy?.storage_path) return NextResponse.redirect(back);
  const { data: link } = await client.storage
    .from(AGREEMENTS_BUCKET)
    .createSignedUrl(copy.storage_path, 60, {
      download: `NexG-Data-Processing-Agreement-${copy.reference}.pdf`,
    });
  return NextResponse.redirect(link?.signedUrl ?? back);
}
