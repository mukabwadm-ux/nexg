import type { ComponentProps } from 'react';

import { categoryLabel } from '@/components/explore/merchant-card';
import type { SavedCard } from '@/components/merchant/promotions/creative-composer';
import { LivePromotionsWorkspace } from '@/components/merchant/promotions/live-workspace';
import type {
  PromotionMedia,
  PromotionRow,
} from '@/components/merchant/promotions/promotion-manager';
import type { Booking, Featured } from '@/components/partner/merchant-featured';
import { requireMerchant } from '@/lib/partner';
import { signMedia } from '@/lib/promo-media-server';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Promotions' };
export const dynamic = 'force-dynamic';

/* Long enough to preview and send without the links lapsing. */
const SIGNED_FOR = 60 * 60;

function nextMonday() {
  const today = new Date(Date.now() + 3 * 3_600_000);
  today.setUTCDate(today.getUTCDate() + 7 - ((today.getUTCDay() + 6) % 7));
  return today.toISOString().slice(0, 10);
}

type Client = ReturnType<typeof createClient>;

interface CreativeRow {
  id: string;
  booking_id: string;
  status: string;
  version: number;
  blurb: string | null;
  rejection_reason: string | null;
  media_kind: string | null;
  media_path: string | null;
  poster_path: string | null;
}

/**
 * The newest homepage card sent for the open placement, with its media
 * signed for showing, and whether an approved card is still up meanwhile.
 */
async function openCard(
  client: Client,
  booking: Booking | undefined,
): Promise<{ card: SavedCard | null; approvedCardUp: boolean }> {
  if (!booking || booking.placement_kind !== 'homepage')
    return { card: null, approvedCardUp: false };
  const { data } = await client
    .from('featured_creative')
    .select(
      'id, booking_id, status, version, blurb, rejection_reason, media_kind, media_path, poster_path',
    )
    .eq('booking_id', booking.id)
    .in('status', ['draft', 'pending_review', 'approved', 'rejected'])
    .order('version', { ascending: false })
    .limit(4);
  const rows = (data ?? []) as CreativeRow[];
  const latest = rows[0];
  if (!latest) return { card: null, approvedCardUp: false };
  const signed = await signMedia(client, [latest.media_path, latest.poster_path], SIGNED_FOR);
  const src = latest.media_path ? signed[latest.media_path] : undefined;
  return {
    card: {
      creativeId: latest.id,
      status: latest.status as SavedCard['status'],
      blurb: latest.blurb,
      rejectionReason: latest.rejection_reason,
      media:
        latest.media_path && src && (latest.media_kind === 'image' || latest.media_kind === 'video')
          ? {
              kind: latest.media_kind,
              src,
              poster: latest.poster_path ? (signed[latest.poster_path] ?? null) : null,
              path: latest.media_path,
              posterPath: latest.poster_path,
            }
          : null,
    },
    approvedCardUp: latest.status !== 'approved' && rows.some((row) => row.status === 'approved'),
  };
}

async function featuredRequest(
  client: Client,
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

  const openBooking = bookings.find((b) =>
    ['requested', 'quoted', 'waitlisted', 'booked', 'live'].includes(b.status),
  );

  const [placements, eligibility, products, publicRow, rule, card] = await Promise.all([
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
    /* What a Best sellers slot can promote: available, priced products. */
    client
      .from('catalogue_item')
      .select('id, name, price_kes')
      .eq('merchant_id', merchantId)
      .eq('available', true)
      .not('price_kes', 'is', null)
      .order('name')
      .limit(200),
    /* The merchant as the homepage card shows them, for the preview. */
    client
      .from('merchant_public')
      .select('trading_name, category, branch_name, cover_photo_path, prep_minutes')
      .eq('id', merchantId)
      .maybeSingle(),
    client.from('featured_rule').select('value').eq('key', 'creative.banned_terms').maybeSingle(),
    openCard(client, openBooking),
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

  const shown = publicRow.data;
  const banned = Array.isArray(rule.data?.value)
    ? (rule.data.value as unknown[]).filter((term): term is string => typeof term === 'string')
    : [];

  return {
    request: {
      merchantId,
      status: merchant.status,
      eligibility: check,
      placements: priced,
      bookings,
      nextMonday: nextMonday(),
      products: (products.data ?? []).flatMap((product) =>
        product.price_kes === null
          ? []
          : [{ id: product.id, name: product.name, price_kes: product.price_kes }],
      ),
      subject: shown?.trading_name
        ? {
            name: shown.trading_name,
            category: shown.category,
            branchName: shown.branch_name,
            coverPhoto: shown.cover_photo_path,
            prepMinutes: shown.prep_minutes,
          }
        : null,
      bannedTerms: banned,
      card: card.card,
      approvedCardUp: card.approvedCardUp,
    },
  };
}

interface PromotionCreativeRow {
  id: string;
  promotion_id: string;
  status: string;
  rejection_reason: string | null;
  media_kind: string;
  media_path: string;
  poster_path: string | null;
  updated_at: string;
}

/** Each promotion's newest picture, and its approved one when that differs, signed for showing. */
async function promotionMedia(
  client: Client,
  merchantId: string,
): Promise<Record<string, PromotionMedia>> {
  const { data, error } = await client
    .from('merchant_promotion_creative')
    .select(
      'id, promotion_id, status, rejection_reason, media_kind, media_path, poster_path, updated_at',
    )
    .eq('merchant_id', merchantId)
    .in('status', ['pending_review', 'approved', 'rejected'])
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error || !data) return {};
  const rows = data as PromotionCreativeRow[];
  const signed = await signMedia(
    client,
    rows.flatMap((row) => [row.media_path, row.poster_path]),
    SIGNED_FOR,
  );
  const out: Record<string, PromotionMedia> = {};
  for (const row of rows) {
    if (out[row.promotion_id]) {
      if (row.status === 'approved') out[row.promotion_id]!.approvedUp = true;
      continue;
    }
    const src = signed[row.media_path];
    out[row.promotion_id] = {
      status: row.status as PromotionMedia['status'],
      rejectionReason: row.rejection_reason,
      approvedUp: false,
      media:
        src && (row.media_kind === 'image' || row.media_kind === 'video')
          ? {
              kind: row.media_kind,
              src,
              poster: row.poster_path ? (signed[row.poster_path] ?? null) : null,
              path: row.media_path,
              posterPath: row.poster_path,
            }
          : null,
    };
  }
  return out;
}

export default async function MerchantPromotions() {
  const merchant = await requireMerchant();
  const client = createClient();
  const [home, history, promotions, items, media] = await Promise.all([
    client
      .from('merchant_home_v')
      .select('name, status, city_id, category')
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
    /* Not in the generated types until they are regenerated with this table. */
    client
      .from('merchant_promotion' as never)
      .select('id, name, kind, value, catalogue_item_id, starts_at, ends_at, status')
      .eq('merchant_id', merchant.id)
      .order('created_at', { ascending: false })
      .limit(100),
    client
      .from('catalogue_item')
      .select('id, name, price_kes')
      .eq('merchant_id', merchant.id)
      .eq('available', true)
      .not('price_kes', 'is', null)
      .order('name')
      .limit(500),
    promotionMedia(client, merchant.id),
  ]);
  const bookings = history.error ? null : history.data;
  const controls = await featuredRequest(
    client,
    merchant.id,
    home.error ? null : home.data,
    bookings,
  );
  const businessName = home.data?.name ?? 'Your business';

  return (
    <LivePromotionsWorkspace
      businessName={businessName}
      bookings={bookings}
      promotions={promotions.error ? null : ((promotions.data ?? []) as unknown as PromotionRow[])}
      items={(items.data ?? []).flatMap((item) =>
        item.price_kes === null
          ? []
          : [{ id: item.id, name: item.name, price_kes: item.price_kes }],
      )}
      merchantId={merchant.id}
      store={{
        id: merchant.id,
        name: businessName,
        type: home.data?.category ? (categoryLabel(home.data.category) ?? null) : null,
      }}
      media={media}
      {...controls}
    />
  );
}
