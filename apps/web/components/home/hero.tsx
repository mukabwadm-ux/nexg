'use client';

import { useLocation } from '@nexg/location';
import { cn } from '@nexg/ui';
import { ArrowRight, ChevronDown, MapPin, Menu, Search } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import type { Locale } from '@/lib/i18n/dictionaries';

import { Logo } from '../logo';
import { HeroVideo } from './hero-video';
import { SiteMenu } from '../site-menu';
import { ThemeToggle } from '../theme/theme';

/**
 * The homepage hero: "Everything You Need. Right Where You Are."
 *
 * Built from the two supplied comps (desktop and phone). It carries its own
 * navigation rather than the global SiteHeader, because the comp puts the
 * nav on the photograph: logo, where you are, the theme switch and the menu.
 * That nav stays fixed and picks up a dark ground once the photo has
 * scrolled away, so the menu is never out of reach further down the page.
 *
 * Every control does something real:
 *   - the location pill is the same place the rest of the site uses, and
 *     opens the same sheet. On a phone that has already allowed location
 *     it is the exact spot, read when the page opened.
 *   - the search sends what was typed to Discovery (/discover?q=), which
 *     shows the results. Without an exact spot, the first search of a visit
 *     asks where they are first, so the results are what is around them.
 */

export interface HeroCopy {
  eyebrow: string;
  titleLine1: string;
  titleLine2: string;
  searchPlaceholder: string;
  searchButton: string;
  scroll: string;
}

export function Hero({ copy, locale }: { copy: HeroCopy; locale: Locale }) {
  const { place, chip, openSheet } = useLocation();

  /* A place guessed from the connection is a city, not an area: showing its
     zone ("CBD") would claim we know where they are. */
  const where =
    chip === 'empty'
      ? 'Set location'
      : chip === 'city'
        ? (place?.city ?? 'Nairobi')
        : (place?.zone ?? place?.city ?? place?.label ?? 'Nairobi');

  return (
    /* Exactly one screen tall: 100vh, and 100svh wherever the browser has
       it, because on a phone 100vh is taller than what shows while the
       address bar is up. The supports variant is what makes svh win. */
    <section className="bg-night relative isolate z-30 flex min-h-screen flex-col overflow-hidden text-white supports-[min-height:100svh]:min-h-[100svh]">
      {/* ─────────────────────────────────────────────── the photograph */}
      <div className="absolute inset-x-0 top-0 -z-10 h-[36rem] sm:h-[44rem] lg:inset-y-0 lg:h-auto">
        {/* Three clips in turn: the kitchen, the lobby, the room. */}
        <HeroVideo />
        {/* Phone: dark from the middle down, where the text sits. */}
        <div className="to-night absolute inset-0 bg-gradient-to-b from-black/55 via-black/70 lg:hidden" />
        {/* Desktop: dark on the left behind the text and search, easing to a
            lighter veil on the right so the clip still reads. */}
        <div className="from-night/90 via-night/65 to-night/20 absolute inset-0 hidden bg-gradient-to-r via-40% lg:block" />
        <div className="from-night absolute inset-x-0 bottom-0 hidden h-40 bg-gradient-to-t to-transparent lg:block" />
      </div>

      <HeroNav where={where} onWhere={() => openSheet('hero')} locale={locale} />

      {/* ─────────────────────────────────────────────── the message */}
      {/* Centred in what the nav leaves of the hero, then nudged down by about a
          fifth of the hero on larger screens. The block is as wide as
          the headline, and the search takes that width. */}
      <div className="mx-auto flex w-full max-w-[120rem] flex-1 flex-col justify-center px-5 pb-8 pt-[6.5rem] sm:relative sm:top-[18svh] sm:px-[30px] sm:pt-28 lg:pb-12 lg:pt-32">
        <div className="sm:w-fit">
          <p className="text-gold text-[0.625rem] font-bold uppercase tracking-[0.3em] sm:text-[0.6875rem]">
            {copy.eyebrow}
          </p>
          <h1
            aria-label={`${copy.titleLine1} ${copy.titleLine2}`}
            className="mt-4 max-w-[48rem] text-[2rem] font-extrabold leading-[1.2] tracking-tight sm:text-[2.75rem] sm:leading-[1.2] lg:text-[3.25rem]"
          >
            <span className="block">{copy.titleLine1}</span>
            <span className="text-gold block">{copy.titleLine2}</span>
          </h1>

          <HeroSearch copy={copy} />
        </div>
      </div>

      <a
        href="#popular"
        className="flex flex-col items-center pb-2 text-[0.6875rem] text-white/70 sm:hidden"
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
  onWhere,
  locale,
}: {
  where: string;
  onWhere: () => void;
  locale: Locale;
}) {
  /* Transparent on the photograph; a dark ground once it has scrolled away. */
  const [solid, setSolid] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 80);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const round =
    'focus-visible:ring-gold flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/55 backdrop-blur transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 sm:h-12 sm:w-12';

  return (
    <nav
      aria-label="Main"
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
        solid ? 'bg-night shadow-lg' : 'bg-transparent',
      )}
    >
      <div
        className={cn(
          'mx-auto flex max-w-[120rem] items-center justify-between gap-3 px-4 transition-[padding] sm:px-[30px]',
          solid ? 'py-1' : 'py-3 sm:py-4',
        )}
      >
        <Link href="/" aria-label="NexG Concierge, home" className="shrink-0">
          <Logo
            onDark
            priority
            className={cn(
              'w-auto transition-[height]',
              solid ? 'h-[3.25rem] sm:h-14' : 'h-16 sm:h-20',
            )}
          />
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="relative">
            <button
              type="button"
              onClick={onWhere}
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
          </div>

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

/**
 * The hero search. What is typed goes to Discovery (/discover?q=), the
 * search and results page, which shows everything that matches. Discovery is
 * its own app served at /discover, so this is a full page load rather than a
 * router push. An empty search opens Discovery as it is.
 */
function HeroSearch({ copy }: { copy: HeroCopy }) {
  const [q, setQ] = React.useState('');

  const { chip, asked, sheetOpen, openSheet } = useLocation();
  /* A search waiting for the location sheet to close, and whether it opened. */
  const pending = React.useRef<string | null>(null);
  const shown = React.useRef(false);

  const go = (term: string) => {
    window.location.assign(term ? `/discover?q=${encodeURIComponent(term)}` : '/discover');
  };

  /* The search runs once the sheet closes, whether a spot was set or not. */
  React.useEffect(() => {
    if (pending.current === null) return;
    if (sheetOpen) {
      shown.current = true;
      return;
    }
    if (!shown.current) return;
    const term = pending.current;
    pending.current = null;
    shown.current = false;
    go(term);
  }, [sheetOpen]);

  /*
   * Nothing asks for a location when the page opens. The first search of a
   * visit without an exact spot (nothing at all, or only the connection's
   * guess of a city) opens "Where should we deliver?" first, so the results
   * are what is around them. After the sheet has been answered or skipped,
   * searches go straight through.
   */
  const search = () => {
    const term = q.trim();
    const needsSpot = chip === 'empty' || chip === 'city';
    if (needsSpot && !asked) {
      pending.current = term;
      openSheet('search');
      return;
    }
    go(term);
  };

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        search();
      }}
      className="sm:focus-within:ring-gold mt-8 flex w-full flex-col gap-3 sm:w-0 sm:min-w-full sm:flex-row sm:items-stretch sm:gap-0 sm:rounded-full sm:bg-white sm:p-1.5 sm:shadow-2xl sm:focus-within:ring-2"
    >
      <div className="focus-within:ring-gold flex min-w-0 flex-1 items-center rounded-full bg-white shadow-2xl focus-within:ring-2 sm:shadow-none sm:focus-within:ring-0">
        <Search className="ml-4 h-4 w-4 shrink-0 text-[#141414]" aria-hidden="true" />
        <input
          type="search"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={copy.searchPlaceholder}
          aria-label={copy.searchPlaceholder}
          autoComplete="off"
          enterKeyHint="search"
          className="h-12 min-w-0 flex-1 appearance-none rounded-none border-0 bg-transparent px-3 text-sm text-[#141414] shadow-none placeholder:text-[#6b6560] focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:h-auto [&::-webkit-search-cancel-button]:hidden"
        />
      </div>
      <button
        type="submit"
        className="focus-visible:ring-gold flex h-12 items-center justify-center gap-2 rounded-full bg-[#FDD128] px-5 text-[0.8125rem] font-bold text-[#141414] transition-colors hover:bg-[#FEDD5C] focus-visible:outline-none focus-visible:ring-2 sm:h-auto sm:min-w-[7rem] sm:py-2.5"
      >
        {copy.searchButton}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </form>
  );
}
