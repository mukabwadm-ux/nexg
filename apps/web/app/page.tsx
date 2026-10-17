import { Button, Card, Tag } from '@nexg/ui';
import {
  ArrowRight,
  Car,
  Gift,
  Landmark,
  Martini,
  Plane,
  Shirt,
  Sparkles,
  Ticket,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { AppPreview, StoreBadges } from '@/components/home/app-preview';
import { CityCarousel } from '@/components/home/city-carousel';
import { FeaturedMerchants } from '@/components/home/featured-merchants';
import { Hero } from '@/components/home/hero';
import { NotifyForm } from '@/components/home/notify-form';
import { SiteFooter } from '@/components/site-footer';
import { getTranslations } from '@/lib/i18n';
import { createPublicClient } from '@/lib/supabase/public';

export const metadata: Metadata = {
  title: 'Everything at your Doorstep',
  description:
    'Tell us where you are staying and what you need. A vetted local concierge confirms the plan, the price and the timing, and delivers it to your door.',
};

/* Copy below comes from the `BookingFirst` artboard and is signed off. */

/*
 * Popular categories: real photographs (CC0, see
 * public/images/categories/CREDITS.md), each opening Explore filtered to
 * the merchant category it names. The list grows with the merchant
 * catalogue.
 */
const POPULAR_CATEGORIES = [
  { key: 'home.pc.restaurants', image: 'restaurants', category: 'restaurant' },
  { key: 'home.pc.groceries', image: 'groceries', category: 'supermarket' },
  { key: 'home.pc.pharmacy', image: 'pharmacy', category: 'pharmacy' },
  { key: 'home.pc.beauty', image: 'beauty', category: 'beauty_fashion' },
  { key: 'home.pc.drinks', image: 'drinks', category: 'bar_liquor' },
  { key: 'home.pc.flowers', image: 'flowers', category: 'florist' },
  { key: 'home.pc.laundry', image: 'laundry', category: 'laundry' },
  { key: 'home.pc.gifts', image: 'gifts', category: 'gift_shop' },
] as const;

const CATEGORIES = [
  { key: 'home.cat.transfers', icon: Plane },
  { key: 'home.cat.alcohol', icon: Martini },
  { key: 'home.cat.fashion', icon: Shirt },
  { key: 'home.cat.beauty', icon: Sparkles },
  { key: 'home.cat.rentals', icon: Car },
  { key: 'home.cat.experiences', icon: Ticket },
  { key: 'home.cat.financial', icon: Landmark },
  { key: 'home.cat.flowers', icon: Gift },
] as const;

/*
 * Cached and re-rendered at most once an hour. Everything on this page is the
 * same for every visitor, so re-querying it per request bought nothing and
 * cost a round trip to the database on each one.
 */
export const revalidate = 3600;

export default async function HomePage() {
  const { locale, t } = await getTranslations();
  const supabase = createPublicClient();

  // Live and soft-launch cities first, then the waitlist — as designed.
  const [{ data: cities }, { data: featured }] = await Promise.all([
    supabase.from('city').select('id, slug, name, status').order('sort', { ascending: true }),
    /*
     * The band reads featured_live_v and nothing else.
     *
     * That view only returns a slot that is live this week, whose
     * creative has been approved, and whose merchant is still in
     * merchant_public — so a merchant suspended on Wednesday leaves
     * the homepage on Wednesday. Every row carries badge =
     * 'SPONSORED', which is why there is no code path here that can
     * render a paid card without the label.
     *
     * Position is the slot number, so the order is the one that was
     * sold rather than whatever Postgres returns.
     */
    supabase
      .from('featured_live_v')
      .select(
        'booking_id, merchant_id, trading_name, merchant_category, city_slug, branch_name, cover_photo_path, blurb, badge, position, accepting_orders, closed_today, prep_minutes',
      )
      .eq('kind', 'homepage')
      .order('position')
      .limit(4),
  ]);

  const allCities = cities ?? [];
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
          openSearch: t('hero.openSearch'),
          scroll: t('hero.scroll'),
          promptTitle: t('hero.prompt.title'),
          promptBody: t('hero.prompt.body'),
          promptCta: t('hero.prompt.cta'),
          promptLater: t('hero.prompt.later'),
        }}
      />

      <main>
        {/* ---------------------------------------------- popular categories */}
        <section
          id="popular"
          className="mx-auto max-w-[96rem] scroll-mt-20 px-4 pb-14 pt-12 sm:px-8 lg:px-16"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
              <span
                aria-hidden="true"
                className="bg-ink text-gold flex h-7 w-7 items-center justify-center rounded-full"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              {t('home.popular.heading')}
            </h2>
            <p className="text-muted-light text-xs font-semibold">{t('home.popular.sub')}</p>
          </div>

          {/* One row: it scrolls sideways on a phone, nine across on desktop. */}
          <ul className="-mx-4 mt-5 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-9 lg:gap-4 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
            {POPULAR_CATEGORIES.map((item) => (
              <li key={item.key} className="w-[6.75rem] shrink-0 sm:w-32 lg:w-auto">
                <Link
                  href={`/explore?category=${item.category}`}
                  className="focus-visible:ring-gold group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                >
                  <span className="shadow-card bg-surface relative block aspect-square overflow-hidden rounded-2xl">
                    <Image
                      src={`/images/categories/${item.image}.jpg`}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 10vw, 8rem"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </span>
                  <span className="mt-2 block text-center text-[0.8125rem] font-bold leading-tight">
                    {t(item.key)}
                  </span>
                </Link>
              </li>
            ))}
            <li className="w-[6.75rem] shrink-0 sm:w-32 lg:w-auto">
              <Link
                href="/ask"
                className="focus-visible:ring-gold group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <span className="bg-ink text-gold shadow-card flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl transition-colors group-hover:bg-[#1f1d1b]">
                  <Sparkles className="h-7 w-7" aria-hidden="true" />
                  <span className="px-2 text-center text-[0.6875rem] font-semibold text-white/70">
                    {t('home.popular.otherHint')}
                  </span>
                </span>
                <span className="mt-2 block text-center text-[0.8125rem] font-bold leading-tight">
                  {t('home.popular.other')}
                </span>
              </Link>
            </li>
          </ul>
        </section>

        {/* ------------------------------------------------------- featured */}
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

            <FeaturedMerchants merchants={featured ?? []} t={t} />

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

        {/* -------------------------------------------- everything we arrange */}
        <section className="bg-surface">
          <div className="mx-auto max-w-[96rem] px-4 py-14 sm:px-8 lg:px-16">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.375rem]">
                {t('home.services.heading')}
              </h2>
              <Link href="/explore" className="text-sm font-bold underline underline-offset-4">
                {t('home.services.browseAll')}
              </Link>
            </div>

            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {CATEGORIES.map((category) => {
                const Icon = category.icon;
                return (
                  <li key={category.key}>
                    <Card className="flex h-full items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="bg-gold text-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-bold">{t(category.key)}</span>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------- cities */}
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

        {/* --------------------------------------------------- partner band */}
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

        {/* ------------------------------------------------------------- app */}
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

      <SiteFooter />
    </>
  );
}
