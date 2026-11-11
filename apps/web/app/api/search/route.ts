import { NextResponse } from 'next/server';
import type { Json } from '@nexg/db';

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
 * Answers from the first character, matching the input, so results appear
 * as soon as somebody starts typing; each group is capped, so a single
 * letter still returns a short list.
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

/* Things NexG arranges itself rather than through a merchant. */
const DESTINATION_SERVICES: {
  words: string[];
  title: string;
  subtitle: string;
  href: (city: string) => string;
}[] = [
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

const CATEGORY_SEARCH_TERMS: Record<string, string[]> = {
  restaurants_food: ['food', 'restaurant', 'eat', 'dinner', 'lunch', 'breakfast', 'meal'],
  alcohol_beverages: ['drink', 'bar', 'liquor', 'wine', 'beer', 'alcohol'],
  laundry_cleaning: ['laundry', 'dry clean', 'washing', 'ironing'],
  flowers_gifts: ['flower', 'florist', 'bouquet', 'roses', 'gift', 'present', 'souvenir'],
  beauty: ['massage', 'spa', 'salon', 'beauty', 'hair', 'nails', 'barber'],
  fashion_apparel: ['fashion', 'clothing', 'clothes', 'boutique'],
  pharmacy: ['pharmacy', 'chemist', 'medicine', 'pharmaceutical', 'drugs'],
  health: ['pharmacy', 'chemist', 'medicine', 'health'],
  groceries_essentials: ['supermarket', 'grocer', 'groceries', 'shopping', 'shop'],
};

type CategorySearchRow = {
  category: string;
  label: string;
  description: string | null;
  subcategories: Json;
};

function isJsonRecord(value: Json): value is { [key: string]: Json | undefined } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/*
 * One or two letters match the start of a word ("p" finds Pharmacy and
 * Pizza, not Vapes); from three letters on, anywhere in the text.
 */
const SHORT = 3;

function matcher(lower: string): (text: string | null | undefined) => boolean {
  if (lower.length >= SHORT) return (text) => !!text && text.toLowerCase().includes(lower);
  return (text) =>
    !!text &&
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .some((word) => word.startsWith(lower));
}

function categorySearchServices(
  categories: CategorySearchRow[],
  lower: string,
  city: string,
): SearchItem[] {
  const subcategories: SearchItem[] = [];
  const matchedCategories: SearchItem[] = [];
  const hit = matcher(lower);
  const short = lower.length < SHORT;

  for (const category of categories) {
    if (
      hit(category.label) ||
      (!short && hit(category.description)) ||
      CATEGORY_SEARCH_TERMS[category.category]?.some(
        (term) => term.startsWith(lower) || (!short && lower.includes(term)),
      )
    ) {
      matchedCategories.push({
        kind: 'service',
        title: category.label,
        subtitle: category.description,
        href: `/explore?city=${city}&category=${encodeURIComponent(category.category)}`,
      });
    }

    if (!Array.isArray(category.subcategories)) continue;
    for (const subcategory of category.subcategories) {
      if (
        !isJsonRecord(subcategory) ||
        typeof subcategory.id !== 'string' ||
        typeof subcategory.name !== 'string' ||
        !hit(subcategory.name)
      ) {
        continue;
      }

      subcategories.push({
        kind: 'service',
        title: subcategory.name,
        subtitle: category.label,
        href: `/explore?city=${city}&category=${encodeURIComponent(category.category)}&subcategory=${encodeURIComponent(subcategory.id)}`,
      });
    }
  }

  /* One or two letters: the main categories first, they are the likelier aim. */
  return short
    ? [...matchedCategories.slice(0, 2), ...subcategories.slice(0, 3)]
    : [...subcategories.slice(0, 3), ...matchedCategories.slice(0, 2)];
}

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

  if (q.length < 1) {
    return NextResponse.json({ groups: [] satisfies SearchGroup[] });
  }

  const lower = q.toLowerCase();
  const short = lower.length < SHORT;
  /* An `or=` clause matching the term in these columns: anywhere for three
     letters or more; at the start of the text or of a word below that. */
  const anyOf = (columns: string[]) =>
    columns
      .flatMap((column) =>
        short ? [`${column}.ilike.${q}%`, `${column}.ilike.% ${q}%`] : [`${column}.ilike.%${q}%`],
      )
      .join(',');
  const supabase = createPublicClient();

  const { data: categoryRows, error: categoryError } = await supabase
    .from('category_config')
    .select('category, label, description, subcategories')
    .eq('is_active', true)
    .order('sort');

  if (categoryError) {
    console.error('Failed to load category search suggestions:', categoryError);
    return NextResponse.json({ error: 'Search is temporarily unavailable.' }, { status: 500 });
  }

  const categoryServices = categorySearchServices(
    (categoryRows ?? []) as CategorySearchRow[],
    lower,
    city,
  );
  const hit = matcher(lower);
  const destinationServices: SearchItem[] = DESTINATION_SERVICES.filter(
    (s) =>
      s.words.some((w) => w.startsWith(lower) || (!short && lower.includes(w))) || hit(s.title),
  )
    .slice(0, 3)
    .map((s) => ({ kind: 'service', title: s.title, subtitle: s.subtitle, href: s.href(city) }));

  const seenTitles = new Set<string>();
  const services: SearchItem[] = [];
  for (const item of [...categoryServices, ...destinationServices]) {
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
      .or(anyOf(['trading_name', 'category_other', 'branch_name']))
      .limit(8),
    supabase
      .from('property_public')
      .select('slug, name, area, summary')
      .or(anyOf(['name', 'area', 'summary']))
      .limit(4),
    cityId
      ? supabase
          .from('curated_day_public')
          .select('slug, title, tagline')
          .eq('city_id', cityId)
          .or(anyOf(['title', 'tagline']))
          .limit(3)
      : Promise.resolve({ data: [] as { slug: string; title: string; tagline: string | null }[] }),
    cityId
      ? supabase
          .from('event_public')
          .select('id, name, venue_name, starts_at')
          .eq('city_id', cityId)
          .gte('starts_at', new Date().toISOString())
          .or(anyOf(['name', 'venue_name']))
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
