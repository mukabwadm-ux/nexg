'use client';

import {
  ArrowRight,
  ArrowUpRight,
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

/** The merchant sign-up form on the For merchants page. */
const LIST_BUSINESS_HREF = '/merchants#register';

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

/* Marks for a category (category_config.icon); a shop front for the rest. */
const CATEGORY_ICON: Record<string, LucideIcon> = { Compass, Gift, Plane, Ticket };

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
 * All categories: a dark, gold-edged hero card with the search and the
 * order-type chips in it, a count line, then every category as a photograph
 * card in a four-column grid (the first runs two columns wide), and a
 * gold-edged concierge band at the foot. Each card is one link to Discovery
 * for that category; the subcategories on it are labels, not links, because
 * they all led to the same place.
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

  const types = visible.reduce((sum, category) => sum + category.subcategories.length, 0);
  const reset = () => {
    setQuery('');
    setKind('all');
  };

  return (
    <div className="mx-auto max-w-[90rem] px-4 sm:px-8">
      <section className="pt-6 sm:pt-8" aria-labelledby="categories-title">
        <div className="bg-ink border-gold/60 relative overflow-hidden rounded-[1.75rem] border px-5 py-10 text-white sm:rounded-[2rem] sm:px-12 sm:py-14 lg:px-16 lg:py-16">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-white/[0.08]"
          />
          <span
            aria-hidden="true"
            className="bg-gold/10 pointer-events-none absolute -right-40 -top-48 h-[30rem] w-[30rem] rounded-full blur-3xl"
          />
          <div className="relative max-w-2xl">
            <p className="text-gold text-[0.6875rem] font-extrabold uppercase tracking-[0.2em]">
              {say('cats.eyebrow')}
            </p>
            <h1
              id="categories-title"
              className="mt-4 text-[2.25rem]/[1.08] font-extrabold tracking-tight sm:text-5xl/[1.06] lg:text-[3.5rem]/[1.04]"
            >
              {say('cats.title')} <span className="text-gold">{say('cats.gold')}</span>
            </h1>
            <p className="mt-5 max-w-xl text-[0.9375rem] font-medium leading-[1.7] text-white/65 sm:text-base">
              {say('cats.lede', { count: categories.length })}
            </p>

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
              className="border-gold/45 focus-within:border-gold focus-within:ring-gold/40 mt-8 flex max-w-xl items-center rounded-full border bg-white/[0.06] p-1 transition-colors focus-within:ring-2"
            >
              <Search className="ml-3.5 h-4 w-4 shrink-0 text-white/60" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={say('cats.searchPlaceholder')}
                aria-label={say('cats.searchLabel')}
                autoComplete="off"
                enterKeyHint="search"
                className="h-11 min-w-0 flex-1 appearance-none rounded-none border-0 bg-transparent px-3 text-base text-white shadow-none placeholder:text-white/50 focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-[0.9375rem] [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={say('cats.clear')}
                  className="focus-visible:ring-gold mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              <button
                type="submit"
                aria-label={say('cats.searchLabel')}
                className="bg-gold text-ink hover:bg-gold-light focus-visible:ring-offset-ink flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
              >
                <Search className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
              </button>
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
                    className={`focus-visible:ring-gold focus-visible:ring-offset-ink inline-flex h-10 items-center rounded-full px-4 text-[0.8125rem] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                      active
                        ? 'bg-gold text-ink'
                        : 'border border-white/20 bg-white/[0.04] text-white/85 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {say(`cats.kind.${option}`)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="pt-8 sm:pt-10" aria-label={say('cats.eyebrow')}>
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
            <div className="border-border bg-surface mt-5 rounded-[1.75rem] border px-6 py-12 text-center sm:px-12">
              <p className="text-ink text-xl font-extrabold tracking-tight sm:text-2xl">
                {say('cats.empty.title', { query: query.trim() })}
              </p>
              <p className="text-muted mx-auto mt-3 max-w-xl text-[0.9375rem] font-semibold leading-[1.75]">
                {say('cats.empty.body')}
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Link
                  href="/ask"
                  className="bg-gold text-ink hover:bg-gold-light focus-visible:ring-gold inline-flex h-12 items-center gap-2 rounded-full px-6 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
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
            <ul className="mt-5 grid grid-flow-dense grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
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
        aria-labelledby="categories-cta"
        className="pb-16 pt-12 sm:pb-20 sm:pt-16"
      >
        <div className="bg-ink border-gold/60 relative overflow-hidden rounded-[1.75rem] border px-6 py-9 text-white sm:px-10 sm:py-10 lg:flex lg:items-center lg:justify-between lg:gap-12">
          <span
            aria-hidden="true"
            className="from-gold/15 pointer-events-none absolute inset-0 bg-gradient-to-r via-transparent to-transparent"
          />
          <div className="relative max-w-2xl">
            <p className="text-gold/80 text-[0.6875rem] font-extrabold uppercase tracking-[0.2em]">
              {say('cats.cta.eyebrow')}
            </p>
            <h2
              id="categories-cta"
              className="text-gold mt-2 text-[1.75rem]/[1.15] font-extrabold tracking-tight sm:text-4xl"
            >
              {say('cats.cta.title')}
            </h2>
            <p className="mt-3 max-w-xl text-[0.9375rem] font-medium leading-[1.7] text-white/65">
              {say('cats.cta.body')}
            </p>
          </div>
          <div className="relative mt-7 flex flex-wrap gap-3 lg:mt-0 lg:shrink-0">
            <Link
              href="/ask"
              className="bg-gold text-ink hover:bg-gold-light focus-visible:ring-offset-ink inline-flex h-11 items-center gap-1.5 rounded-full px-5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
            >
              {say('cats.askConcierge')} <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href={LIST_BUSINESS_HREF}
              className="focus-visible:ring-gold focus-visible:ring-offset-ink inline-flex h-11 items-center rounded-full border border-white/25 px-5 text-sm font-bold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              {say('cats.cta.list')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/*
 * One photograph card: the photo fills it, a dark fade carries the words,
 * and a "N types" badge sits top-left. On a phone it is a compact tile (name
 * and the first few types); the description, the type chips and the "See who
 * serves you" pill join as the card grows. While searching, the matching
 * types come first, in gold.
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
  const Icon = CATEGORY_ICON[category.icon] ?? Store;
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
  const shown = chips.slice(0, wide ? 6 : 3);
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
        className="focus-visible:ring-gold focus-visible:ring-offset-bg group relative flex h-[13.5rem] flex-col justify-end overflow-hidden rounded-[1.25rem] border border-black/5 bg-gradient-to-br from-[#3B2E1B] via-[#241D13] to-[#14120E] text-white transition-shadow duration-300 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:h-[19rem] sm:rounded-[1.5rem] lg:h-[20rem] dark:border-white/10"
      >
        {src ? (
          <Image
            src={src}
            alt=""
            fill
            sizes={
              wide
                ? '(min-width: 1280px) 50vw, (min-width: 1024px) 66vw, 100vw'
                : '(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, 50vw'
            }
            priority={priority}
            /* Vercel's image resizer is out of quota (402): serve the file. */
            unoptimized
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
          className="absolute inset-0 bg-gradient-to-t from-[#0b0907] via-[#0b0907]/80 via-45% to-[#0b0907]/10"
        />

        {subs.length > 0 && (
          <span className="absolute left-3 top-3 rounded-full border border-white/25 bg-black/50 px-2.5 py-1 text-[0.5625rem] font-extrabold uppercase tracking-[0.16em] text-white backdrop-blur sm:left-4 sm:top-4 sm:text-[0.625rem]">
            {count}
          </span>
        )}

        <span className="relative block p-4 sm:p-5">
          <span
            className={`block font-extrabold leading-[1.12] tracking-tight ${
              wide
                ? 'text-xl sm:text-[1.75rem] lg:text-[2rem]'
                : 'text-[1.0625rem] sm:text-xl lg:text-[1.375rem]'
            }`}
          >
            {category.name}
          </span>
          {category.desc && (
            <span className="mt-1 hidden truncate text-[0.8125rem] font-medium text-white/65 sm:block">
              {category.desc}
            </span>
          )}
          {meta && (
            <span
              className={`text-gold mt-1 block truncate text-xs font-semibold sm:text-[0.8125rem] ${
                hits.length ? '' : 'sm:hidden'
              }`}
            >
              {meta}
            </span>
          )}
          {shown.length > 0 && (
            <span className="mt-3 hidden max-h-[3.75rem] flex-wrap gap-1.5 overflow-hidden sm:flex">
              {shown.map((sub) => (
                <span
                  key={sub.key}
                  className={`max-w-full truncate rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold ${
                    sub.hit
                      ? 'bg-gold text-ink'
                      : 'border border-white/15 bg-white/10 text-white/85 backdrop-blur'
                  }`}
                >
                  {sub.label}
                </span>
              ))}
              {more > 0 && (
                <span className="px-1 py-1 text-[0.6875rem] font-bold text-white/60">
                  {say('cats.more', { count: more })}
                </span>
              )}
            </span>
          )}
          <span
            className={`mt-4 hidden h-10 items-center justify-between rounded-full border border-white/20 bg-white/10 pl-4 pr-1 text-[0.8125rem] font-bold backdrop-blur transition-colors group-hover:bg-white/20 sm:flex ${
              wide ? 'sm:max-w-sm' : ''
            }`}
          >
            <span className="flex items-center gap-1.5">
              {say('cats.seeWho')}
              <ArrowRight
                className="text-gold h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
            <span className="bg-gold text-ink flex h-8 w-8 items-center justify-center rounded-full">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}
