/**
 * GET /v1/catalog/merchants/[id]
 *
 * Returns a single merchant and its catalogue items.
 *
 * The merchant must be live (status='live' is enforced by the view).
 * Catalogue items are filtered by the view: available items, and age_restricted
 * items only if the merchant holds a verified liquor licence.
 */
import { NextResponse } from 'next/server';
import { createPublicClient } from '@/lib/supabase';
import { jsonError } from '@/lib/http';
import { PublicMerchant, CatalogueItem, Uuid } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Validate UUID
  const idValidation = Uuid.safeParse(id);
  if (!idValidation.success) {
    return jsonError('invalid_request', 'Invalid merchant ID');
  }

  const supabase = createPublicClient();

  // Fetch merchant
  const { data: merchant, error: merchantError } = await supabase
    .from('merchant_public')
    .select('id, trading_name, category, category_other, cover_photo_path, featured, city_slug, city_name, branch_name, branch_address, branch_latitude, branch_longitude, listed_at, explore_visible, concierge_pick, accepting_orders, pay_on_delivery_enabled, pay_on_delivery_cap_kes, prep_minutes, busy_mode_until, closed_early_at, parent_merchant_id, subcategory')
    .eq('id', id)
    .maybeSingle();

  if (merchantError) {
    console.error('merchant detail error:', merchantError);
    return jsonError('internal_error', 'Failed to fetch merchant');
  }

  if (!merchant) {
    return jsonError('not_found', 'Merchant not found');
  }

  // Fetch catalogue items
  const { data: catalogue, error: catalogueError } = await supabase
    .from('catalogue_public')
    .select('id, merchant_id, section_id, name, description, price_kes, available, age_restricted, highlighted, sort')
    .eq('merchant_id', id)
    .order('sort', { ascending: true })
    .order('name', { ascending: true });

  if (catalogueError) {
    console.error('catalogue error:', catalogueError);
    return jsonError('internal_error', 'Failed to fetch catalogue');
  }

  const response = {
    ok: true,
    data: {
      merchant: PublicMerchant.parse(merchant),
      catalogue: (catalogue ?? []).map((item) => CatalogueItem.parse(item)),
    },
    meta: {
      api_version: 'v1' as const,
    },
  };

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}