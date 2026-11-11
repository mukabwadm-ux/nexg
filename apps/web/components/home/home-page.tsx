import { unstable_cache } from 'next/cache';
import Link from 'next/link';

import { AppPreview, StoreBadges } from '@/components/home/app-preview';
import { BestSellers } from '@/components/home/best-sellers';
import { FeaturedMerchants } from '@/components/home/featured-merchants';
import { Hero } from '@/components/home/hero';
import { NotifyForm } from '@/components/home/notify-form';
import { JoinSection } from '@/components/home/join-section';
import { PopularCategories } from '@/components/home/popular-categories';
import { StoresNearYou } from '@/components/home/stores-near-you';
import { SiteFooter } from '@/components/site-footer';
import { BEST_SELLERS, bestSellerFromCatalogue, type BestSeller } from '@/lib/best-sellers';
import { categoryTiles } from '@/lib/categories';
import { translator, type Locale, type Translate } from '@/lib/i18n/dictionaries';
import { rankPopularSearches } from '@/lib/popular-searches';
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
      supabase
        .from('featured_live_v')
        .select(
          'booking_id, merchant_id, trading_name, merchant_category, city_slug, branch_name, cover_photo_path, blurb, badge, position, accepting_orders, closed_today, prep_minutes',
        )
        .eq('kind', 'homepage')
        .order('position')
        .limit(4),
    ]);

    if (cityResult.error) {
      throw new Error(`Could not load homepage cities: ${cityResult.error.message}`);
    }
    if (featuredResult.error) {
      throw new Error(`Could not load homepage features: ${featuredResult.error.message}`);
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

    return { cities: cityResult.data, stores, featured: featuredResult.data };
  },
  ['homepage-public-data'],
  { revalidate: 300 },
);

/* Taps per category tile over the last 30 days. Refreshed every five minutes;
   if it cannot be read, the tiles keep their usual order. */
const getTileTaps = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const { data, error } = await createPublicClient().rpc('rpc_category_tile_popularity', {
      p_days: 30,
    });
    if (error || !data) return {};
    return Object.fromEntries(
      (data as { tile: string; clicks: number }[]).map((row) => [row.tile, Number(row.clicks)]),
    );
  },
  ['homepage-tile-taps'],
  { revalidate: 300 },
);

/* Hero searches per topic over the last 30 days, for the Popular searches
   buttons. Refreshed every five minutes; if it cannot be read, the buttons
   keep their usual order. */
const getSearchCounts = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const { data, error } = await createPublicClient().rpc('rpc_popular_search_ranking', {
      p_days: 30,
    });
    if (error || !data) return {};
    return Object.fromEntries(data.map((row) => [row.topic, Number(row.searches)]));
  },
  ['homepage-search-counts'],
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
  const [{ cities: allCities, stores, featured }, tileTaps, liveBestSellers, searchCounts] =
    await Promise.all([
      getHomeData(),
      getTileTaps(),
      getBestSellers().catch(() => [] as BestSeller[]),
      getSearchCounts().catch(() => ({}) as Record<string, number>),
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
  const openCities = allCities.filter((c) => c.status !== 'waitlist');

  return (
    <>
      <Hero
        locale={locale}
        popularTopics={rankPopularSearches(searchCounts)}
        cities={
          openCities.length > 0
            ? openCities.map((c) => ({ slug: c.slug, name: c.name }))
            : [{ slug: 'nairobi', name: 'Nairobi' }]
        }
        copy={{
          eyebrow: t('hero.eyebrow'),
          titleLine1: t('hero.title1'),
          titleLine2: t('hero.title2'),
          lede: t('hero.lede'),
          searchPlaceholder: t('hero.searchPlaceholder'),
          searchButton: t('hero.search'),
          popular: t('hero.popular'),
          plan: t('hero.plan'),
          signIn: t('nav.signIn'),
          scroll: t('hero.scroll'),
          promptTitle: t('hero.prompt.title'),
          promptBody: t('hero.prompt.body'),
          promptCta: t('hero.prompt.cta'),
          promptLater: t('hero.prompt.later'),
        }}
      />

      <main>
        <section
          id="popular"
          className="mx-auto max-w-[120rem] scroll-mt-20 px-4 py-16 sm:px-[30px] sm:py-20 lg:py-24"
        >
          <PopularCategories
            heading={t('home.popular.heading')}
            sub={t('home.popular.sub')}
            allLabel={t('home.popular.all')}
            items={categoryTiles(t, categories, tileTaps)}
          />
        </section>

        <section className="bg-ink py-16 text-white sm:py-20">
          <div className="mx-auto max-w-[120rem] px-4 sm:px-[30px]">
            <FeaturedMerchants merchants={featured} t={t} />

            <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
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
          </div>
        </section>

        <section className="bg-surface">
          <div className="mx-auto max-w-[120rem] px-4 py-14 sm:px-[30px]">
            <BestSellers
              heading={t('home.bestSellers.heading')}
              seeAll={t('home.bestSellers.seeAll')}
              sponsored={t('merchant.sponsored')}
              items={liveBestSellers.length > 0 ? liveBestSellers : BEST_SELLERS}
            />
          </div>
        </section>

        {stores.length > 0 && (
          <section id="stores-near-you" className="bg-ink py-14 text-white sm:py-16">
            <div className="mx-auto max-w-[120rem] px-4 sm:px-[30px]">
              <StoresNearYou stores={stores} />
            </div>
          </section>
        )}

        <section className="bg-bg text-ink py-16 sm:py-20">
          <div className="mx-auto max-w-[120rem] px-4 sm:px-[30px]">
            <JoinSection t={t} />
          </div>
        </section>

        {/* The app: a dark panel from the left edge with a deep rounded right
            side, on gold, and the phone on the gold beside it. */}
        <section className="relative overflow-hidden bg-[#D4AF37]">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[#0b0907] lg:right-[42%] lg:rounded-r-[11rem]"
          />
          <div className="relative mx-auto grid max-w-[120rem] gap-10 px-4 sm:px-[30px] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-center">
            <div className="py-16 text-white sm:py-20 lg:py-28 lg:pr-16">
              <span className="inline-flex items-center gap-2.5 rounded-full border border-white/20 px-5 py-2.5 text-xs font-extrabold uppercase tracking-[0.2em]">
                <span aria-hidden="true" className="bg-gold h-2 w-2 rounded-full" />
                {t('home.app.eyebrow')}
              </span>

              <h2 className="mt-7 text-5xl/[1.02] font-extrabold tracking-tight sm:text-6xl/[1.02] lg:text-[4.25rem]/[1.02] xl:text-[4.75rem]/[1.02]">
                {t('home.app.heading')}
                <br />
                your <span className="text-gold">pocket.</span>
              </h2>

              <p className="mt-6 max-w-[40rem] text-base leading-[1.75] text-white/70 sm:text-lg">
                {t('home.app.body')}
              </p>

              <NotifyForm />
              <StoreBadges />
            </div>

            <div className="hidden py-16 lg:block">
              <AppPreview />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter locale={locale} translate={t} />
    </>
  );
}
