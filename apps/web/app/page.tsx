import { Button, Card, Tag } from '@nexg/ui';
import {
  ArrowRight,
  Car,
  Flower2,
  Gift,
  Landmark,
  Martini,
  Pill,
  Plane,
  Scissors,
  Shirt,
  ShoppingCart,
  Sparkles,
  Ticket,
  UtensilsCrossed,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';

import { AppPreview, StoreBadges } from '@/components/home/app-preview';
import { CityCarousel } from '@/components/home/city-carousel';
import { FeaturedMerchants } from '@/components/home/featured-merchants';
import { LeadForm } from '@/components/home/lead-form';
import { RotatingWord } from '@/components/home/rotating-word';
import { NotifyForm } from '@/components/home/notify-form';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { getTranslations } from '@/lib/i18n';
import { createPublicClient } from '@/lib/supabase/public';

export const metadata: Metadata = {
  title: 'Everything at your Doorstep',
  description:
    'Tell us where you are staying and what you need. A vetted local concierge confirms the plan, the price and the timing, and delivers it to your door.',
};

/* Copy below comes from the `BookingFirst` artboard and is signed off. */

const HOW_IT_WORKS = [
  { key: 'home.step1', image: '/images/how-it-works/ask-in-a-sentence.jpg' },
  { key: 'home.step2', image: '/images/how-it-works/a-concierge-takes-it.jpg' },
  { key: 'home.step3', image: '/images/how-it-works/track-and-pay.jpg' },
] as const;

const POPULAR_REQUESTS = [
  { key: 'home.req.dinner', icon: UtensilsCrossed },
  { key: 'home.req.airport', icon: Plane },
  { key: 'home.req.laundry', icon: Shirt },
  { key: 'home.req.flowers', icon: Flower2 },
  { key: 'home.req.pharmacy', icon: Pill },
  { key: 'home.req.wine', icon: Martini },
  { key: 'home.req.beauty', icon: Scissors },
  { key: 'home.req.driver', icon: Car },
  { key: 'home.req.groceries', icon: ShoppingCart },
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
  const { t } = await getTranslations();
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
      <SiteHeader action={{ label: t('nav.signIn'), href: '/sign-in' }} />

      <main>
        {/* ------------------------------------------------------------ hero */}
        <section className="mx-auto max-w-[96rem] px-4 pb-10 pt-8 sm:px-8 lg:px-16 lg:pb-16 lg:pt-12">
          <div className="grid gap-8 lg:grid-cols-[1fr_32rem] lg:gap-12">
            <div className="lg:pt-6">
              <span className="border-border-strong bg-surface inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold">
                <span aria-hidden="true" className="bg-gold h-1.5 w-1.5 rounded-full" />
                {t('home.availableNow')}
              </span>

              {/*
                The accessible name stays "Everything at your Doorstep" however
                the gold word is cycling; RotatingWord is hidden from assistive
                technology and reserves its own space so nothing below shifts.
              */}
              <h1
                aria-label={t('home.title')}
                className="mt-5 text-4xl/[1.16] font-extrabold tracking-tight sm:text-5xl/[1.16] lg:text-6xl/[1.16]"
              >
                <RotatingWord />
                <span aria-hidden="true" className="block">
                  {t('home.atYourDoorstep')}
                </span>
              </h1>

              <p className="mt-6 text-2xl font-extrabold tracking-tight sm:text-[2rem]">
                <span className="text-gold">{t('home.youWantIt')}</span>{' '}
                <span className="text-ink">{t('home.weGotYou')}</span>
              </p>

              <p className="text-muted mt-4 max-w-md text-[1.0625rem] font-semibold leading-[1.7]">
                {t('home.lede')}
              </p>

              <dl className="mt-7 flex flex-wrap gap-x-10 gap-y-4">
                {[
                  { value: allCities.length || '—', label: t('home.stat.cities') },
                  { value: CATEGORIES.length, label: t('home.stat.categories') },
                  { value: '100%', label: t('home.stat.tracking') },
                ].map((stat) => (
                  <div key={stat.label}>
                    <dt className="sr-only">{stat.label}</dt>
                    <dd>
                      <span className="block text-2xl font-extrabold tracking-tight">
                        {stat.value}
                      </span>
                      <span className="text-muted-light block text-xs">{stat.label}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/*
              LeadForm reads ?need= to prefill itself, which needs a boundary
              for the page to prerender. The fallback is the card's own shape
              so nothing jumps when it hydrates.
            */}
            <Suspense
              fallback={<div className="bg-surface shadow-raised min-h-[28rem] rounded-2xl" />}
            >
              <LeadForm />
            </Suspense>
          </div>
        </section>

        {/* ---------------------------------------------------- how it works */}
        <section id="how-it-works" className="mx-auto max-w-[96rem] px-4 pb-12 sm:px-8 lg:px-16">
          <ol className="grid gap-4 sm:grid-cols-3 sm:gap-6">
            {HOW_IT_WORKS.map((step, index) => (
              <li
                key={step.key}
                /* The tile is a hover-reveal, so it needs a tab stop: without one a
                   sighted keyboard user can never read the copy. The rule cannot see
                   that, hence the exception. */
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
                className="focus-visible:ring-gold focus-visible:ring-offset-bg group relative aspect-[418/197] min-w-0 overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                {/* Decorative: the panel below carries the same meaning in text. */}
                <Image
                  src={step.image}
                  alt=""
                  fill
                  sizes="(min-width: 640px) 33vw, 100vw"
                  className="object-cover"
                />

                {/*
                  The gold card, revealed on hover.

                  The base state is visible, and only devices that actually
                  support hover start it hidden — a touch screen has no hover,
                  so the copy would otherwise be unreachable. Focus reveals it
                  too, which is why the tile is focusable: without that a
                  sighted keyboard user could never read it. The text stays in
                  the DOM throughout, so screen readers get it in every state.
                */}
                <div className="bg-gold absolute inset-0 flex flex-col p-4 transition-opacity duration-300 sm:p-5 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
                  <span
                    aria-hidden="true"
                    className="bg-ink text-gold flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold"
                  >
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-base font-extrabold">{t(`${step.key}.title`)}</h3>
                  <p className="text-ink/80 mt-1.5 text-[0.9375rem] font-semibold leading-[1.7]">
                    {t(`${step.key}.body`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ------------------------------------------------ popular requests */}
        <section className="mx-auto max-w-[96rem] px-4 pb-14 sm:px-8 lg:px-16">
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
            <p className="text-muted-light text-xs font-semibold">
              {t('home.popular.sub')}
            </p>
          </div>

          <ul className="mt-4 flex flex-wrap gap-2">
            {POPULAR_REQUESTS.map((request) => {
              const Icon = request.icon;
              return (
                <li key={request.key}>
                  <Link
                    href={`/?need=${encodeURIComponent(t(request.key))}#start`}
                    className="border-border-strong bg-surface hover:border-ink/40 hover:bg-bg focus-visible:ring-gold inline-flex min-h-[2.5rem] items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  >
                    <span
                      aria-hidden="true"
                      className="bg-gold-soft text-gold-text flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {t(request.key)}
                  </Link>
                </li>
              );
            })}
            <li>
              <Link
                href="/#start"
                className="bg-ink hover:bg-ink/90 focus-visible:ring-gold inline-flex min-h-[2.5rem] items-center rounded-full px-4 py-2 text-sm font-bold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >{t('home.popular.other')}</Link>
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
              <p className="text-xs font-semibold text-white/40">{t('home.featured.ownBusiness')}</p>
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
              <p className="mt-2 max-w-md text-[0.9375rem] font-semibold leading-[1.7] text-white/60">{t('home.join.body')}</p>
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

              <h2 className="mt-5 text-4xl/[1.06] font-extrabold tracking-tight sm:text-[3.125rem]/[1.06]">{t('home.app.heading')}<br />
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
