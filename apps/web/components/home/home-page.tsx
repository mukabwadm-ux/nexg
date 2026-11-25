import { unstable_cache } from 'next/cache';
import Link from 'next/link';

import { AppPreview, StoreBadges } from '@/components/home/app-preview';
import { BestSellers } from '@/components/home/best-sellers';
import {
  FeaturedMerchants,
  type CardMedia,
  type FeaturedMerchant,
} from '@/components/home/featured-merchants';
import { Hero } from '@/components/home/hero';
import { JoinParticles } from '@/components/home/join-particles';
import { Reveal } from '@/components/reveal';
import { NotifyForm } from '@/components/home/notify-form';
import { JoinSection } from '@/components/home/join-section';
import { PopularCategories } from '@/components/home/popular-categories';
import { StoresNearYou } from '@/components/home/stores-near-you';
import { SiteFooter } from '@/components/site-footer';
import { BEST_SELLERS, bestSellerFromCatalogue, type BestSeller } from '@/lib/best-sellers';
import { popularTiles } from '@/lib/categories';
import { signMedia } from '@/lib/promo-media-server';
import { translator, type Locale, type Translate } from '@/lib/i18n/dictionaries';
import type { NearbyStore } from '@/lib/stores-near';
import { createPublicClient } from '@/lib/supabase/public';

const getHomeData = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const [cityResult, storeResult, featuredResult] = await Promise.all([
      supabase.from('city').select('id, slug, name, status').order('sort', { ascending: true }),
      /* Every live store, for Find Stores Near You. merchant_public only
         returns what is live, and Nairobi is the one city being served, so
         all of them are Nairobi's (as on Explore). */
      supabase
        .from('merchant_public')
        .select(
          'id, trading_name, category, category_key, category_other, cover_photo_path, branch_name, branch_latitude, branch_longitude, concierge_pick, featured, accepting_orders, closed_today, closes_today, prep_minutes, listed_at, explore_visible',
        )
        .order('listed_at', { ascending: false })
        .limit(300),
      loadFeatured(supabase),
    ]);

    if (cityResult.error) {
      throw new Error(`Could not load homepage cities: ${cityResult.error.message}`);
    }
    /* A failed store read leaves the section out rather than the page. */
    if (storeResult.error) {
      console.warn('[home] stores near you not loaded', storeResult.error.message);
    }
    const stores: NearbyStore[] = (storeResult.data ?? []).flatMap((s) =>
      s.id && s.trading_name && s.explore_visible !== false
        ? [
            {
              id: s.id,
              trading_name: s.trading_name,
              category: s.category,
              category_key: s.category_key,
              category_other: s.category_other,
              cover_photo_path: s.cover_photo_path,
              branch_name: s.branch_name,
              branch_latitude: s.branch_latitude,
              branch_longitude: s.branch_longitude,
              concierge_pick: s.concierge_pick,
              featured: s.featured,
              accepting_orders: s.accepting_orders,
              closed_today: s.closed_today,
              closes_today: s.closes_today,
              prep_minutes: s.prep_minutes,
              listed_at: s.listed_at,
            },
          ]
        : [],
    );

    return { cities: cityResult.data, stores, featured: featuredResult };
  },
  ['homepage-public-data'],
  { revalidate: 300 },
);

/**
 * The homepage's featured cards, with each card's own image or video.
 *
 * The media sits in a private bucket; a visitor may sign it only while its
 * card is on the homepage. Signed for two hours, well past the five-minute
 * cache. A file that cannot be signed leaves the card on the cover photo.
 *
 * The site deploys before migration 20270101120100 is applied by hand, and
 * until then the view has no media columns: the cards are read without them
 * and show the cover photo, as before, rather than the page failing.
 */
async function loadFeatured(
  supabase: ReturnType<typeof createPublicClient>,
): Promise<FeaturedMerchant[]> {
  const withMedia = await supabase
    .from('featured_live_v')
    .select(
      'booking_id, merchant_id, trading_name, merchant_category, city_slug, branch_name, cover_photo_path, blurb, badge, position, accepting_orders, closed_today, prep_minutes, media_kind, media_path, poster_path',
    )
    .eq('kind', 'homepage')
    .order('position')
    .limit(4);

  if (!withMedia.error) {
    const rows = withMedia.data ?? [];
    const signed = await signMedia(
      supabase,
      rows.flatMap((row) => [row.media_path, row.poster_path]),
      2 * 60 * 60,
    );
    return rows.map(({ media_kind, media_path, poster_path, ...row }) => ({
      ...row,
      media: cardMedia(media_kind, media_path, poster_path, signed),
    }));
  }

  const plain = await supabase
    .from('featured_live_v')
    .select(
      'booking_id, merchant_id, trading_name, merchant_category, city_slug, branch_name, cover_photo_path, blurb, badge, position, accepting_orders, closed_today, prep_minutes',
    )
    .eq('kind', 'homepage')
    .order('position')
    .limit(4);
  if (plain.error) {
    throw new Error(`Could not load homepage features: ${plain.error.message}`);
  }
  return (plain.data ?? []).map((row) => ({ ...row, media: null }));
}

function cardMedia(
  kind: string | null,
  path: string | null,
  poster: string | null,
  signed: Record<string, string>,
): CardMedia | null {
  const src = path ? signed[path] : undefined;
  if (!src) return null;
  if (kind === 'image') return { kind: 'image', src };
  if (kind === 'video') return { kind: 'video', src, poster: poster ? signed[poster] : null };
  return null;
}

/* Visits plus searches per category over the last 30 days, for Popular
   categories (lib/categories, popularTiles). Refreshed every five minutes; a
   counter that cannot be read counts as empty, so the tiles keep the fixed
   priority order. */
const getCategorySignals = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const supabase = createPublicClient();
    const [taps, searches] = await Promise.all([
      supabase.rpc('rpc_category_tile_popularity', { p_days: 30 }),
      supabase.rpc('rpc_popular_search_ranking', { p_days: 30 }),
    ]);
    const signals: Record<string, number> = {};
    const add = (key: string, count: unknown) => {
      signals[key] = (signals[key] ?? 0) + (Number(count) || 0);
    };
    if (!taps.error) for (const row of taps.data ?? []) add(row.tile, row.clicks);
    if (!searches.error) for (const row of searches.data ?? []) add(row.topic, row.searches);
    return signals;
  },
  ['homepage-category-signals'],
  { revalidate: 300 },
);

/*
 * Best sellers, ranked by the database (rpc_best_sellers): paid Best seller
 * slots first, then the most sold products of the last 30 days, then
 * products merchants mark as popular. Refreshed every five minutes, so a
 * slot going live or a run of orders shows up on its own. Nothing to show,
 * or a read that fails: the sample row instead.
 */
interface BestSellerRow {
  item_id: string;
  item_name: string;
  price_kes: number;
  photo_path: string | null;
  merchant_id: string;
  trading_name: string;
  category: string | null;
  branch_name: string | null;
  source: 'sponsored' | 'top_selling' | 'popular';
}

const getBestSellers = unstable_cache(
  async (): Promise<BestSeller[]> => {
    const supabase = createPublicClient();
    /* Not in the generated types until they are regenerated with this RPC. */
    const { data, error } = await supabase.rpc(
      'rpc_best_sellers' as never,
      { p_limit: 8 } as never,
    );
    const rows = (data ?? []) as unknown as BestSellerRow[];
    if (error || rows.length === 0) return [];

    const paths = rows.flatMap((row) => (row.photo_path ? [row.photo_path] : []));
    const { data: signed } = paths.length
      ? await supabase.storage.from('catalogue-images').createSignedUrls(paths, 2 * 60 * 60)
      : { data: [] };
    const photos = new Map(
      (signed ?? []).flatMap((photo) => (photo.signedUrl ? [[photo.path, photo.signedUrl]] : [])),
    );

    return rows.map((row) =>
      bestSellerFromCatalogue({
        id: row.item_id,
        name: row.item_name,
        price_kes: row.price_kes,
        photo_url: row.photo_path ? (photos.get(row.photo_path) ?? null) : null,
        merchant_id: row.merchant_id,
        trading_name: row.trading_name,
        category: row.category,
        branch_name: row.branch_name,
        sponsored: row.source === 'sponsored',
      }),
    );
  },
  ['homepage-best-sellers'],
  { revalidate: 300 },
);

export async function HomePageContent({
  locale,
  translate,
}: {
  locale: Locale;
  translate?: Translate;
}) {
  const t = translate ?? translator(locale);
  const [{ stores, featured }, categorySignals, liveBestSellers] = await Promise.all([
    getHomeData(),
    getCategorySignals(),
    getBestSellers().catch(() => [] as BestSeller[]),
  ]);
  const supabase = createPublicClient();
  const { data: categoryRows, error: categoryError } = await supabase
    .from('category_config')
    .select('category, label, image_path')
    .eq('is_active', true)
    .order('sort');
  if (categoryError) {
    throw new Error(`Could not load homepage categories: ${categoryError.message}`);
  }
  const categories = (categoryRows ?? []).map((category) => ({
    ...category,
    image_url: category.image_path
      ? supabase.storage.from('category-images').getPublicUrl(category.image_path).data.publicUrl
      : null,
  }));

  return (
    <>
      <Hero
        locale={locale}
        copy={{
          eyebrow: t('hero.eyebrow'),
          titleLine1: t('hero.title1'),
          titleLine2: t('hero.title2'),
          searchPlaceholder: t('hero.searchPlaceholder'),
          searchButton: t('hero.search'),
          scroll: t('hero.scroll'),
        }}
      />

      <main>
        <section
          id="popular"
          className="mx-auto max-w-[120rem] scroll-mt-20 px-4 py-10 sm:px-[30px] sm:py-12 lg:py-14"
        >
          <Reveal variant="iris">
            <PopularCategories
              heading={t('home.popular.heading')}
              sub={t('home.popular.sub')}
              allLabel={t('home.popular.all')}
              items={popularTiles(t, categories, categorySignals)}
            />
          </Reveal>
        </section>

        <section className="bg-ink dark:bg-night py-16 text-white sm:py-20">
          <div className="mx-auto max-w-[120rem] px-4 sm:px-[30px]">
            <Reveal variant="wipe">
              <FeaturedMerchants merchants={featured} t={t} />

              <div
                data-reveal-tail
                className="mt-8 flex flex-wrap items-center justify-between gap-2"
              >
                <p className="text-sm font-semibold text-white/45">
                  {t('home.featured.ownBusiness')}
                </p>
                <Link
                  href="/merchants#featured"
                  className="text-gold text-sm font-bold hover:underline"
                >
                  {t('home.featured.getFeatured')}
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="band-surface">
          <div className="mx-auto max-w-[120rem] px-4 py-14 sm:px-[30px]">
            <Reveal variant="rise">
              <BestSellers
                heading={t('home.bestSellers.heading')}
                seeAll={t('home.bestSellers.seeAll')}
                sponsored={t('merchant.sponsored')}
                items={liveBestSellers.length > 0 ? liveBestSellers : BEST_SELLERS}
              />
            </Reveal>
          </div>
        </section>

        {stores.length > 0 && (
          <section id="stores-near-you" className="bg-ink dark:bg-night py-14 text-white sm:py-16">
            <div className="mx-auto max-w-[120rem] px-4 sm:px-[30px]">
              <Reveal variant="focus">
                <StoresNearYou stores={stores} />
              </Reveal>
            </div>
          </section>
        )}

        <section className="bg-bg text-ink py-16 sm:py-20">
          <div className="mx-auto max-w-[120rem] px-4 sm:px-[30px]">
            <Reveal variant="path" className="relative isolate">
              <JoinParticles />
              <JoinSection t={t} />
            </Reveal>
          </div>
        </section>

        {/* The app: a dark panel from the left edge with a deep rounded right
            side, on gold, and the phone on the gold beside it. */}
        <section className="bg-gold relative overflow-hidden">
          <div
            aria-hidden="true"
            className="bg-night absolute inset-x-0 inset-y-[3px] rounded-r-[3rem] lg:right-[42%] lg:rounded-r-[11rem]"
          />
          <div className="relative mx-auto grid max-w-[120rem] gap-10 px-4 sm:px-[30px] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-center">
            {/* The words come in line by line, with the phone beside them. */}
            <Reveal variant="rise" className="py-10 text-white sm:py-12 lg:py-10 lg:pr-16">
              <span
                data-reveal-head
                className="inline-flex items-center gap-2.5 rounded-full border border-white/20 px-5 py-2.5 text-xs font-extrabold uppercase tracking-[0.2em]"
              >
                <span aria-hidden="true" className="bg-gold h-2 w-2 rounded-full" />
                {t('home.app.eyebrow')}
              </span>

              <h2
                data-reveal-head
                className="mt-7 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.375rem]"
              >
                {t('home.app.heading')}
                <br />
                your <span className="text-gold">pocket.</span>
              </h2>

              <div data-reveal-head>
                <NotifyForm />
              </div>
              <div data-reveal-head>
                <StoreBadges />
              </div>
            </Reveal>

            {/* The phone at 62% of its drawn size: the section stays compact. */}
            <div className="hidden py-6 lg:block">
              <div className="h-[25.5rem]">
                <Reveal variant="phone" className="origin-top scale-[0.62]">
                  <AppPreview />
                </Reveal>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter locale={locale} translate={t} />
    </>
  );
}
