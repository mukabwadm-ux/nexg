'use client';

import { useLocation } from '@nexg/location';
import { cn } from '@nexg/ui';
import {
  ArrowRight,
  BedDouble,
  ChevronDown,
  CreditCard,
  Flower2,
  Gem,
  Headphones,
  MapPin,
  Menu,
  Plane,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  CalendarDays,
  User,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import type { SearchGroup, SearchItem } from '@/app/api/search/route';
import type { Locale } from '@/lib/i18n/dictionaries';

import { Logo } from '../logo';
import { SiteMenu } from '../site-menu';

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
 *   - the search answers from the third letter (/api/search) and Enter
 *     with nothing highlighted goes to Explore with the query.
 *   - popular searches and "Plan your trip" go where they say.
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
  openSearch: string;
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

const MIN_CHARS = 3;
/** Session flag: the visitor has answered or dismissed the hero's location prompt. */
const PROMPT_KEY = 'nexg.loc.heroPrompt';

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Zap, title: 'Speed', body: 'Fast, reliable and convenient' },
  { icon: ShieldCheck, title: 'Verified Partners', body: 'Trusted and quality service providers' },
  { icon: Headphones, title: '24/7 Support', body: 'Personal assistance anytime' },
  { icon: CreditCard, title: 'Secure Payments', body: 'Card, M-Pesa and more' },
  { icon: Gem, title: 'NexG Plus', body: 'Exclusive access and priority service' },
];

const KIND_ICON: Record<SearchItem['kind'], LucideIcon> = {
  service: Sparkles,
  merchant: Store,
  stay: BedDouble,
  day: CalendarDays,
  event: CalendarDays,
};

export function Hero({ copy, cities, locale }: { copy: HeroCopy; cities: City[]; locale: Locale }) {
  const { place, chip, openSheet, sheetOpen } = useLocation();
  const router = useRouter();
  const searchRef = React.useRef<HTMLInputElement>(null);

  /* The city the search is scoped to: where the visitor is, until they
     pick another one in the bar. */
  const [cityPicked, setCityPicked] = React.useState<string | null>(null);
  const placeCity = cities.some((c) => c.slug === place?.city_slug) ? place!.city_slug! : null;
  const citySlug = cityPicked ?? placeCity ?? cities[0]?.slug ?? 'nairobi';

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

  const popular: { icon: LucideIcon; label: string; href: string }[] = [
    { icon: Plane, label: 'Airport pickup', href: '/?need=Airport%20Transfer#start' },
    { icon: BedDouble, label: 'Hotel stays', href: '/stays' },
    {
      icon: Flower2,
      label: 'Massage & spa',
      href: `/explore?city=${citySlug}&category=beauty_fashion`,
    },
    {
      icon: UtensilsCrossed,
      label: 'Restaurants near me',
      href: `/explore?city=${citySlug}&category=restaurant`,
    },
  ];

  return (
    <section className="relative isolate overflow-hidden bg-[#0b0907] text-white">
      {/* ─────────────────────────────────────────────── the photograph */}
      <div className="absolute inset-x-0 top-0 -z-10 h-[36rem] sm:h-[44rem] lg:inset-y-0 lg:h-auto">
        {/* One wide photograph (2752 × 1536): the whole scene on desktop,
            framed on her and the skyline in the top of a phone. */}
        <Image
          src="/images/hero/stay-sunset.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[67%_30%] lg:object-[70%_center]"
        />
        {/* Phone: dark from the middle down, where the text sits. */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/50 to-[#0b0907] lg:hidden" />
        {/* Desktop: dark behind the text on the left, the room already is. */}
        <div className="absolute inset-0 hidden bg-gradient-to-r from-[#0b0907]/90 via-[#0b0907]/50 via-40% to-transparent to-70% lg:block" />
        <div className="absolute inset-x-0 bottom-0 hidden h-40 bg-gradient-to-t from-[#0b0907] to-transparent lg:block" />
      </div>

      <HeroNav
        where={where}
        needsSpot={needsSpot}
        sheetOpen={sheetOpen}
        onWhere={() => openSheet('hero')}
        onSearch={() => searchRef.current?.focus()}
        locale={locale}
        copy={copy}
      />

      {/* ─────────────────────────────────────────────── the message */}
      <div className="mx-auto max-w-[96rem] px-5 pb-10 pt-[11.5rem] sm:px-8 sm:pt-[13rem] lg:px-16 lg:pb-16 lg:pt-[13.5rem]">
        <p className="text-gold text-[0.6875rem] font-bold uppercase tracking-[0.32em] sm:text-xs">
          {copy.eyebrow}
        </p>
        <h1
          aria-label={`${copy.titleLine1} ${copy.titleLine2}`}
          className="mt-4 max-w-[46rem] text-[2.75rem] font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.5rem]"
        >
          <span className="block">{copy.titleLine1}</span>
          <span className="text-gold block">{copy.titleLine2}</span>
        </h1>
        <p className="mt-4 max-w-md text-base text-white/85 sm:text-lg">{copy.lede}</p>

        <HeroSearch
          inputRef={searchRef}
          copy={copy}
          cities={cities}
          citySlug={citySlug}
          onCity={setCityPicked}
          onSubmit={(q) =>
            router.push(`/explore?city=${citySlug}${q ? `&q=${encodeURIComponent(q)}` : ''}`)
          }
        />

        {/* Popular searches */}
        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
          <p className="text-[0.9375rem] font-bold lg:font-semibold">
            <span className="lg:hidden">
              {copy.popular.replace(/:$/, '')}
              <span aria-hidden="true" className="bg-gold mt-2 block h-0.5 w-8 rounded-full" />
            </span>
            <span className="hidden lg:inline">{copy.popular}</span>
          </p>
          <ul className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {popular.map(({ icon: Icon, label, href }) => (
              <li key={label}>
                <Link
                  href={href}
                  className="hover:border-gold focus-visible:ring-gold flex min-h-11 items-center gap-2.5 rounded-full border border-white/25 bg-black/35 px-4 py-1.5 text-[0.8125rem] font-semibold backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 sm:h-12"
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="leading-tight sm:truncate">{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <Link
          href="/experience"
          className={cn(
            'focus-visible:ring-gold mt-7 flex h-14 items-center gap-4 rounded-full px-7 text-base font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:text-lg',
            /* Outlined on a phone, filled from sm up — as drawn. */
            'border-gold border-[1.5px] text-white sm:inline-flex sm:border-0 sm:bg-[#FFC93C] sm:text-[#141414] sm:hover:bg-[#FFD35F]',
          )}
        >
          <Plane className="text-gold h-5 w-5 sm:text-[#141414]" aria-hidden="true" />
          <span className="flex-1 sm:flex-none">{copy.plan}</span>
          <ArrowRight className="text-gold h-5 w-5 sm:text-[#141414]" aria-hidden="true" />
        </Link>
      </div>

      {/* ─────────────────────────────────────────────── why NexG */}
      <div className="relative border-t border-white/10 bg-black/40 backdrop-blur">
        <ul className="mx-auto grid max-w-[96rem] grid-cols-5 px-2 py-5 sm:px-8 lg:px-16 lg:py-7">
          {FEATURES.map(({ icon: Icon, title, body }, i) => (
            <li
              key={title}
              className={cn(
                'flex flex-col items-center gap-1.5 px-1 text-center lg:flex-row lg:items-center lg:gap-4 lg:px-6 lg:text-left',
                i > 0 && 'border-l border-white/10',
              )}
            >
              <Icon
                className="text-gold h-7 w-7 shrink-0 lg:h-9 lg:w-9"
                aria-hidden="true"
                strokeWidth={1.5}
              />
              <span>
                <span className="block text-[0.75rem] font-bold leading-tight sm:text-sm lg:text-[0.9375rem]">
                  {title}
                </span>
                <span className="mt-0.5 block text-[0.625rem] leading-snug text-white/65 sm:text-xs lg:text-[0.8125rem]">
                  {body}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <a href="#start" className="flex flex-col items-center pb-5 text-xs text-white/70 lg:hidden">
        <ChevronDown className="text-gold h-5 w-5" aria-hidden="true" />
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
  onSearch,
  locale,
  copy,
}: {
  where: string;
  needsSpot: boolean;
  sheetOpen: boolean;
  onWhere: () => void;
  onSearch: () => void;
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
    'focus-visible:ring-gold flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/55 backdrop-blur transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 sm:h-14 sm:w-14';

  return (
    <nav
      aria-label="Main"
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-colors duration-300',
        solid ? 'bg-[#0b0907]/95 shadow-lg backdrop-blur' : 'bg-transparent',
      )}
    >
      <div
        className={cn(
          'mx-auto flex max-w-[96rem] items-center justify-between gap-3 px-4 transition-[padding] sm:px-8 lg:px-16',
          solid ? 'py-2' : 'py-4 sm:py-5',
        )}
      >
        <Link href="/" aria-label="NexG Concierge, home" className="shrink-0">
          <Logo
            onDark
            priority
            className={cn(
              'w-auto transition-[height]',
              solid ? 'h-12 sm:h-14' : 'h-[4.5rem] sm:h-24',
            )}
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
              className="focus-visible:ring-gold flex h-11 max-w-[11rem] items-center gap-2 rounded-full border border-white/15 bg-black/55 pl-3.5 pr-3 text-sm font-semibold backdrop-blur transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 sm:h-14 sm:max-w-[16rem] sm:gap-3 sm:pl-5 sm:pr-4 sm:text-base"
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
          <button
            type="button"
            onClick={onSearch}
            aria-label={copy.openSearch}
            className={cn(round, 'sm:hidden')}
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>

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
  inputRef,
  copy,
  cities,
  citySlug,
  onCity,
  onSubmit,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  copy: HeroCopy;
  cities: City[];
  citySlug: string;
  onCity: (slug: string) => void;
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

  /* Ask as they type, from the third letter. Debounced, and the previous
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
    }, 180);
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
      if (chosen) router.push(chosen.href);
      else onSubmit(term);
    }
  }

  let index = -1;

  return (
    <div ref={boxRef} className="relative mt-7 max-w-[54rem]">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(term);
        }}
        className="sm:focus-within:ring-gold flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-0 sm:rounded-full sm:bg-white sm:p-1.5 sm:shadow-2xl sm:focus-within:ring-2"
      >
        <div className="focus-within:ring-gold flex min-w-0 flex-1 items-center rounded-full bg-white shadow-2xl focus-within:ring-2 sm:shadow-none sm:focus-within:ring-0">
          <Search className="ml-5 h-6 w-6 shrink-0 text-[#141414] sm:ml-5" aria-hidden="true" />
          <input
            ref={inputRef}
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
            className="h-14 min-w-0 flex-1 appearance-none rounded-none border-0 bg-transparent px-4 text-base text-[#141414] shadow-none placeholder:text-[#6b6560] focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:h-auto [&::-webkit-search-cancel-button]:hidden"
          />
          <span aria-hidden="true" className="h-8 w-px shrink-0 bg-[#e3ddd3]" />
          <label className="relative flex shrink-0 items-center gap-1.5 pl-3 pr-4 text-[0.9375rem] font-semibold text-[#141414] sm:pl-5 sm:pr-5">
            <span className="sr-only">City to search in</span>
            <MapPin
              className="text-gold h-5 w-5"
              aria-hidden="true"
              fill="currentColor"
              stroke="white"
            />
            <select
              value={citySlug}
              onChange={(e) => onCity(e.target.value)}
              className="cursor-pointer appearance-none bg-transparent pr-6 focus:outline-none"
            >
              {cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-4 h-4 w-4 sm:right-5"
              aria-hidden="true"
            />
          </label>
        </div>
        <button
          type="submit"
          className="focus-visible:ring-gold flex h-14 items-center justify-center gap-3 rounded-full bg-[#FFC93C] px-8 text-lg font-bold text-[#141414] transition-colors hover:bg-[#FFD35F] focus-visible:outline-none focus-visible:ring-2 sm:h-auto sm:min-w-[11rem] sm:py-4"
        >
          {copy.searchButton}
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </form>

      {/* ───────────────────────────── results, from the third letter */}
      {showPanel && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute inset-x-0 top-[3.75rem] z-30 max-h-[24rem] overflow-y-auto rounded-2xl bg-white p-2 text-[#141414] shadow-2xl sm:top-[4.75rem]"
        >
          {loading && items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[#6b6560]">Searching…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[#6b6560]">
              Nothing matches “{term}” yet. Press Enter to search everything, or{' '}
              <Link href="/#start" className="font-semibold underline">
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
                      onClick={() => setOpen(false)}
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
              onClick={() => onSubmit(term)}
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
