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
import { translator } from '@/lib/i18n/dictionaries';

import { type CATEGORY_STRING_KEYS } from './strings';

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
  /** The English name and description, still searchable when shown translated. */
  english?: string;
  subcategories: {
    id: string;
    name: string;
    english?: string;
    /** The heading it sits under (Wellness: "Spa & Massage"). */
    group?: string;
    englishGroup?: string;
    fields?: string[];
    fulfillmentHint?: string;
  }[];
}

type Kind = 'all' | 'menu' | 'products' | 'services';
type Subcategory = ExplorerCategory['subcategories'][number];

/** How a category's merchants are ordered from (category_config.card_kind). */
const KINDS: readonly Kind[] = ['all', 'menu', 'products', 'services'];

export type CategoryStrings = Record<string, string>;
type Say = (
  key: (typeof CATEGORY_STRING_KEYS)[number],
  vars?: Record<string, string | number>,
) => string;

/* English when a string was not passed (tests, or a page that did not translate). */
function sayer(strings: CategoryStrings): Say {
  return (key, vars) => {
    let text = strings[key] ?? translator('en')(key);
    for (const [name, value] of Object.entries(vars ?? {})) {
      text = text.split(`{${name}}`).join(String(value));
    }
    return text;
  };
}

/* Marks for a category with no photograph of its own (category_config.icon). */
const FALLBACK_ICON: Record<string, LucideIcon> = { Compass, Gift, Plane, Ticket };

const has = (text: string | undefined, query: string) =>
  Boolean(text && text.toLowerCase().includes(query));

const subcategoryMatches = (sub: Subcategory, query: string) =>
  has(sub.name, query) ||
  has(sub.english, query) ||
  has(sub.group, query) ||
  has(sub.englishGroup, query) ||
  Boolean(sub.fields?.some((field) => has(field, query))) ||
  has(sub.fulfillmentHint, query);

/* A type under a heading reads "Spa & Massage · Swedish" where it stands alone. */
const label = (sub: Subcategory, withGroup: boolean) =>
  withGroup && sub.group ? `${sub.group} · ${sub.name}` : sub.name;

const categoryMatches = (category: ExplorerCategory, query: string) =>
  has(category.name, query) ||
  has(category.desc, query) ||
  has(category.english, query) ||
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
export function CategoryExplorer({
  categories,
  strings = {},
}: {
  categories: ExplorerCategory[];
  strings?: CategoryStrings;
}) {
  const say = React.useMemo(() => sayer(strings), [strings]);
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
        eyebrow={say('cats.eyebrow')}
        compact
        title={say('cats.title')}
        gold={say('cats.gold')}
        lede={say('cats.lede', { count: categories.length })}
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
            placeholder={say('cats.searchPlaceholder')}
            aria-label={say('cats.searchLabel')}
            autoComplete="off"
            enterKeyHint="search"
            className="h-12 min-w-0 flex-1 appearance-none rounded-none border-0 bg-transparent px-3 text-base text-[#141414] shadow-none placeholder:text-[#6b6560] focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={say('cats.clear')}
              className="focus-visible:ring-gold flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#141414] transition-colors hover:bg-[#f1ece1] focus-visible:outline-none focus-visible:ring-2"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </form>

        <div
          className="mt-5 flex flex-wrap gap-2"
          role="group"
          aria-label={say('cats.filterLabel')}
        >
          {KINDS.map((option) => {
            const active = kind === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => setKind(option)}
                className={`focus-visible:ring-gold inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                  active
                    ? 'bg-gold text-ink'
                    : 'border border-white/20 text-white/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                {say(`cats.kind.${option}`)}
                <span className={active ? 'text-ink/60' : 'text-white/45'}>{counts[option]}</span>
              </button>
            );
          })}
        </div>
      </PageHero>

      <section className="mx-auto max-w-[120rem] px-4 py-10 sm:px-[30px] sm:py-14">
        <Reveal variant="gallery" speed={1.4}>
          <p data-reveal-head aria-live="polite" className="text-muted text-sm font-semibold">
            {term
              ? say(visible.length === 1 ? 'cats.matchOne' : 'cats.matchMany', {
                  count: visible.length,
                  query: query.trim(),
                })
              : say(visible.length === 1 ? 'cats.summaryOne' : 'cats.summaryMany', {
                  count: visible.length,
                  types,
                })}
          </p>

          {visible.length === 0 ? (
            <div className="border-border bg-surface mt-6 rounded-[1.75rem] border px-6 py-12 text-center sm:px-12">
              <p className="text-ink text-xl font-extrabold tracking-tight sm:text-2xl">
                {say('cats.empty.title', { query: query.trim() })}
              </p>
              <p className="text-muted mx-auto mt-3 max-w-xl text-[0.9375rem] font-semibold leading-[1.75]">
                {say('cats.empty.body')}
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Link
                  href="/ask"
                  className="bg-gold text-ink hover:bg-gold/90 focus-visible:ring-gold inline-flex h-12 items-center gap-2 rounded-full px-6 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                >
                  {say('cats.askConcierge')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={reset}
                  className="border-border-strong text-ink hover:bg-bg focus-visible:ring-gold inline-flex h-12 items-center rounded-full border px-6 text-sm font-bold focus-visible:outline-none focus-visible:ring-2"
                >
                  {say('cats.showAll')}
                </button>
              </div>
            </div>
          ) : (
            <ul className="mt-6 grid grid-flow-dense grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4">
              {visible.map((category, index) => (
                <CategoryCard
                  key={category.id}
                  category={category}
                  say={say}
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
              {say('cats.cta.eyebrow')}
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.75rem]">
              {say('cats.cta.title')}
            </h2>
            <p className="text-ink/75 mt-3 text-base font-semibold leading-[1.75]">
              {say('cats.cta.body')}
            </p>
          </div>
          <div className="relative mt-8 flex flex-wrap gap-3 lg:mt-0 lg:shrink-0">
            <Link
              href="/ask"
              className="bg-ink focus-visible:ring-ink inline-flex h-12 items-center gap-2 rounded-full px-6 text-sm font-bold text-white transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDD128]"
            >
              {say('cats.askConcierge')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/merchants"
              className="border-ink/25 focus-visible:ring-ink inline-flex h-12 items-center rounded-full border px-6 text-sm font-bold transition-colors hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2"
            >
              {say('cats.cta.list')}
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
  say,
  term,
  wide,
  priority,
  reveal,
}: {
  category: ExplorerCategory;
  say: Say;
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
  /* Wellness lists 45 types under 9 headings: unmatched types show as their
     heading, once; a matched type shows under its heading. */
  const seen = new Set<string>();
  const chips = ordered.flatMap((sub) => {
    const hit = hits.includes(sub);
    if (hit || !sub.group) return [{ key: sub.id, label: label(sub, hit), hit }];
    if (seen.has(sub.group)) return [];
    seen.add(sub.group);
    return [{ key: `group:${sub.group}`, label: sub.group, hit: false }];
  });
  const shown = chips.slice(0, wide ? 7 : 3);
  const more = chips.length - shown.length;
  const count =
    subs.length === 1 ? say('cats.typeOne') : say('cats.typeMany', { count: subs.length });
  /* Under the chips' breakpoint the gold line names the first few types. */
  const meta = hits.length
    ? say('cats.matches', { list: hits.map((sub) => label(sub, true)).join(', ') })
    : chips
        .slice(0, 3)
        .map((chip) => chip.label)
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
                  key={sub.key}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    sub.hit
                      ? 'bg-gold text-ink'
                      : 'border border-white/15 bg-white/10 text-white/85 backdrop-blur'
                  }`}
                >
                  {sub.label}
                </span>
              ))}
              {more > 0 && (
                <span className="px-1 py-1 text-xs font-bold text-white/60">
                  {say('cats.more', { count: more })}
                </span>
              )}
            </span>
          )}
          <span
            className={`mt-5 hidden h-11 items-center justify-between rounded-full border border-white/25 bg-white/10 pl-5 pr-1.5 text-sm font-bold backdrop-blur transition-colors group-hover:bg-white/20 sm:flex ${
              wide ? 'sm:max-w-xs' : ''
            }`}
          >
            {say('cats.seeWho')}
            <span className="bg-gold text-ink flex h-8 w-8 items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5">
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}
