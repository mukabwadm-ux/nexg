'use client';

import {
  ArrowRight,
  Compass,
  Gift,
  type LucideIcon,
  Plane,
  Search,
  Store,
  Ticket,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { CATEGORY_IMAGE_MAP, getCategoryImage } from '@nexg/contracts';
import { PageHero } from '@/components/company/page-hero';
import { Reveal } from '@/components/reveal';
import { discoverCategoryHref } from '@/lib/discover-links';

export interface ExplorerCategory {
  id: string;
  name: string;
  desc: string;
  icon: string;
  cardKind: string;
  sort: number;
  color: string | null;
  image?: string;
  imageUrl?: string | null;
  subcategories: {
    id: string;
    name: string;
    fields?: string[];
    fulfillmentHint?: string;
  }[];
}

type Kind = 'all' | 'menu' | 'products' | 'services';
type Subcategory = ExplorerCategory['subcategories'][number];

/** How a category's merchants are ordered from (category_config.card_kind). */
const KINDS: readonly { key: Kind; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'menu', label: 'Food & drink' },
  { key: 'products', label: 'Shopping' },
  { key: 'services', label: 'Services' },
];

/* Marks for a category with no photograph of its own (category_config.icon). */
const FALLBACK_ICON: Record<string, LucideIcon> = { Compass, Gift, Plane, Ticket };

const has = (text: string | undefined, query: string) =>
  Boolean(text && text.toLowerCase().includes(query));

const subcategoryMatches = (sub: Subcategory, query: string) =>
  has(sub.name, query) ||
  Boolean(sub.fields?.some((field) => has(field, query))) ||
  has(sub.fulfillmentHint, query);

const categoryMatches = (category: ExplorerCategory, query: string) =>
  has(category.name, query) ||
  has(category.desc, query) ||
  has(category.id, query) ||
  category.subcategories.some((sub) => subcategoryMatches(sub, query));

/**
 * All categories: the company pages' dark header with the search and the
 * order-type filter in it, then every category as a tall photograph card
 * (the homepage's card, a dark fade at the foot carrying the words). The
 * first card in the list runs two columns wide. Each card is one link to
 * Discovery for that category; the subcategories on it are labels, not
 * links, because they all led to the same place.
 */
export function CategoryExplorer({ categories }: { categories: ExplorerCategory[] }) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [kind, setKind] = React.useState<Kind>('all');
  const term = query.trim().toLowerCase();

  const visible = React.useMemo(
    () =>
      categories.filter(
        (category) =>
          (kind === 'all' || category.cardKind === kind) &&
          (!term || categoryMatches(category, term)),
      ),
    [categories, kind, term],
  );

  const counts = React.useMemo(() => {
    const byKind: Record<Kind, number> = {
      all: categories.length,
      menu: 0,
      products: 0,
      services: 0,
    };
    for (const category of categories)
      if (category.cardKind in byKind) byKind[category.cardKind as Kind] += 1;
    return byKind;
  }, [categories]);

  const types = visible.reduce((sum, category) => sum + category.subcategories.length, 0);
  const reset = () => {
    setQuery('');
    setKind('all');
  };

  return (
    <>
      <PageHero
        eyebrow="All categories"
        compact
        title="Everything you need,"
        gold="in one place."
        lede={`${categories.length} kinds of business across Nairobi, from restaurants and pharmacies to car hire and days out. Pick one to see who serves where you are.`}
      >
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            /* One result: go straight to it. Otherwise close the keyboard so
               the matching cards are in view. */
            const only = visible.length === 1 ? visible[0] : undefined;
            if (only) router.push(discoverCategoryHref(only.id));
            else (document.activeElement as HTMLElement | null)?.blur();
          }}
          className="focus-within:ring-gold mt-9 flex max-w-2xl items-center rounded-full bg-white p-1.5 shadow-2xl focus-within:ring-2"
        >
          <Search className="ml-3.5 h-5 w-5 shrink-0 text-[#141414]" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try sushi, florist or safari"
            aria-label="Search categories"
            autoComplete="off"
            enterKeyHint="search"
            className="h-12 min-w-0 flex-1 appearance-none rounded-none border-0 bg-transparent px-3 text-base text-[#141414] shadow-none placeholder:text-[#6b6560] focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="focus-visible:ring-gold flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#141414] transition-colors hover:bg-[#f1ece1] focus-visible:outline-none focus-visible:ring-2"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </form>

        <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter by type">
          {KINDS.map((option) => {
            const active = kind === option.key;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={active}
                onClick={() => setKind(option.key)}
                className={`focus-visible:ring-gold inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                  active
                    ? 'bg-gold text-ink'
                    : 'border border-white/20 text-white/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                {option.label}
                <span className={active ? 'text-ink/60' : 'text-white/45'}>
                  {counts[option.key]}
                </span>
              </button>
            );
          })}
        </div>
      </PageHero>

      <section className="mx-auto max-w-[120rem] px-4 py-10 sm:px-[30px] sm:py-14">
        <Reveal variant="gallery" speed={1.4}>
          <p data-reveal-head aria-live="polite" className="text-muted text-sm font-semibold">
            {term
              ? `${visible.length} ${visible.length === 1 ? 'category matches' : 'categories match'} “${query.trim()}”`
              : `${visible.length} ${visible.length === 1 ? 'category' : 'categories'} · ${types} types of shop and service`}
          </p>

          {visible.length === 0 ? (
            <div className="border-border bg-surface mt-6 rounded-[1.75rem] border px-6 py-12 text-center sm:px-12">
              <p className="text-ink text-xl font-extrabold tracking-tight sm:text-2xl">
                Nothing here matches “{query.trim()}” yet.
              </p>
              <p className="text-muted mx-auto mt-3 max-w-xl text-[0.9375rem] font-semibold leading-[1.75]">
                A concierge can still find it. Describe what you need and get a price and a time
                before anything is bought.
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Link
                  href="/ask"
                  className="bg-gold text-ink hover:bg-gold/90 focus-visible:ring-gold inline-flex h-12 items-center gap-2 rounded-full px-6 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                >
                  Ask a concierge <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={reset}
                  className="border-border-strong text-ink hover:bg-bg focus-visible:ring-gold inline-flex h-12 items-center rounded-full border px-6 text-sm font-bold focus-visible:outline-none focus-visible:ring-2"
                >
                  Show all categories
                </button>
              </div>
            </div>
          ) : (
            <ul className="mt-6 grid grid-flow-dense grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4">
              {visible.map((category, index) => (
                <CategoryCard
                  key={category.id}
                  category={category}
                  term={term}
                  wide={index === 0}
                  priority={index < 4}
                  /* Only the first rows play the entrance (and wait for their
                     photos); the rest are below the fold and simply show. */
                  reveal={index < 8}
                />
              ))}
            </ul>
          )}
        </Reveal>
      </section>

      {/* Left out while the empty state already offers the concierge. */}
      <section
        hidden={visible.length === 0}
        className="mx-auto max-w-[120rem] px-4 pb-16 sm:px-[30px] sm:pb-20"
      >
        <div className="text-ink relative overflow-hidden rounded-[2rem] bg-[#FDD128] px-6 py-10 sm:px-12 sm:py-14 lg:flex lg:items-center lg:justify-between lg:gap-12">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-40 -right-24 h-[26rem] w-[26rem] rounded-full bg-white/30 blur-3xl"
          />
          <div className="relative max-w-2xl">
            <p className="text-ink/70 text-xs font-extrabold uppercase tracking-[0.2em]">
              Not on the list?
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.75rem]">
              Ask a concierge for anything.
            </h2>
            <p className="text-ink/75 mt-3 text-base font-semibold leading-[1.75]">
              Describe what you need. A concierge quotes a price and a time, and nothing is bought
              until you approve it.
            </p>
          </div>
          <div className="relative mt-8 flex flex-wrap gap-3 lg:mt-0 lg:shrink-0">
            <Link
              href="/ask"
              className="bg-ink focus-visible:ring-ink inline-flex h-12 items-center gap-2 rounded-full px-6 text-sm font-bold text-white transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDD128]"
            >
              Ask a concierge <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/merchants"
              className="border-ink/25 focus-visible:ring-ink inline-flex h-12 items-center rounded-full border px-6 text-sm font-bold transition-colors hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2"
            >
              List your business
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/*
 * One tall photograph card, as on the homepage: the photo fills it and a
 * dark fade at the foot carries the words. On a phone it is a compact tile
 * (name and how many types); the description, the subcategories and the
 * button join as the card grows. While searching, the matching
 * subcategories come first, in gold.
 */
function CategoryCard({
  category,
  term,
  wide,
  priority,
  reveal,
}: {
  category: ExplorerCategory;
  term: string;
  wide: boolean;
  priority: boolean;
  reveal: boolean;
}) {
  /* An uploaded photo, else the category's own stock photo. A category with
     neither shows its mark rather than another category's photo. */
  const src =
    category.imageUrl ||
    category.image ||
    (CATEGORY_IMAGE_MAP[category.id] ? getCategoryImage(category.id) : null);
  const Icon = FALLBACK_ICON[category.icon] ?? Store;
  const subs = category.subcategories;
  const hits = term ? subs.filter((sub) => subcategoryMatches(sub, term)) : [];
  const ordered = hits.length ? [...hits, ...subs.filter((sub) => !hits.includes(sub))] : subs;
  const shown = ordered.slice(0, wide ? 7 : 3);
  const more = subs.length - shown.length;
  const count = `${subs.length} ${subs.length === 1 ? 'type' : 'types'}`;
  /* Under the chips' breakpoint the gold line names the first few types. */
  const meta = hits.length
    ? `Matches ${hits.map((sub) => sub.name).join(', ')}`
    : subs
        .slice(0, 3)
        .map((sub) => sub.name)
        .join(' · ');

  return (
    <li data-reveal-item={reveal ? '' : undefined} className={wide ? 'col-span-2' : undefined}>
      <Link
        href={discoverCategoryHref(category.id)}
        aria-label={`${category.name}, ${hits.length ? meta : count}`}
        className="focus-visible:ring-gold focus-visible:ring-offset-bg group relative flex h-[13.5rem] flex-col justify-end overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-[#3B2E1B] via-[#241D13] to-[#14120E] text-white ring-1 ring-black/5 transition-shadow duration-300 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:h-[20rem] sm:rounded-[1.75rem] lg:h-[25rem] 2xl:h-[27rem] dark:ring-white/[0.07]"
      >
        {src ? (
          <Image
            src={src}
            alt=""
            fill
            sizes={
              wide
                ? '(min-width: 1536px) 50vw, (min-width: 1024px) 66vw, 100vw'
                : '(min-width: 1536px) 25vw, (min-width: 1024px) 33vw, 50vw'
            }
            priority={priority}
            unoptimized={src.startsWith('http')}
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
        ) : (
          <span
            aria-hidden="true"
            className="text-gold/45 absolute inset-x-0 top-[18%] flex justify-center"
          >
            <Icon className="h-14 w-14 sm:h-20 sm:w-20" strokeWidth={1.25} />
          </span>
        )}
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-[#0b0907] via-[#0b0907]/75 via-40% to-transparent to-80%"
        />

        {subs.length > 0 && (
          <span className="text-ink absolute left-3 top-3 rounded-full bg-white px-2.5 py-1 text-[0.5625rem] font-extrabold uppercase tracking-[0.16em] sm:left-4 sm:top-4 sm:px-3 sm:py-1.5 sm:text-[0.625rem]">
            {count}
          </span>
        )}

        <span className="relative block p-4 sm:p-6">
          {meta && (
            <span
              className={`text-gold block truncate text-xs font-semibold sm:text-[0.8125rem] ${
                hits.length ? '' : 'lg:hidden'
              }`}
            >
              {meta}
            </span>
          )}
          <span
            className={`mt-1 block font-extrabold leading-[1.1] tracking-tight ${
              wide
                ? 'text-xl sm:text-3xl lg:text-[2.25rem]'
                : 'text-[1.0625rem] sm:text-2xl lg:text-[1.75rem]'
            }`}
          >
            {category.name}
          </span>
          {category.desc && (
            <span
              className={`mt-2 hidden text-sm font-medium leading-relaxed text-white/70 sm:line-clamp-2 ${
                wide ? 'max-w-xl' : ''
              }`}
            >
              {category.desc}
            </span>
          )}
          {shown.length > 0 && (
            <span className="mt-4 hidden flex-wrap gap-1.5 lg:flex">
              {shown.map((sub) => (
                <span
                  key={sub.id}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    hits.includes(sub)
                      ? 'bg-gold text-ink'
                      : 'border border-white/15 bg-white/10 text-white/85 backdrop-blur'
                  }`}
                >
                  {sub.name}
                </span>
              ))}
              {more > 0 && (
                <span className="px-1 py-1 text-xs font-bold text-white/60">+{more} more</span>
              )}
            </span>
          )}
          <span
            className={`mt-5 hidden h-11 items-center justify-between rounded-full border border-white/25 bg-white/10 pl-5 pr-1.5 text-sm font-bold backdrop-blur transition-colors group-hover:bg-white/20 sm:flex ${
              wide ? 'sm:max-w-xs' : ''
            }`}
          >
            See who serves you
            <span className="bg-gold text-ink flex h-8 w-8 items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5">
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}
