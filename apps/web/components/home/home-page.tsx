import { unstable_cache } from 'next/cache';
import { Button, Card, Tag } from '@nexg/ui';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { AppPreview, StoreBadges } from '@/components/home/app-preview';
import { BestSellers } from '@/components/home/best-sellers';
import { CityCarousel } from '@/components/home/city-carousel';
import { FeaturedMerchants } from '@/components/home/featured-merchants';
import { Hero } from '@/components/home/hero';
import { NotifyForm } from '@/components/home/notify-form';
import { PopularCategories } from '@/components/home/popular-categories';
import { SiteFooter } from '@/components/site-footer';
import { BEST_SELLERS } from '@/lib/best-sellers';
import { categoryTiles } from '@/lib/categories';
import { translator, type Locale, type Translate } from '@/lib/i18n/dictionaries';
import { createPublicClient } from '@/lib/supabase/public';

const getHomeData = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const [cityResult, featuredResult] = await Promise.all([
      supabase.from('city').select('id, slug, name, status').order('sort', { ascending: true }),
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

    return { cities: cityResult.data, featured: featuredResult.data };
  },
  ['homepage-public-data'],
  { revalidate: 3600 },
);

export async function HomePageContent({
  locale,
  translate,
}: {
  locale: Locale;
  translate?: Translate;
}) {
  const t = translate ?? translator(locale);
  const { cities: allCities, featured } = await getHomeData();
  const openCities = allCities.filter((c) => c.status !== 'waitlist');

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
            items={categoryTiles(t)}
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
              items={BEST_SELLERS}
            />
          </div>
        </section>

        <section id="cities" className="py-14 sm:py-16">
          <div className="mx-auto max-w-[96rem] px-4 sm:px-8 lg:px-16">
            <CityCarousel cities={allCities} />
            {openCities.length > 0 && (
              <p className="text-muted-light mt-8 text-center text-xs font-semibold">
                Open for orders in {openCities.map((c) => c.name).join(', ')}.
              </p>
            )}
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
