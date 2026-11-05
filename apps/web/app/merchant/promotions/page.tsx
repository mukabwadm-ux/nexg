import type { ComponentProps } from 'react';

import { LivePromotionsWorkspace } from '@/components/merchant/promotions/live-workspace';
import type { Booking, Featured } from '@/components/partner/merchant-featured';
import { requireMerchant } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Promotions' };
export const dynamic = 'force-dynamic';

function nextMonday() {
  const today = new Date(Date.now() + 3 * 3_600_000);
  today.setUTCDate(today.getUTCDate() + 7 - ((today.getUTCDay() + 6) % 7));
  return today.toISOString().slice(0, 10);
}

async function featuredRequest(
  client: ReturnType<typeof createClient>,
  merchantId: string,
  merchant: { city_id: string | null; status: string | null } | null,
  bookings: Booking[] | null,
): Promise<{ request: ComponentProps<typeof Featured> | null; requestNotice?: string }> {
  if (!merchant?.status || !bookings) {
    return {
      request: null,
      requestNotice:
        'Featured placement availability could not be checked. Reload Promotions to try again.',
    };
  }
  if (merchant.status !== 'live') {
    return {
      request: null,
      requestNotice: 'Featured placements open once your business is live and trading.',
    };
  }
  if (!merchant.city_id) {
    return {
      request: null,
      requestNotice: 'Set a business location before requesting a placement.',
    };
  }

  const [placements, eligibility] = await Promise.all([
    client
      .from('featured_placement')
      .select('id, kind, category, position, label, description, city_id')
      .eq('city_id', merchant.city_id)
      .eq('enabled', true)
      .order('kind')
      .order('position'),
    client.rpc('fn_featured_eligibility', {
      p_merchant_id: merchantId,
      p_placement_kind: 'homepage',
    }),
  ]);
  const check = eligibility.data;
  if (
    placements.error ||
    eligibility.error ||
    !check ||
    typeof check !== 'object' ||
    Array.isArray(check) ||
    typeof check.passed !== 'boolean'
  ) {
    return {
      request: null,
      requestNotice:
        'Featured placement availability could not be checked. Reload Promotions to try again.',
    };
  }

  const priced = await Promise.all(
    placements.data.map(async (placement) => {
      const { data, error } = await client.rpc('fn_featured_price', {
        p_city_id: placement.city_id,
        p_kind: placement.kind,
        ...(placement.category ? { p_category: placement.category } : {}),
      });
      return { ...placement, price_kes: error ? null : data, priceUnavailable: Boolean(error) };
    }),
  );

  return {
    request: {
      merchantId,
      status: merchant.status,
      eligibility: check,
      placements: priced,
      bookings,
      nextMonday: nextMonday(),
    },
  };
}

export default async function MerchantPromotions() {
  const merchant = await requireMerchant();
  const client = createClient();
  const [home, history] = await Promise.all([
    client
      .from('merchant_home_v')
      .select('name, status, city_id')
      .eq('merchant_id', merchant.id)
      .maybeSingle(),
    client
      .from('featured_booking')
      .select(
        'id, placement_kind, status, wanted_start, weeks, quoted_price, requested_at, start_date, end_date',
      )
      .eq('merchant_id', merchant.id)
      .order('requested_at', { ascending: false })
      .limit(30),
  ]);
  const bookings = history.error ? null : history.data;
  const controls = await featuredRequest(
    client,
    merchant.id,
    home.error ? null : home.data,
    bookings,
  );

  return (
    <LivePromotionsWorkspace
      businessName={home.data?.name ?? 'Your business'}
      bookings={bookings}
      {...controls}
    />
  );
}
