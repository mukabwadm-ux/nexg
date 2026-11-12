'use client';

import { useLocation } from '@nexg/location';
import { cn } from '@nexg/ui';
import { ArrowRight, ChevronDown, MapPin, Menu, Search, User } from 'lucide-react';
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
 * nav on the photograph: logo, where you are, your account and the menu.
 * That nav stays fixed and picks up a dark ground once the photo has
 * scrolled away, so the menu is never out of reach further down the page.
 *
 * Every control does something real:
 *   - the location pill is the same place the rest of the site uses, and
 *     opens the same sheet. On a phone that has already allowed location
 *     it is the exact spot, read when the page opened.
 *   - the search sends what was typed to Discovery (/discover?q=), which
 *     shows the results.
 */

export interface HeroCopy {
  eyebrow: string;
  titleLine1: string;
  titleLine2: string;
  searchPlaceholder: string;
  searchButton: string;
  signIn: string;
  scroll: string;
  promptTitle: string;
  promptBody: string;
  promptCta: string;
  promptLater: string;
}

/** Session flag: the visitor has answered or dismissed the hero's location prompt. */
const PROMPT_KEY = 'nexg.loc.heroPrompt';

export function Hero({ copy, locale }: { copy: HeroCopy; locale: Locale }) {
  const { place, chip, openSheet, sheetOpen } = useLocation();

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

  return (
    <section className="bg-night relative isolate z-30 flex min-h-[calc(100svh-4rem)] flex-col overflow-hidden text-white lg:min-h-[calc(100svh-4.75rem)]">
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

      <HeroNav
        where={where}
        needsSpot={needsSpot}
        sheetOpen={sheetOpen}
        onWhere={() => openSheet('hero')}
        locale={locale}
        copy={copy}
      />

      {/* ─────────────────────────────────────────────── the message */}
      {/* Centred in what the nav leaves of the hero, then nudged down by about a
          tenth of the hero on larger screens. The block is as wide as
          the headline, and the search takes that width. */}
      <div className="mx-auto flex w-full max-w-[120rem] flex-1 flex-col justify-center px-5 pb-8 pt-[6.5rem] sm:relative sm:top-[9svh] sm:px-[30px] sm:pt-28 lg:pb-12 lg:pt-32">
        <div className="sm:w-fit">
          <p className="text-gold text-[0.625rem] font-bold uppercase tracking-[0.3em] sm:text-[0.6875rem]">
            {copy.eyebrow}
          </p>
          <h1
            aria-label={`${copy.titleLine1} ${copy.titleLine2}`}
            className="mt-4 max-w-[48rem] text-3xl font-extrabold leading-[1.2] tracking-tight sm:text-4xl sm:leading-[1.2] lg:text-[2.375rem]"
          >
            <span className="block">{copy.titleLine1}</span>
            <span className="text-gold block">{copy.titleLine2}</span>
          </h1>

          <HeroSearch copy={copy} />
        </div>
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
        solid ? 'bg-night shadow-lg' : 'bg-transparent',
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

/**
 * The hero search. What is typed goes to Discovery (/discover?q=), the
 * search and results page, which shows everything that matches. Discovery is
 * its own app served at /discover, so this is a full page load rather than a
 * router push. An empty search opens Discovery as it is.
 */
function HeroSearch({ copy }: { copy: HeroCopy }) {
  const [q, setQ] = React.useState('');

  const go = () => {
    const term = q.trim();
    window.location.assign(term ? `/discover?q=${encodeURIComponent(term)}` : '/discover');
  };

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      className="sm:focus-within:ring-gold mt-8 flex w-full flex-col gap-3 sm:w-0 sm:min-w-full sm:flex-row sm:items-stretch sm:gap-0 sm:rounded-full sm:bg-white sm:p-1 sm:shadow-2xl sm:focus-within:ring-2"
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
          className="h-11 min-w-0 flex-1 appearance-none rounded-none border-0 bg-transparent px-3 text-sm text-[#141414] shadow-none placeholder:text-[#6b6560] focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:h-auto [&::-webkit-search-cancel-button]:hidden"
        />
      </div>
      <button
        type="submit"
        className="focus-visible:ring-gold flex h-11 items-center justify-center gap-2 rounded-full bg-[#FFC93C] px-5 text-[0.8125rem] font-bold text-[#141414] transition-colors hover:bg-[#FFD35F] focus-visible:outline-none focus-visible:ring-2 sm:h-auto sm:min-w-[7rem] sm:py-2"
      >
        {copy.searchButton}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </form>
  );
}
