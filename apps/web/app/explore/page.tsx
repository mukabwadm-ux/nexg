import { EmptyState, Tag, VALUE_PLACEHOLDER } from '@nexg/ui';
import { Store } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Explore',
  description: 'Every business open on NexG, by city and category.',
};

/** Live data: a merchant that went live a minute ago belongs here now. */
export const dynamic = 'force-dynamic';

const CATEGORY_LABEL: Record<string, string> = {
  restaurant: 'Restaurant',
  bar_liquor: 'Drinks',
  laundry: 'Laundry',
  florist: 'Flowers & gifts',
  beauty_fashion: 'Beauty & fashion',
  pharmacy: 'Pharmacy',
  supermarket: 'Supermarket',
  gift_shop: 'Gift shop',
  other: 'Other',
};

export default async function ExplorePage({
  searchParams,
}: {
  searchParams?: { city?: string; category?: string };
}) {
  const supabase = createClient();

  /*
   * merchant_public is the only merchant data anon can read and it cannot
   * return anything that is not live (ground rule 5). There is deliberately
   * no status filter here — adding one would imply the frontend is what
   * keeps a non-live business hidden.
   */
  let query = supabase
    .from('merchant_public')
    .select(
      'id, trading_name, category, category_other, city_name, city_slug, branch_name, branch_address, cover_photo_path, featured',
    )
    .order('listed_at', { ascending: false });

  if (searchParams?.city) query = query.eq('city_slug', searchParams.city);
  if (searchParams?.category) query = query.eq('category', searchParams.category);

  const [{ data: merchants }, { data: cities }] = await Promise.all([
    query,
    supabase
      .from('city')
      .select('slug, name, status')
      .neq('status', 'waitlist')
      .order('sort', { ascending: true }),
  ]);

  const rows = (merchants ?? []).filter(
    (m): m is typeof m & { id: string; trading_name: string } =>
      Boolean(m.id) && Boolean(m.trading_name),
  );

  const categories = [...new Set(rows.map((m) => m.category).filter(Boolean))] as string[];

  return (
    <>
      <SiteHeader action={{ label: 'Sign in', href: '/sign-in' }} />

      <main className="mx-auto max-w-[96rem] px-4 py-10 sm:px-8 lg:px-16">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Explore</h1>
        <p className="text-muted mt-3 max-w-xl text-[1.0625rem] font-semibold leading-[1.7]">
          Every business open on NexG right now. Ask the concierge for anything you see here — and
          for plenty you don&apos;t.
        </p>

        {/* Filters are links, not client state: a filtered view should be a
            URL someone can send to a friend. */}
        <div className="mt-8 flex flex-wrap gap-2">
          <FilterChip href="/explore" active={!searchParams?.city && !searchParams?.category}>
            All
          </FilterChip>
          {(cities ?? []).map((city) => (
            <FilterChip
              key={city.slug}
              href={`/explore?city=${city.slug}`}
              active={searchParams?.city === city.slug}
            >
              {city.name}
            </FilterChip>
          ))}
        </div>

        {categories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((category) => (
              <FilterChip
                key={category}
                href={`/explore?category=${category}${searchParams?.city ? `&city=${searchParams.city}` : ''}`}
                active={searchParams?.category === category}
              >
                {CATEGORY_LABEL[category] ?? category}
              </FilterChip>
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              icon={<Store className="h-5 w-5" />}
              title="Nothing open here yet"
              description="No business is live in this city or category yet. Try another, or ask the concierge — plenty of what guests want never comes from a listing."
              action={{ label: 'Clear filters', href: '/explore' }}
            />
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {rows.map((merchant) => (
              <li
                key={merchant.id}
                className="border-border bg-surface shadow-card overflow-hidden rounded-2xl border"
              >
                <div className="bg-bg relative flex h-36 items-center justify-center">
                  {merchant.featured && (
                    <span className="absolute left-2 top-2 z-10">
                      <Tag tone="sponsored" size="sm" className="uppercase tracking-wide">
                        Sponsored
                      </Tag>
                    </span>
                  )}
                  {merchant.cover_photo_path ? (
                    <Image
                      src={merchant.cover_photo_path}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                    />
                  ) : (
                    <Store aria-hidden="true" className="text-muted-light/50 h-10 w-10" />
                  )}
                </div>

                <div className="p-4">
                  <p className="truncate text-[0.9375rem] font-extrabold">
                    {merchant.trading_name}
                  </p>
                  <p className="text-muted-light mt-0.5 truncate text-xs font-semibold">
                    {[
                      merchant.category_other ??
                        CATEGORY_LABEL[merchant.category ?? 'other'] ??
                        'Merchant',
                      merchant.branch_name ?? merchant.city_name,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {merchant.branch_address && (
                    <p className="text-muted-light mt-1 truncate text-xs">
                      {merchant.branch_address}
                    </p>
                  )}
                  {/*
                   * Delivery time is a business number and none is recorded,
                   * so it renders bracketed rather than as an estimate a guest
                   * might plan around (ground rule 3).
                   */}
                  <p className="text-muted mt-3 text-xs font-bold">
                    Delivers in {VALUE_PLACEHOLDER} min
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3.5 py-1.5 text-[0.8125rem] font-bold transition-colors ${
        active
          ? 'border-ink bg-ink text-white'
          : 'border-border-strong bg-surface text-ink hover:border-ink'
      }`}
    >
      {children}
    </Link>
  );
}
