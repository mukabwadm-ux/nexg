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
  TAXONOMY_CATEGORIES,
} from '@/components/explore/merchant-card';
import { CategoryScroller } from '@/components/explore/category-scroller';
import { FilterRail, type FilterState } from '@/components/explore/filter-rail';
import { SiteFooter } from '@/components/site-footer';
import { ExploreFollowsLocation } from '@/components/location/explore-sync';
import { SiteHeader } from '@/components/site-header';
import { unstable_cache } from 'next/cache';

import { createPublicClient } from '@/lib/supabase/public';

export const metadata: Metadata = {
  title: 'Explore',
  description: 'Every business open on NexG right now, by city, area and category.',
};

/** A merchant that went live a minute ago belongs here now. */
export const dynamic = 'force-dynamic';

/* Categories from before the current taxonomy; shown only while a merchant still uses one. */
const LEGACY_CATEGORIES = [
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
  async () => {
    const supabase = createPublicClient();
    const [merchantResult, cityResult, zoneResult] = await Promise.all([
      supabase
        .from('merchant_public')
        .select(
          'id, trading_name, category, category_other, cover_photo_path, branch_name, branch_address, branch_latitude, branch_longitude, city_name, city_slug, zone_id, concierge_pick, featured, accepting_orders, explore_visible, listed_at',
        )
        .order('listed_at', { ascending: false }),
      supabase
        .from('city')
        .select('id, slug, name, status')
        .neq('status', 'waitlist')
        .order('sort', { ascending: true }),
      supabase.from('zone').select('id, city_id, name').eq('active', true),
    ]);
    if (zoneResult.error) {
      throw new Error(`Could not load active delivery zones: ${zoneResult.error.message}`);
    }
    return {
      merchants: merchantResult.data ?? [],
      cities: cityResult.data ?? [],
      zones: zoneResult.data ?? [],
    };
  },
  ['explore-listing'],
  { revalidate: 3600, tags: ['merchants'] },
);

/*
 * "Near you": how far a merchant's branch may be from the visitor's spot to
 * count. The platform's default delivery limit (fees.delivery.max_km); a
 * merchant further than this would be refused at checkout anyway.
 */
const NEAR_KM = 15;

function parseNear(raw: string | undefined): { lat: number; lng: number } | null {
  if (!raw) return null;
  const [lat, lng] = raw.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat!) > 90 || Math.abs(lng!) > 180) return null;
  return { lat: lat!, lng: lng! };
}

/** Great-circle distance in km. */
function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams?: {
    city?: string;
    category?: string;
    area?: string;
    zone?: string;
    open?: string;
    picks?: string;
    q?: string;
    /** "lat,lng": only merchants that deliver to this spot, nearest first. */
    near?: string;
  };
}) {
  /*
   * The city has to be known before the cache key, and the city list is part
   * of what is cached — so resolve it from the default city first, then use
   * whatever the visitor asked for.
   */
  const { cities: allCities } = await listingFor();
  const citySlug = searchParams?.city ?? allCities[0]?.slug ?? 'nairobi';
  const { merchants: all, cities, zones } = await listingFor();
  const cityName = cities?.find((c) => c.slug === citySlug)?.name ?? 'your city';
  const cityId = cities?.find((c) => c.slug === citySlug)?.id;
  const selectedZone =
    zones?.find((zone) => zone.id === searchParams?.zone && zone.city_id === cityId) ?? null;

  /*
   * merchant_public is the only merchant data anon can read and it cannot
   * return anything that is not live (ground rule 5). Nairobi is the only city
   * being served, so every live merchant is listed there regardless of the
   * city or `explore_visible` set on its record.
   */
  const listed = (all ?? []).filter(
    (m): m is typeof m & { id: string; trading_name: string } =>
      Boolean(m.id) &&
      Boolean(m.trading_name) &&
      (citySlug === 'nairobi' || m.city_slug === citySlug),
  );

  const state: FilterState = {
    city: citySlug,
    category: searchParams?.category ?? null,
    area: searchParams?.area ?? null,
    zone: selectedZone?.id ?? null,
    openNow: searchParams?.open === '1',
    picksOnly: searchParams?.picks === '1',
  };
  const query = (searchParams?.q ?? '').trim().toLowerCase();
  const near = parseNear(searchParams?.near);

  const hrefFor = (patch: Partial<FilterState> & { q?: string | null; near?: string | null }) => {
    const next = { ...state, ...patch };
    const params = new URLSearchParams();
    if (next.city) params.set('city', next.city);
    if (next.category) params.set('category', next.category);
    if (next.area) params.set('area', next.area);
    if (next.zone) params.set('zone', next.zone);
    if (next.openNow) params.set('open', '1');
    if (next.picksOnly) params.set('picks', '1');
    const q = 'q' in patch ? patch.q : (searchParams?.q ?? null);
    if (q) params.set('q', q);
    /* Kept across every other filter: switching category near you stays near you. */
    const nearParam = 'near' in patch ? patch.near : (searchParams?.near ?? null);
    if (nearParam && near) params.set('near', nearParam);
    const search = params.toString();
    return search ? `/explore?${search}` : '/explore';
  };

  /* Distance from the visitor's spot, where both ends are known. */
  const kmTo = (m: { branch_latitude: number | null; branch_longitude: number | null }) =>
    near && m.branch_latitude != null && m.branch_longitude != null
      ? kmBetween(near, { lat: m.branch_latitude, lng: m.branch_longitude })
      : null;

  const filtered = listed.filter((merchant) => {
    /* Near you: a branch with no pin cannot be shown to reach the visitor. */
    if (near) {
      const km = kmTo(merchant);
      if (km === null || km > NEAR_KM) return false;
    }
    if (state.category && merchant.category !== state.category) return false;
    if (state.area && merchant.branch_name !== state.area) return false;
    if (state.zone && merchant.zone_id !== state.zone) return false;
    if (state.openNow && merchant.accepting_orders === false) return false;
    if (state.picksOnly && !merchant.concierge_pick) return false;
    if (query) {
      const haystack =
        `${merchant.trading_name} ${merchant.category_other ?? ''} ${merchant.branch_name ?? ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const visible = near
    ? [...filtered].sort((a, b) => (kmTo(a) ?? Infinity) - (kmTo(b) ?? Infinity))
    : filtered;

  const picks = listed
    .filter((m) => m.concierge_pick && (!state.zone || m.zone_id === state.zone))
    .slice(0, 3);
  const areas = [...new Set(listed.map((m) => m.branch_name).filter(Boolean))] as string[];
  const usedCategories = [
    ...TAXONOMY_CATEGORIES,
    ...LEGACY_CATEGORIES.filter((c) => listed.some((m) => m.category === c)),
  ];

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-[96rem] px-4 pb-16 pt-6 sm:px-8 lg:px-16">
        {/* Keeps ?city= in step with the chip, so changing the
            delivery address re-queries this listing without a
            reload. */}
        <ExploreFollowsLocation />

        {/*
         * Which city is being browsed — not where the order is
         * going. Those are different questions and this used to
         * answer both, under the same words the header chip
         * uses.
         *
         * Two controls labelled "Deliver to", each with its own
         * state, is how a guest ends up browsing Mombasa with a
         * Nairobi pin in the header and no way to tell which one
         * the prices belong to. The chip owns the delivery
         * address everywhere; this switches the listing.
         */}
        <div className="border-border bg-surface flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3">
          <MapPin aria-hidden="true" className="text-gold h-4 w-4 shrink-0" />
          <span className="text-muted-light text-[0.5625rem] font-extrabold uppercase tracking-[0.16em]">
            Browsing
          </span>
          <span className="text-[0.875rem] font-extrabold">{cityName}</span>
          <span className="ml-auto flex flex-wrap gap-1.5">
            {(cities ?? []).map((city) => (
              <Link
                key={city.slug}
                href={hrefFor({ city: city.slug, area: null, zone: null })}
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
            {state.zone && <input type="hidden" name="zone" value={state.zone} />}
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
        <CategoryScroller>
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
        </CategoryScroller>

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
                {near
                  ? 'to your spot'
                  : selectedZone
                    ? `in ${selectedZone.name}`
                    : `to ${cityName}`}{' '}
                right now
              </p>
              {near && (
                <Link
                  href={hrefFor({ near: null })}
                  className="text-muted-light hover:text-ink text-xs font-bold transition-colors"
                >
                  Show all in {cityName}
                </Link>
              )}
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
                  title={near ? 'Nobody near you yet' : 'Nothing matches that yet'}
                  description={
                    near
                      ? `No business within ${NEAR_KM} km of your spot fits that yet. See everything in ${cityName}, or ask the concierge — plenty of what guests want never comes from a listing.`
                      : selectedZone
                        ? `No merchants are listed in ${selectedZone.name} just yet. Try another zone or ask the concierge — plenty of what guests want never comes from a listing.`
                        : 'No business here fits those filters. Try another area or category — or ask the concierge, since plenty of what guests want never comes from a listing.'
                  }
                  action={{
                    label: near || selectedZone ? `See all in ${cityName}` : 'Clear filters',
                    href: hrefFor({
                      category: near ? state.category : null,
                      area: null,
                      zone: null,
                      openNow: false,
                      picksOnly: false,
                      q: null,
                      near: null,
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
