'use client';

import { useLocation } from '@nexg/location';
import { cn } from '@nexg/ui';
import {
  ArrowRight,
  BedDouble,
  ChevronDown,
  Compass,
  Flower2,
  Gem,
  Gift,
  Headphones,
  MapPin,
  Menu,
  Pill,
  Plane,
  Search,
  Shirt,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Store,
  CalendarDays,
  User,
  UtensilsCrossed,
  Wallet,
  Wine,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import type { SearchGroup, SearchItem } from '@/app/api/search/route';
import type { Locale } from '@/lib/i18n/dictionaries';
import { POPULAR_SEARCH_TOPICS, rankPopularSearches, topicForSearch } from '@/lib/popular-searches';

import { Logo } from '../logo';
import { HeroVideo } from './hero-video';
import { SiteMenu } from '../site-menu';
import { ThemeToggle } from '../theme/theme';

/**
 * The homepage hero: "Everything You Need. Wherever You Stay."
 *
 * Built from the two supplied comps (desktop and phone). It carries its own
 * navigation rather than the global SiteHeader, because the comp puts the
 * nav on the photograph: logo, where you are, your account and the menu.
 * That nav stays fixed and picks up a dark ground once the photo has
 * scrolled away, so the menu is never out of reach further down the page.
 *
 * Every control does something real:
 *   - the location pill is the same place the rest of the site uses, and
 *     opens the same sheet. On a phone that has already allowed location
 *     it is the exact spot, read when the page opened.
 *   - the search answers as soon as a letter is typed (/api/search) and Enter
 *     with nothing highlighted goes to Explore with the query.
 *   - popular searches are the four most searched topics of the last 30
 *     days (lib/popular-searches.ts); they and "Plan your trip" go where
 *     they say.
 */

export interface HeroCopy {
  eyebrow: string;
  titleLine1: string;
  titleLine2: string;
  lede: string;
  searchPlaceholder: string;
  searchButton: string;
  popular: string;
  plan: string;
  signIn: string;
  scroll: string;
  promptTitle: string;
  promptBody: string;
  promptCta: string;
  promptLater: string;
}

interface City {
  slug: string;
  name: string;
}

/** Results start with the first letter typed. */
const MIN_CHARS = 1;
/** Session flag: the visitor has answered or dismissed the hero's location prompt. */
const PROMPT_KEY = 'nexg.loc.heroPrompt';

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Zap, title: 'Speed', body: 'Fast, reliable and convenient' },
  { icon: ShieldCheck, title: 'Verified Partners', body: 'Trusted and quality service providers' },
  { icon: Headphones, title: '24/7 Support', body: 'Personal assistance anytime' },
  { icon: Wallet, title: 'Secure Payments', body: 'M-Pesa and pay on delivery' },
  { icon: Gem, title: 'NexG Plus', body: 'Exclusive access and priority service' },
];

const TOPIC_ICON: Record<string, LucideIcon> = {
  airport: Plane,
  stays: BedDouble,
  spa: Flower2,
  restaurants: UtensilsCrossed,
  groceries: ShoppingBasket,
  pharmacy: Pill,
  drinks: Wine,
  flowers: Gift,
  laundry: Shirt,
  trip: Compass,
};

/**
 * Count a hero search against its topic, at most once per topic per browser
 * per day, without holding up the navigation. Only the topic is sent, never
 * the words; a search that fits no topic is not sent at all.
 */
function recordSearch(query: string) {
  const topic = topicForSearch(query);
  if (!topic || typeof navigator === 'undefined') return;
  const today = new Date().toISOString().slice(0, 10);
  const key = `nexg.search-hit.${topic}`;
  try {
    if (window.localStorage.getItem(key) === today) return;
    window.localStorage.setItem(key, today);
  } catch {
    /* Private mode or storage blocked: count it anyway. */
  }
  const body = JSON.stringify({ topic });
  if (!navigator.sendBeacon?.('/api/search-hit', new Blob([body], { type: 'application/json' }))) {
    void fetch('/api/search-hit', { method: 'POST', body, keepalive: true }).catch(() => undefined);
  }
}

const KIND_ICON: Record<SearchItem['kind'], LucideIcon> = {
  service: Sparkles,
  merchant: Store,
  stay: BedDouble,
  day: CalendarDays,
  event: CalendarDays,
};

export function Hero({
  copy,
  cities,
  locale,
  popularTopics,
}: {
  copy: HeroCopy;
  cities: City[];
  locale: Locale;
  /** Topic ids, most searched first (rankPopularSearches). */
  popularTopics?: string[];
}) {
  const { place, chip, openSheet, sheetOpen } = useLocation();
  const router = useRouter();
  /* The city the search is scoped to: the one in the location pill. The
     pill (and the menu) is where it is changed, so the search bar has no
     picker of its own. */
  const placeCity = cities.some((c) => c.slug === place?.city_slug) ? place!.city_slug! : null;
  const citySlug = placeCity ?? cities[0]?.slug ?? 'nairobi';

  /* A place guessed from the connection is a city, not an area: showing its
     zone ("CBD") would claim we know where they are. */
  const where =
    chip === 'empty'
      ? 'Set location'
      : chip === 'city'
        ? (place?.city ?? 'Nairobi')
        : (place?.zone ?? place?.city ?? place?.label ?? 'Nairobi');
  /* No exact spot yet: nothing at all, or only the connection's guess. */
  const needsSpot = chip === 'empty' || chip === 'city';

  const popular = (popularTopics ?? rankPopularSearches()).flatMap((id) => {
    const topic = POPULAR_SEARCH_TOPICS.find((t) => t.id === id);
    if (!topic) return [];
    return [
      {
        icon: TOPIC_ICON[id] ?? Search,
        label: topic.label,
        href: topic.href ?? `/explore?city=${citySlug}&category=${topic.category}`,
      },
    ];
  });

  return (
    <section className="relative isolate z-50 flex min-h-[100svh] flex-col overflow-hidden bg-[#0b0907] text-white">
      {/* ─────────────────────────────────────────────── the photograph */}
      <div className="absolute inset-x-0 top-0 -z-10 h-[36rem] sm:h-[44rem] lg:inset-y-0 lg:h-auto">
        {/* Three clips in turn: the kitchen, the lobby, the room. */}
        <HeroVideo />
        {/* Phone: dark from the middle down, where the text sits. */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/70 to-[#0b0907] lg:hidden" />
        {/* Desktop: the text is centred, so the veil is darkest in the middle
            behind it and lighter towards the edges, where the clip reads. */}
        <div className="absolute inset-0 hidden bg-[#0b0907]/60 lg:block" />
        <div className="absolute inset-0 hidden bg-[radial-gradient(ellipse_55%_60%_at_50%_50%,rgba(11,9,7,0.75),transparent)] lg:block" />
        <div className="absolute inset-x-0 bottom-0 hidden h-40 bg-gradient-to-t from-[#0b0907] to-transparent lg:block" />
      </div>

      <HeroNav
        where={where}
        needsSpot={needsSpot}
        sheetOpen={sheetOpen}
        onWhere={() => openSheet('hero')}
        locale={locale}
        copy={copy}
      />

      {/* ─────────────────────────────────────────────── the message */}
      {/* Fills what the nav and the strip leave of one screen, centred in it. */}
      <div className="mx-auto flex w-full max-w-[120rem] flex-1 flex-col items-center justify-center px-5 pb-8 pt-[6.5rem] text-center sm:px-[30px] sm:pt-28 lg:pb-12 lg:pt-32">
        <p className="text-gold text-[0.625rem] font-bold uppercase tracking-[0.3em] sm:text-[0.6875rem]">
          {copy.eyebrow}
        </p>
        <h1
          aria-label={`${copy.titleLine1} ${copy.titleLine2}`}
          className="mt-4 max-w-[48rem] text-[2.125rem] font-extrabold leading-[1.15] tracking-tight sm:text-5xl lg:text-[4rem]"
        >
          <span className="block">{copy.titleLine1}</span>
          <span className="text-gold block">{copy.titleLine2}</span>
        </h1>
        <p className="mt-5 max-w-xl text-[0.9375rem] leading-[1.7] text-white/85 sm:text-lg">
          {copy.lede}
        </p>

        <HeroSearch
          copy={copy}
          citySlug={citySlug}
          onSubmit={(q) =>
            router.push(`/explore?city=${citySlug}${q ? `&q=${encodeURIComponent(q)}` : ''}`)
          }
        />

        {/* Popular searches */}
        <div className="mt-6 flex w-full flex-col items-center gap-3 lg:w-auto lg:flex-row lg:gap-3">
          <p className="text-[0.8125rem] font-semibold text-white/85">{copy.popular}</p>
          {/* One row: it scrolls sideways on a phone rather than taking two. */}
          <ul className="-mx-5 flex max-w-[calc(100%+2.5rem)] gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:max-w-none sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
            {popular.map(({ icon: Icon, label, href }) => (
              <li key={label}>
                <Link
                  href={href}
                  className="hover:border-gold focus-visible:ring-gold flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/25 bg-black/35 px-3.5 text-[0.8125rem] font-semibold backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ─────────────────────────────────────────────── why NexG */}
      <div className="relative border-t border-white/10 bg-black/40 backdrop-blur">
        <ul className="mx-auto grid max-w-[120rem] grid-cols-5 px-2 py-3 sm:px-[30px] lg:py-4">
          {FEATURES.map(({ icon: Icon, title, body }, i) => (
            <li
              key={title}
              className={cn(
                'flex flex-col items-center gap-1 px-1 text-center lg:flex-row lg:items-center lg:gap-3 lg:px-5 lg:text-left',
                i > 0 && 'border-l border-white/10',
              )}
            >
              <Icon
                className="text-gold h-5 w-5 shrink-0 lg:h-7 lg:w-7"
                aria-hidden="true"
                strokeWidth={1.5}
              />
              <span>
                <span className="block text-[0.6875rem] font-bold leading-tight sm:text-xs lg:text-sm">
                  {title}
                </span>
                <span className="mt-0.5 block text-[0.5625rem] leading-snug text-white/65 sm:text-[0.6875rem] lg:text-xs">
                  {body}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <a
        href="#popular"
        className="flex flex-col items-center pb-2 text-[0.6875rem] text-white/70 lg:hidden"
      >
        <ChevronDown className="text-gold h-4 w-4" aria-hidden="true" />
        {copy.scroll}
      </a>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════ nav */

function HeroNav({
  where,
  needsSpot,
  sheetOpen,
  onWhere,
  locale,
  copy,
}: {
  where: string;
  needsSpot: boolean;
  sheetOpen: boolean;
  onWhere: () => void;
  locale: Locale;
  copy: HeroCopy;
}) {
  /* Transparent on the photograph; a dark ground once it has scrolled away. */
  const [solid, setSolid] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 80);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /*
   * The first-visit question, asked where the answer lives.
   *
   * Instead of a banner above the hero or a sheet over it before the page
   * has been seen, a small card points at the location pill a moment after
   * load — only while there is no exact spot, and only until it is used or
   * dismissed this visit.
   */
  const [prompt, setPrompt] = React.useState(false);
  React.useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.sessionStorage.getItem(PROMPT_KEY) === '1';
    } catch {
      /* ignore */
    }
    if (!needsSpot || dismissed) {
      setPrompt(false);
      return;
    }
    const timer = setTimeout(() => setPrompt(true), 1200);
    return () => clearTimeout(timer);
  }, [needsSpot]);

  const dismissPrompt = () => {
    setPrompt(false);
    try {
      window.sessionStorage.setItem(PROMPT_KEY, '1');
    } catch {
      /* ignore */
    }
  };
  const showPrompt = prompt && needsSpot && !sheetOpen && !solid;

  const round =
    'focus-visible:ring-gold flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/55 backdrop-blur transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 sm:h-12 sm:w-12';

  return (
    <nav
      aria-label="Main"
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
        solid ? 'bg-[#0b0907] shadow-lg' : 'bg-transparent',
      )}
    >
      <div
        className={cn(
          'mx-auto flex max-w-[120rem] items-center justify-between gap-3 px-4 transition-[padding] sm:px-[30px]',
          solid ? 'py-2' : 'py-3 sm:py-4',
        )}
      >
        <Link href="/" aria-label="NexG Concierge, home" className="shrink-0">
          <Logo
            onDark
            priority
            className={cn('w-auto transition-[height]', solid ? 'h-11 sm:h-12' : 'h-16 sm:h-20')}
          />
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="relative">
            {showPrompt && (
              <span
                aria-hidden="true"
                className="ring-gold pointer-events-none absolute inset-0 animate-ping rounded-full opacity-60 ring-2"
              />
            )}
            <button
              type="button"
              onClick={() => {
                dismissPrompt();
                onWhere();
              }}
              aria-label={`Deliver to ${where}. Change`}
              className="focus-visible:ring-gold flex h-10 max-w-[11rem] items-center gap-2 rounded-full border border-white/15 bg-black/55 pl-3.5 pr-3 text-sm font-semibold backdrop-blur transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 sm:h-12 sm:max-w-[16rem] sm:gap-2.5 sm:pl-4 sm:pr-3.5 sm:text-[0.9375rem]"
            >
              <MapPin
                className="text-gold h-4 w-4 shrink-0 sm:h-5 sm:w-5"
                aria-hidden="true"
                fill="currentColor"
                stroke="#0b0907"
              />
              <span className="truncate">{where}</span>
              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>

            {showPrompt && (
              <div
                role="status"
                className="text-ink absolute right-0 top-full z-50 mt-3 w-[17rem] rounded-2xl bg-white p-4 shadow-2xl sm:w-[19rem]"
              >
                <span
                  aria-hidden="true"
                  className="absolute -top-1.5 right-8 h-3 w-3 rotate-45 bg-white"
                />
                <p className="flex items-center gap-2 text-sm font-extrabold">
                  <MapPin
                    className="text-gold h-4 w-4"
                    aria-hidden="true"
                    fill="currentColor"
                    stroke="white"
                  />
                  {copy.promptTitle}
                </p>
                <p className="mt-1 text-[0.8125rem] leading-snug text-[#6b6560]">
                  {copy.promptBody}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      dismissPrompt();
                      onWhere();
                    }}
                    className="focus-visible:ring-gold flex-1 rounded-full bg-[#FFC93C] px-4 py-2.5 text-[0.8125rem] font-bold text-[#141414] hover:bg-[#FFD35F] focus-visible:outline-none focus-visible:ring-2"
                  >
                    {copy.promptCta}
                  </button>
                  <button
                    type="button"
                    onClick={dismissPrompt}
                    className="rounded-full px-3 py-2.5 text-[0.8125rem] font-semibold text-[#6b6560] hover:text-[#141414]"
                  >
                    {copy.promptLater}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* The comp: an account button on desktop, a search button on a phone. */}
          <Link href="/sign-in" aria-label={copy.signIn} className={cn(round, 'hidden sm:flex')}>
            <User className="text-gold h-5 w-5" aria-hidden="true" fill="currentColor" />
          </Link>
          <ThemeToggle className={round} />
          <SiteMenu locale={locale}>
            <button type="button" aria-label="Open menu" className={round}>
              <Menu className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
            </button>
          </SiteMenu>
        </div>
      </div>
    </nav>
  );
}

/* ═══════════════════════════════════════════════════════════ search */

function HeroSearch({
  copy,
  citySlug,
  onSubmit,
}: {
  copy: HeroCopy;
  /** From the location pill; changed there, not here. */
  citySlug: string;
  onSubmit: (q: string) => void;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState('');
  const [groups, setGroups] = React.useState<SearchGroup[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  const items = React.useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const term = q.trim();

  /* Ask as they type, from the first letter. Debounced, and the previous
     request is abandoned so a slow answer cannot overwrite a newer one. */
  React.useEffect(() => {
    if (term.length < MIN_CHARS) {
      setGroups([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(term)}&city=${encodeURIComponent(citySlug)}`,
          { signal: controller.signal },
        );
        const body = (await res.json()) as { groups?: SearchGroup[] };
        setGroups(body.groups ?? []);
        setActive(-1);
      } catch {
        /* Aborted or offline: keep what is on screen. */
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, citySlug]);

  /* Close when focus or a tap leaves the box. */
  React.useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const showPanel = open && term.length >= MIN_CHARS;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = active >= 0 ? items[active] : undefined;
      recordSearch(term);
      if (chosen) router.push(chosen.href);
      else onSubmit(term);
    }
  }

  let index = -1;

  return (
    <div ref={boxRef} className="relative mt-8 w-full max-w-[42rem] text-left">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          recordSearch(term);
          onSubmit(term);
        }}
        className="sm:focus-within:ring-gold flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-0 sm:rounded-full sm:bg-white sm:p-1.5 sm:shadow-2xl sm:focus-within:ring-2"
      >
        <div className="focus-within:ring-gold flex min-w-0 flex-1 items-center rounded-full bg-white shadow-2xl focus-within:ring-2 sm:shadow-none sm:focus-within:ring-0">
          <Search className="ml-4 h-5 w-5 shrink-0 text-[#141414]" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchPlaceholder}
            role="combobox"
            aria-expanded={showPanel}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            autoComplete="off"
            enterKeyHint="search"
            className="h-12 min-w-0 flex-1 appearance-none rounded-none border-0 bg-transparent px-3 text-[0.9375rem] text-[#141414] shadow-none placeholder:text-[#6b6560] focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:h-auto [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
        <button
          type="submit"
          className="focus-visible:ring-gold flex h-12 items-center justify-center gap-2 rounded-full bg-[#FFC93C] px-6 text-base font-bold text-[#141414] transition-colors hover:bg-[#FFD35F] focus-visible:outline-none focus-visible:ring-2 sm:h-auto sm:min-w-[8.5rem] sm:py-3"
        >
          {copy.searchButton}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>

      {/* ───────────────────────────── results, from the first letter */}
      {showPanel && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute inset-x-0 top-[3.25rem] z-30 max-h-[22rem] overflow-y-auto rounded-2xl bg-white p-2 text-[#141414] shadow-2xl sm:top-[3.9rem]"
        >
          {loading && items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[#6b6560]">Searching…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[#6b6560]">
              Nothing matches “{term}” yet. Press Enter to search everything, or{' '}
              <Link href="/ask" className="font-semibold underline">
                ask a concierge
              </Link>
              .
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.key} role="group" aria-label={group.label} className="py-1">
                <p className="px-3 pb-1 pt-2 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-[#8a8178]">
                  {group.label}
                </p>
                {group.items.map((item) => {
                  index += 1;
                  const i = index;
                  const Icon = KIND_ICON[item.kind];
                  return (
                    <Link
                      key={`${item.kind}-${item.href}`}
                      id={`${listId}-${i}`}
                      href={item.href}
                      role="option"
                      aria-selected={active === i}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => {
                        recordSearch(term);
                        setOpen(false);
                      }}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2.5',
                        active === i ? 'bg-[#F6F3EC]' : 'hover:bg-[#F6F3EC]',
                      )}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FFF4D6]">
                        <Icon className="h-4 w-4 text-[#9a7414]" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{item.title}</span>
                        {item.subtitle && (
                          <span className="block truncate text-xs text-[#6b6560]">
                            {item.subtitle}
                          </span>
                        )}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ))
          )}
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => {
                recordSearch(term);
                onSubmit(term);
              }}
              className="mt-1 w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#9a7414] hover:bg-[#F6F3EC]"
            >
              See everything for “{term}” →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
