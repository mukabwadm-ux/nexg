import { Button, EmptyState } from '@nexg/ui';
import { MapPin, Store } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  type ExploreMerchant,
  MerchantCard,
} from '@/components/explore/merchant-card';
import { FilterRail, type FilterState } from '@/components/explore/filter-rail';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { unstable_cache } from 'next/cache';

import { createPublicClient } from '@/lib/supabase/public';

export const metadata: Metadata = {
  title: 'Explore',
  description: 'Every business open on NexG right now, by city, area and category.',
};

/** A merchant that went live a minute ago belongs here now. */
export const dynamic = 'force-dynamic';

const CATEGORY_ORDER = [
  'restaurant',
  'bar_liquor',
  'laundry',
  'florist',
  'beauty_fashion',
  'pharmacy',
  'supermarket',
  'gift_shop',
] as const;

/*
 * The listing is dynamic because the filters live in the query string, so the
 * page itself cannot be cached — but the data behind it is the same for
 * everyone looking at a given city. Caching the query means the filters cost
 * nothing but a re-render.
 */
const listingFor = unstable_cache(
  async (citySlug: string) => {
    const supabase = createPublicClient();
    const [{ data: merchants }, { data: cities }] = await Promise.all([
      supabase
        .from('merchant_public')
        .select(
          'id, trading_name, category, category_other, cover_photo_path, branch_name, branch_address, city_name, city_slug, concierge_pick, featured, accepting_orders, explore_visible, listed_at',
        )
        .eq('city_slug', citySlug)
        .order('listed_at', { ascending: false }),
      supabase
        .from('city')
        .select('slug, name, status')
        .neq('status', 'waitlist')
        .order('sort', { ascending: true }),
    ]);
    return { merchants: merchants ?? [], cities: cities ?? [] };
  },
  ['explore-listing'],
  { revalidate: 3600, tags: ['merchants'] },
);

export default async function ExplorePage({
  searchParams,
}: {
  searchParams?: {
    city?: string;
    category?: string;
    area?: string;
    open?: string;
    picks?: string;
    q?: string;
  };
}) {
  /*
   * The city has to be known before the cache key, and the city list is part
   * of what is cached — so resolve it from the default city first, then use
   * whatever the visitor asked for.
   */
  const { cities: allCities } = await listingFor('nairobi');
  const citySlug = searchParams?.city ?? allCities[0]?.slug ?? 'nairobi';
  const { merchants: all, cities } = await listingFor(citySlug);
  const cityName = cities?.find((c) => c.slug === citySlug)?.name ?? 'your city';

  /*
   * merchant_public is the only merchant data anon can read and it cannot
   * return anything that is not live (ground rule 5). `explore_visible` is a
   * separate switch staff control — it narrows this listing, it does not
   * widen what anyone can see.
   */
  const listed = (all ?? []).filter(
    (m): m is typeof m & { id: string; trading_name: string } =>
      Boolean(m.id) && Boolean(m.trading_name) && m.explore_visible !== false,
  );

  const state: FilterState = {
    city: citySlug,
    category: searchParams?.category ?? null,
    area: searchParams?.area ?? null,
    openNow: searchParams?.open === '1',
    picksOnly: searchParams?.picks === '1',
  };
  const query = (searchParams?.q ?? '').trim().toLowerCase();

  const hrefFor = (patch: Partial<FilterState> & { q?: string | null }) => {
    const next = { ...state, ...patch };
    const params = new URLSearchParams();
    if (next.city) params.set('city', next.city);
    if (next.category) params.set('category', next.category);
    if (next.area) params.set('area', next.area);
    if (next.openNow) params.set('open', '1');
    if (next.picksOnly) params.set('picks', '1');
    const q = 'q' in patch ? patch.q : (searchParams?.q ?? null);
    if (q) params.set('q', q);
    const search = params.toString();
    return search ? `/explore?${search}` : '/explore';
  };

  const visible = listed.filter((merchant) => {
    if (state.category && merchant.category !== state.category) return false;
    if (state.area && merchant.branch_name !== state.area) return false;
    if (state.openNow && merchant.accepting_orders === false) return false;
    if (state.picksOnly && !merchant.concierge_pick) return false;
    if (query) {
      const haystack =
        `${merchant.trading_name} ${merchant.category_other ?? ''} ${merchant.branch_name ?? ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const picks = listed.filter((m) => m.concierge_pick).slice(0, 3);
  const areas = [...new Set(listed.map((m) => m.branch_name).filter(Boolean))] as string[];
  const usedCategories = CATEGORY_ORDER.filter((c) => listed.some((m) => m.category === c));

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-[96rem] px-4 pb-16 pt-6 sm:px-8 lg:px-16">
        {/* Where we are delivering. A real city switch, not decoration. */}
        <div className="border-border bg-surface flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3">
          <MapPin aria-hidden="true" className="text-gold h-4 w-4 shrink-0" />
          <span className="text-muted-light text-[0.5625rem] font-extrabold uppercase tracking-[0.16em]">
            Deliver to
          </span>
          <span className="text-[0.875rem] font-extrabold">{cityName}</span>
          <span className="ml-auto flex flex-wrap gap-1.5">
            {(cities ?? []).map((city) => (
              <Link
                key={city.slug}
                href={hrefFor({ city: city.slug, area: null })}
                aria-current={city.slug === citySlug ? 'true' : undefined}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                  city.slug === citySlug
                    ? 'bg-ink text-white'
                    : 'text-muted hover:bg-bg hover:text-ink'
                }`}
              >
                {city.name}
              </Link>
            ))}
          </span>
        </div>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
              What can we bring you <span className="text-gold">tonight?</span>
            </h1>
            <p className="text-muted mt-3 max-w-xl text-[0.9375rem] font-semibold leading-[1.7]">
              Merchants that deliver to {cityName} right now. Pick one, or ask a concierge and we’ll
              find it.
            </p>
          </div>

          {/* A GET form, so the result is a shareable URL and it works with
              JavaScript off. */}
          <form action="/explore" className="flex w-full max-w-sm gap-2">
            <input type="hidden" name="city" value={citySlug} />
            {state.category && <input type="hidden" name="category" value={state.category} />}
            <input
              type="search"
              name="q"
              defaultValue={searchParams?.q ?? ''}
              aria-label="Search merchants"
              placeholder="Search merchants"
              className="border-border bg-surface focus-visible:ring-gold min-w-0 flex-1 rounded-xl border px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2"
            />
            <Button type="submit" size="sm">
              Search
            </Button>
          </form>
        </div>

        {/* Categories */}
        <ul className="mt-7 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
          <li>
            <Link
              href={hrefFor({ category: null })}
              aria-current={!state.category ? 'true' : undefined}
              className={`flex h-full flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors ${
                !state.category
                  ? 'border-ink bg-ink text-white'
                  : 'border-border bg-surface hover:border-border-strong'
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  !state.category ? 'bg-gold text-ink' : 'bg-bg text-muted'
                }`}
              >
                <Store className="h-4 w-4" />
              </span>
              <span className="text-[0.6875rem] font-bold leading-tight">All</span>
            </Link>
          </li>
          {usedCategories.map((category) => {
            const Icon = CATEGORY_ICON[category] ?? Store;
            const on = state.category === category;
            return (
              <li key={category}>
                <Link
                  href={hrefFor({ category: on ? null : category })}
                  aria-current={on ? 'true' : undefined}
                  className={`flex h-full flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors ${
                    on
                      ? 'border-ink bg-ink text-white'
                      : 'border-border bg-surface hover:border-border-strong'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                      on ? 'bg-gold text-ink' : 'bg-bg text-muted'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[0.6875rem] font-bold leading-tight">
                    {CATEGORY_LABEL[category]}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Concierge picks */}
        {picks.length > 0 && !state.category && !state.area && !query && (
          <section className="mt-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight">
                <span
                  aria-hidden="true"
                  className="bg-gold text-ink flex h-8 w-8 items-center justify-center rounded-full text-sm"
                >
                  ★
                </span>
                Concierge picks for {cityName}
              </h2>
              <Link
                href={hrefFor({ picksOnly: true })}
                className="text-ink text-sm font-bold underline underline-offset-4"
              >
                See all picks
              </Link>
            </div>

            <ul className="mt-5 grid gap-4 md:grid-cols-3">
              {picks.map((pick) => {
                const Icon = CATEGORY_ICON[pick.category ?? 'other'] ?? Store;
                return (
                  <li key={pick.id}>
                    <Link
                      href={`/explore/${pick.id}`}
                      className="bg-ink relative flex h-56 flex-col justify-end overflow-hidden rounded-2xl p-5 text-white"
                    >
                      {pick.cover_photo_path ? (
                        <Image
                          src={pick.cover_photo_path}
                          alt=""
                          fill
                          sizes="(min-width: 768px) 33vw, 100vw"
                          className="object-cover opacity-55"
                        />
                      ) : (
                        <Icon
                          aria-hidden="true"
                          className="text-gold/15 absolute right-4 top-4 h-24 w-24"
                        />
                      )}
                      <span className="bg-gold text-ink absolute left-4 top-4 rounded-full px-2.5 py-1 text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
                        Concierge pick
                      </span>
                      <span className="relative">
                        <span className="block text-[1.375rem] font-extrabold tracking-tight">
                          {pick.trading_name}
                        </span>
                        <span className="mt-1 block text-xs font-semibold text-white/60">
                          {CATEGORY_LABEL[pick.category ?? 'other']}
                          {pick.branch_name && ` · ${pick.branch_name}`}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Listing */}
        <div className="mt-10 grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
          <FilterRail state={state} areas={areas} hrefFor={hrefFor} />

          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[0.9375rem] font-bold">
                {visible.length} {visible.length === 1 ? 'merchant delivers' : 'merchants deliver'}{' '}
                to {cityName} right now
              </p>
              {query && (
                <Link
                  href={hrefFor({ q: null })}
                  className="text-muted-light hover:text-ink text-xs font-bold transition-colors"
                >
                  Clear “{searchParams?.q}”
                </Link>
              )}
            </div>

            {visible.length === 0 ? (
              <div className="mt-6">
                <EmptyState
                  icon={<Store className="h-5 w-5" />}
                  title="Nothing matches that yet"
                  description="No business here fits those filters. Try another area or category — or ask the concierge, since plenty of what guests want never comes from a listing."
                  action={{
                    label: 'Clear filters',
                    href: hrefFor({
                      category: null,
                      area: null,
                      openNow: false,
                      picksOnly: false,
                      q: null,
                    }),
                  }}
                />
              </div>
            ) : (
              <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((merchant) => (
                  <MerchantCard key={merchant.id} merchant={merchant as ExploreMerchant} />
                ))}
              </ul>
            )}
          </div>
        </div>

        <section className="bg-gold text-ink mt-12 flex flex-wrap items-center justify-between gap-6 rounded-2xl p-8 sm:p-10">
          <div className="max-w-xl">
            <h2 className="text-[1.75rem] font-extrabold leading-tight tracking-tight">
              Own a business guests would love?
            </h2>
            <p className="text-ink/80 mt-2 text-[0.9375rem] font-semibold">
              Join the merchants on this page. No listing fee, our riders, weekly payouts.
            </p>
          </div>
          <Button variant="black" size="lg" asChild className="h-14 shrink-0 rounded-xl">
            <Link href="/merchants/apply">Register Your Business</Link>
          </Button>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
