import { NextResponse } from 'next/server';
import { getCategoryById, searchTaxonomy } from '@nexg/contracts';

import { createPublicClient } from '@/lib/supabase/public';

/**
 * The hero search, answered as somebody types.
 *
 * One request, five kinds of answer — the services we offer, merchants,
 * stays, curated days and events — so the dropdown can show the best of
 * each rather than a list of whichever table came back first. Everything
 * read here is already public (the `_public` views and `merchant_public`
 * apply their own visibility rules), so the anonymous client is right.
 *
 * Three characters minimum, matching the input: two letters match half the
 * catalogue and tell nobody anything.
 */

export interface SearchItem {
  kind: 'service' | 'merchant' | 'stay' | 'day' | 'event';
  title: string;
  subtitle: string | null;
  href: string;
}

export interface SearchGroup {
  key: string;
  label: string;
  items: SearchItem[];
}

/*
 * What people type, mapped to where it is served. Merchant categories go
 * to Explore filtered; the two things NexG arranges itself rather than
 * through a merchant go to the concierge request and to Stays.
 */
const SERVICES: {
  words: string[];
  title: string;
  subtitle: string;
  href: (city: string) => string;
}[] = [
  {
    words: ['food', 'restaurant', 'eat', 'dinner', 'lunch', 'breakfast', 'meal'],
    title: 'Restaurants',
    subtitle: 'Food delivered to your door',
    href: (c) => `/explore?city=${c}&category=restaurant`,
  },
  {
    words: ['drink', 'bar', 'liquor', 'wine', 'beer', 'alcohol'],
    title: 'Drinks',
    subtitle: 'Bars and liquor stores',
    href: (c) => `/explore?city=${c}&category=bar_liquor`,
  },
  {
    words: ['laundry', 'dry clean', 'washing', 'ironing'],
    title: 'Laundry',
    subtitle: 'Collected and returned',
    href: (c) => `/explore?city=${c}&category=laundry`,
  },
  {
    words: ['flower', 'florist', 'bouquet', 'roses'],
    title: 'Flowers',
    subtitle: 'Florists',
    href: (c) => `/explore?city=${c}&category=florist`,
  },
  {
    words: ['massage', 'spa', 'salon', 'beauty', 'hair', 'nails', 'fashion', 'barber'],
    title: 'Beauty, spa & fashion',
    subtitle: 'Salons, spas and boutiques',
    href: (c) => `/explore?city=${c}&category=beauty_fashion`,
  },
  {
    words: ['pharmacy', 'chemist', 'medicine', 'pharmaceutical', 'drugs'],
    title: 'Pharmaceuticals',
    subtitle: 'Pharmacies and chemists',
    href: (c) => `/explore?city=${c}&category=pharmacy`,
  },
  {
    words: ['supermarket', 'grocer', 'groceries', 'shopping', 'shop'],
    title: 'Groceries',
    subtitle: 'Supermarkets',
    href: (c) => `/explore?city=${c}&category=supermarket`,
  },
  {
    words: ['gift', 'present', 'souvenir'],
    title: 'Gifts',
    subtitle: 'Gift shops',
    href: (c) => `/explore?city=${c}&category=gift_shop`,
  },
  {
    words: ['airport', 'pickup', 'pick up', 'transfer', 'taxi', 'ride', 'flight'],
    title: 'Airport pickup',
    subtitle: 'Arranged by a concierge',
    href: () => '/ask?need=Airport%20Transfer',
  },
  {
    words: ['hotel', 'stay', 'airbnb', 'apartment', 'room', 'accommodation', 'lodging'],
    title: 'Hotel stays',
    subtitle: 'Places to stay, with a concierge',
    href: () => '/stays',
  },
  {
    words: ['experience', 'trip', 'plan', 'tour', 'day out', 'itinerary'],
    title: 'Plan your trip',
    subtitle: 'Build a day to your budget',
    href: () => '/experience',
  },
];

/** PostgREST's `or=` filter is comma- and bracket-delimited; strip what would end a clause. */
function safe(term: string): string {
  return term
    .replace(/[,()*%\\:"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = (url.searchParams.get('q') ?? '').trim().slice(0, 60);
  const city = (url.searchParams.get('city') ?? 'nairobi').replace(/[^a-z0-9-]/g, '') || 'nairobi';
  const q = safe(raw);

  if (q.length < 3) {
    return NextResponse.json({ groups: [] satisfies SearchGroup[] });
  }

  const lower = q.toLowerCase();
  const like = `%${q}%`;
  const supabase = createPublicClient();

  const taxonomyMatch = searchTaxonomy(q);
  const taxonomyServices: SearchItem[] = [
    ...taxonomyMatch.subcategories.slice(0, 3).map((sub) => ({
      kind: 'service' as const,
      title: sub.name,
      subtitle: getCategoryById(sub.categoryId)?.name ?? 'Merchant Category',
      href: `/explore?city=${city}&category=${sub.categoryId}&subcategory=${sub.id}`,
    })),
    ...taxonomyMatch.categories.slice(0, 2).map((cat) => ({
      kind: 'service' as const,
      title: cat.name,
      subtitle: cat.desc,
      href: `/explore?city=${city}&category=${cat.id}`,
    })),
  ];

  const hardcodedServices: SearchItem[] = SERVICES.filter(
    (s) =>
      s.words.some((w) => w.startsWith(lower) || lower.includes(w)) ||
      s.title.toLowerCase().includes(lower),
  )
    .slice(0, 3)
    .map((s) => ({ kind: 'service', title: s.title, subtitle: s.subtitle, href: s.href(city) }));

  const seenTitles = new Set<string>();
  const services: SearchItem[] = [];
  for (const item of [...taxonomyServices, ...hardcodedServices]) {
    if (!seenTitles.has(item.title.toLowerCase())) {
      seenTitles.add(item.title.toLowerCase());
      services.push(item);
    }
    if (services.length >= 4) break;
  }

  const { data: cityRow } = await supabase.from('city').select('id').eq('slug', city).maybeSingle();
  const cityId = cityRow?.id ?? null;

  const [merchants, stays, days, events] = await Promise.all([
    supabase
      .from('merchant_public')
      .select('id, trading_name, category, category_other, branch_name, explore_visible')
      .eq('city_slug', city)
      .or(`trading_name.ilike.${like},category_other.ilike.${like},branch_name.ilike.${like}`)
      .limit(8),
    supabase
      .from('property_public')
      .select('slug, name, area, summary')
      .or(`name.ilike.${like},area.ilike.${like},summary.ilike.${like}`)
      .limit(4),
    cityId
      ? supabase
          .from('curated_day_public')
          .select('slug, title, tagline')
          .eq('city_id', cityId)
          .or(`title.ilike.${like},tagline.ilike.${like}`)
          .limit(3)
      : Promise.resolve({ data: [] as { slug: string; title: string; tagline: string | null }[] }),
    cityId
      ? supabase
          .from('event_public')
          .select('id, name, venue_name, starts_at')
          .eq('city_id', cityId)
          .gte('starts_at', new Date().toISOString())
          .or(`name.ilike.${like},venue_name.ilike.${like}`)
          .order('starts_at')
          .limit(3)
      : Promise.resolve({
          data: [] as { id: string; name: string; venue_name: string | null; starts_at: string }[],
        }),
  ]);

  const groups: SearchGroup[] = [
    { key: 'services', label: 'Services', items: services },
    {
      key: 'merchants',
      label: 'Merchants',
      items: (merchants.data ?? [])
        .filter((m) => m.id && m.trading_name && m.explore_visible !== false)
        .slice(0, 5)
        .map((m) => ({
          kind: 'merchant' as const,
          title: m.trading_name!,
          subtitle: [m.category_other ?? m.category?.replace('_', ' & '), m.branch_name]
            .filter(Boolean)
            .join(' · '),
          href: `/explore/${m.id}`,
        })),
    },
    {
      key: 'stays',
      label: 'Stays',
      items: (stays.data ?? [])
        .filter((s) => s.slug && s.name)
        .map((s) => ({
          kind: 'stay' as const,
          title: s.name!,
          subtitle: s.area ?? s.summary ?? null,
          href: `/stays/${s.slug}`,
        })),
    },
    {
      key: 'experiences',
      label: 'Experiences',
      items: [
        ...(days.data ?? [])
          .filter((d) => d.slug && d.title)
          .map((d) => ({
            kind: 'day' as const,
            title: d.title!,
            subtitle: d.tagline ?? 'A curated day',
            href: `/experience/build?from=${d.slug}`,
          })),
        ...(events.data ?? [])
          .filter((e) => e.id && e.name)
          .map((e) => ({
            kind: 'event' as const,
            title: e.name!,
            subtitle: [
              e.venue_name,
              e.starts_at
                ? new Date(e.starts_at).toLocaleDateString('en-KE', {
                    day: 'numeric',
                    month: 'short',
                  })
                : null,
            ]
              .filter(Boolean)
              .join(' · '),
            href: `/experience/build?event=${e.id}`,
          })),
      ],
    },
  ].filter((g) => g.items.length > 0);

  return NextResponse.json(
    { groups },
    /* The same query from the same city is the same answer for a minute. */
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  );
}
