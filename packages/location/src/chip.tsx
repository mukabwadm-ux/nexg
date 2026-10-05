'use client';

import { MapPin } from 'lucide-react';
import * as React from 'react';

import { Panel } from './panel';
import { useLocation } from './store';
import type { ChipState } from './types';

/**
 * The "Deliver to" chip, in the global header on every public
 * page.
 *
 * It is one component reading one store, so Home, Explore, a
 * merchant page, Help, Careers, Legal and the QR landing cannot
 * disagree about where the order is going. The chip is also the
 * only control that changes it — there is no second address
 * picker further down a page to get out of step with this one.
 *
 * The status dot is the honesty mechanism and the reason this is
 * not just a label. Gold means nothing is set, amber means we
 * guessed a city from the connection, green means a confirmed
 * pin. A visitor can tell at a glance whether the prices they
 * are looking at are real, which is the whole point of putting
 * it here rather than at checkout.
 */

const DOT: Record<ChipState, string> = {
  empty: 'bg-gold',
  city: 'bg-gold',
  set: 'bg-success',
  qr: 'bg-success',
  room: 'bg-success',
  outside: 'bg-success',
  unlaunched: 'bg-gold',
};

export function DeliverToChip({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { place, chip, panelOpen, setPanelOpen } = useLocation();
  const ref = React.useRef<HTMLDivElement>(null);

  /* Click-away and Escape, because this opens over a page
     somebody is reading and must never be something they have to
     work out how to close. */
  React.useEffect(() => {
    if (!panelOpen) return;
    function onDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setPanelOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setPanelOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [panelOpen, setPanelOpen]);

  const { title, hint } = describe(chip, place);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setPanelOpen(!panelOpen)}
        aria-expanded={panelOpen}
        aria-haspopup="dialog"
        aria-label={`Deliver to ${title}. Change the delivery location.`}
        className={`flex max-w-full items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition-colors sm:gap-3 sm:px-3 sm:py-2 ${
          tone === 'dark'
            ? 'border-white/15 bg-white/[0.06] hover:border-white/30'
            : 'border-border bg-surface hover:border-ink/40'
        }`}
      >
        <span className="relative shrink-0">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              chip === 'empty' || chip === 'city' ? 'bg-gold' : 'bg-ink'
            }`}
          >
            <MapPin
              className={`h-4 w-4 ${chip === 'empty' || chip === 'city' ? 'text-ink' : 'text-gold'}`}
              aria-hidden="true"
            />
          </span>
          <span
            className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ${
              DOT[chip]
            } ${tone === 'dark' ? 'ring-ink' : 'ring-surface'}`}
            aria-hidden="true"
          />
        </span>

        <span className="min-w-0">
          <span className="text-gold block text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
            Deliver to
          </span>
          <span
            className={`block truncate text-[0.8125rem] font-extrabold sm:text-sm ${
              tone === 'dark' ? 'text-white' : 'text-ink'
            }`}
          >
            {title}
          </span>
        </span>

        <span
          className={`hidden shrink-0 border-l pl-3 text-right md:block ${
            tone === 'dark' ? 'border-white/15' : 'border-border'
          }`}
        >
          <span
            className={`block text-[0.6875rem] font-semibold ${
              tone === 'dark' ? 'text-white/60' : 'text-muted-light'
            }`}
          >
            {hint}
          </span>
          <span className="text-gold block text-[0.6875rem] font-extrabold">Change</span>
        </span>
      </button>

      {panelOpen ? <Panel /> : null}
    </div>
  );
}

/**
 * The words on the chip.
 *
 * Every state names its own source. "Nairobi · from your
 * connection" is a different promise from "Home · [Estate],
 * Lavington", and a chip that rendered both as plain place names
 * would let somebody read city-wide estimates as a quoted price.
 */
export function describe(
  chip: ChipState,
  place: { label?: string; city?: string | null; zone?: string | null; eta_min?: number | null; eta_max?: number | null; nearest_km?: number | null } | null,
): { title: string; hint: string } {
  switch (chip) {
    case 'empty':
      return {
        title: 'Choose a delivery location',
        hint: 'Prices and merchants depend on it',
      };
    case 'city':
      return {
        title: `${place?.city ?? 'Your city'} · from your connection`,
        hint: 'Set an exact spot for prices',
      };
    case 'qr':
      return { title: place?.label ?? 'Your host’s place', hint: "From your host's QR card" };
    case 'room':
      return { title: place?.label ?? 'Your room', hint: 'Charge to room available' };
    case 'outside':
      return { title: place?.label ?? 'That address', hint: 'Outside coverage' };
    case 'unlaunched':
      return {
        title: `${place?.city ?? 'That city'} · from your connection`,
        hint: 'Not live yet',
      };
    case 'set':
    default: {
      const window =
        place?.eta_min && place?.eta_max ? `${place.eta_min}–${place.eta_max} min` : null;
      return {
        title: place?.label ?? 'Your address',
        hint: [place?.zone, window].filter(Boolean).join(' · ') || 'Confirmed pin',
      };
    }
  }
}
