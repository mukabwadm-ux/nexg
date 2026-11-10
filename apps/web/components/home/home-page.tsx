import { unstable_cache } from 'next/cache';
import { Button, Card, Tag } from '@nexg/ui';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { AppPreview, StoreBadges } from '@/components/home/app-preview';
import { BestSellers } from '@/components/home/best-sellers';
import { DeliveryZones } from '@/components/home/delivery-zones';
import { FeaturedMerchants } from '@/components/home/featured-merchants';
import { Hero } from '@/components/home/hero';
import { NotifyForm } from '@/components/home/notify-form';
import { PopularCategories } from '@/components/home/popular-categories';
import { SiteFooter } from '@/components/site-footer';
import { BEST_SELLERS, bestSellerFromCatalogue, type BestSeller } from '@/lib/best-sellers';
import { categoryTiles } from '@/lib/categories';
import { translator, type Locale, type Translate } from '@/lib/i18n/dictionaries';
import { createPublicClient } from '@/lib/supabase/public';

const getHomeData = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const [cityResult, zoneResult, featuredResult] = await Promise.all([
      supabase.from('city').select('id, slug, name, status').order('sort', { ascending: true }),
      supabase
        .from('zone')
        .select('id, city_id, name')
        .eq('active', true)
        .order('name', { ascending: true }),
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
    if (zoneResult.error) {
      throw new Error(`Could not load homepage delivery zones: ${zoneResult.error.message}`);
    }
    if (featuredResult.error) {
      throw new Error(`Could not load homepage features: ${featuredResult.error.message}`);
    }

    return { cities: cityResult.data, zones: zoneResult.data, featured: featuredResult.data };
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

/*
 * Best sellers: the products live merchants mark as popular, one per merchant
 * before a second from the same shop, eight at most. Refreshed every five
 * minutes. Nothing to show, or a read that fails: the sample row instead.
 */
const getBestSellers = unstable_cache(
  async (): Promise<BestSeller[]> => {
    const supabase = createPublicClient();
    const { data: items, error } = await supabase
      .from('catalogue_item')
      .select('id, name, price_kes, photo_path, sort, merchant_id')
      .eq('highlighted', true)
      .eq('available', true)
      .not('price_kes', 'is', null)
      .order('sort', { ascending: true })
      .limit(48);
    if (error || !items?.length) return [];

    const rows = items;
    /* merchant_public only returns live businesses, so this also drops the
       products of any shop that is not trading. */
    const { data: merchants } = await supabase
      .from('merchant_public')
      .select('id, trading_name, category, branch_name, accepting_orders')
      .in('id', [...new Set(rows.map((row) => row.merchant_id))]);
    const byId = new Map(
      (merchants ?? [])
        .filter((m) => m.id && m.trading_name && m.accepting_orders !== false)
        .map((m) => [m.id as string, m]),
    );

    /* Round-robin across merchants so one big menu cannot fill the row. */
    const queues = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!byId.has(row.merchant_id)) continue;
      queues.set(row.merchant_id, [...(queues.get(row.merchant_id) ?? []), row]);
    }
    const picked: typeof rows = [];
    while (picked.length < 8 && [...queues.values()].some((queue) => queue.length > 0)) {
      for (const queue of queues.values()) {
        const next = queue.shift();
        if (next && picked.length < 8) picked.push(next);
      }
    }

    const paths = picked.flatMap((row) => (row.photo_path ? [row.photo_path] : []));
    const { data: signed } = paths.length
      ? await supabase.storage.from('catalogue-images').createSignedUrls(paths, 2 * 60 * 60)
      : { data: [] };
    const photos = new Map(
      (signed ?? []).flatMap((photo) => (photo.signedUrl ? [[photo.path, photo.signedUrl]] : [])),
    );

    return picked.map((row) => {
      const merchant = byId.get(row.merchant_id)!;
      return bestSellerFromCatalogue({
        id: row.id,
        name: row.name,
        price_kes: row.price_kes as number,
        photo_url: row.photo_path ? (photos.get(row.photo_path) ?? null) : null,
        merchant_id: row.merchant_id,
        trading_name: merchant.trading_name as string,
        category: merchant.category,
        branch_name: merchant.branch_name,
      });
    });
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
  const [{ cities: allCities, zones, featured }, tileTaps, liveBestSellers] = await Promise.all([
    getHomeData(),
    getTileTaps(),
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
  const openCities = allCities.filter((c) => c.status !== 'waitlist');
  const zonesInOpenCities = zones.filter((zone) =>
    openCities.some((city) => city.id === zone.city_id),
  );

  return (
    <>
      <Hero
        locale={locale}
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
          className="mx-auto max-w-[96rem] scroll-mt-20 px-4 py-16 sm:px-8 sm:py-20 lg:px-16 lg:py-24"
        >
          <PopularCategories
            heading={t('home.popular.heading')}
            sub={t('home.popular.sub')}
            allLabel={t('home.popular.all')}
            items={categoryTiles(t, categories, tileTaps)}
          />
        </section>

        <section className="bg-ink py-14 text-white">
          <div className="mx-auto max-w-[96rem] px-4 sm:px-8 lg:px-16">
            <Tag tone="goldOutline" className="px-3 py-1 uppercase tracking-[0.12em]">
              {t('home.featured.eyebrow')}
            </Tag>

            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.375rem]">
                  {t('home.featured.heading')}
                </h2>
                <p className="mt-2 max-w-lg text-[0.9375rem] font-semibold leading-[1.7] text-white/60">
                  {t('home.featured.note')}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                asChild
                className="border-white/20 bg-transparent text-white hover:bg-white/10"
              >
                <Link href="/explore">
                  {t('home.featured.exploreAll')} <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </div>

            <FeaturedMerchants merchants={featured} t={t} />

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-white/40">
                {t('home.featured.ownBusiness')}
              </p>
              <Link
                href="/merchants#featured"
                className="text-gold text-xs font-bold hover:underline"
              >
                {t('home.featured.getFeatured')}
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-surface">
          <div className="mx-auto max-w-[96rem] px-4 py-14 sm:px-8 lg:px-16">
            <BestSellers
              heading={t('home.bestSellers.heading')}
              seeAll={t('home.bestSellers.seeAll')}
              sponsored={t('merchant.sponsored')}
              items={liveBestSellers.length > 0 ? liveBestSellers : BEST_SELLERS}
            />
          </div>
        </section>

        <section id="delivery-zones" className="py-14 sm:py-16">
          <div className="mx-auto max-w-[96rem] px-4 sm:px-8 lg:px-16">
            <DeliveryZones
              zones={zonesInOpenCities.flatMap((zone) => {
                const city = openCities.find((candidate) => candidate.id === zone.city_id);
                return city ? [{ ...zone, citySlug: city.slug }] : [];
              })}
            />
          </div>
        </section>

        <section className="mx-auto max-w-[96rem] px-4 py-12 sm:px-8 lg:px-16">
          <Card
            tone="ink"
            className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between"
          >
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">{t('home.join.heading')}</h2>
              <p className="mt-2 max-w-md text-[0.9375rem] font-semibold leading-[1.7] text-white/60">
                {t('home.join.body')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="gold" size="sm" asChild>
                <Link href="/hosts">{t('home.join.listAirbnb')}</Link>
              </Button>
              <Button size="sm" asChild className="text-ink bg-white hover:bg-white/90">
                <Link href="/riders">{t('home.join.becomeRider')}</Link>
              </Button>
              <Button size="sm" asChild className="text-ink bg-white hover:bg-white/90">
                <Link href="/merchants">{t('home.join.registerBusiness')}</Link>
              </Button>
              <Button size="sm" asChild className="text-ink bg-white hover:bg-white/90">
                <Link href="/careers">{t('home.join.viewOpenings')}</Link>
              </Button>
            </div>
          </Card>
        </section>

        <section className="bg-gold py-14">
          <div className="mx-auto grid max-w-[96rem] gap-8 px-4 sm:px-8 lg:grid-cols-2 lg:items-center lg:px-16">
            <div>
              <span className="bg-ink inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.625rem] font-bold uppercase tracking-wide text-white">
                <span aria-hidden="true" className="bg-gold h-1.5 w-1.5 rounded-full" />
                {t('home.app.eyebrow')}
              </span>

              <h2 className="mt-5 text-4xl/[1.06] font-extrabold tracking-tight sm:text-[3.125rem]/[1.06]">
                {t('home.app.heading')}
                <br />
                your pocket.
              </h2>

              <p className="text-ink/80 mt-4 max-w-md text-[0.9375rem] font-semibold leading-[1.7]">
                {t('home.app.body')}
              </p>

              <NotifyForm />
              <StoreBadges />
            </div>

            <div className="hidden lg:block">
              <AppPreview />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter locale={locale} translate={t} />
    </>
  );
}
