'use client';

import { AlertTriangle, Globe, Info, Lock } from 'lucide-react';
import * as React from 'react';

import { useLocation } from './store';

/**
 * One banner under the nav, one chip variant, per state.
 *
 * These are the four ways a visitor ends up without a confirmed
 * pin, and the rule for all of them is the same: **no state
 * blocks the page and no state re-prompts the browser.** The
 * site stays readable and the banner says exactly how precise we
 * are and what it costs.
 *
 * The reason to spend a component on this rather than show
 * nothing: an unplaced visitor and a precisely-placed one
 * otherwise see identical prices with identical confidence, and
 * only one of those pages is telling the truth.
 */
export function LocationBanner() {
  const { place, step, chip, consent, blockedNoticeSeen, openSheet, setPanelOpen } = useLocation();
  const [dismissed, setDismissed] = React.useState(false);

  if (dismissed) return null;

  /* B · the browser was asked and said no.
     Shown once, then search carries on being the control. The
     padlock hint is the only way back and most people do not
     know it exists, so it is spelled out. */
  if (consent === 'denied' && blockedNoticeSeen && !place) {
    return (
      <Bar tone="plain">
        <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">
          Location is <strong className="font-extrabold">blocked for nexgapp.com</strong> in your
          browser — that is fine. Type your address instead, or re-enable it from the padlock icon
          in the address bar whenever you like. We will not ask again this visit.
        </span>
        <Action onClick={() => setPanelOpen(true)} variant="outline">
          Type my address
        </Action>
      </Bar>
    );
  }

  /* D · a city we have not launched. Pages stay readable;
     ordering is closed honestly rather than failing at payment. */
  if (chip === 'unlaunched') {
    return (
      <Bar tone="dark">
        <Globe className="text-gold h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">
          <strong className="text-gold font-extrabold">{place?.city ?? 'That city'}</strong> is on
          our list, not live yet. You can read about NexG and join the waitlist; ordering opens when
          we launch there.
        </span>
        <Action href="/help" variant="gold">
          Join the waitlist
        </Action>
      </Bar>
    );
  }

  /* C · a confirmed pin outside coverage. The nearest covered
     zone and the real distance, because a vague "not available"
     leaves somebody guessing whether to walk ten minutes. */
  if (chip === 'outside') {
    return (
      <Bar tone="danger">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">
          <strong className="font-extrabold">
            We do not deliver to {place?.label ?? 'that address'} yet.
          </strong>{' '}
          {place?.nearest_zone ? (
            <>
              Nearest covered area: <strong className="font-extrabold">{place.nearest_zone}</strong>
              {place.nearest_km ? `, ${place.nearest_km} km away` : ''}. Leave your number and we
              will tell you the day we open there — no fake availability.
            </>
          ) : (
            <>Leave your number and we will tell you the day we open there.</>
          )}
        </span>
        <Action href="/help" variant="dark">
          Tell me when
        </Action>
        {place?.nearest_city_slug ? (
          <Action href={`/explore?city=${place.nearest_city_slug}`} variant="link">
            Browse {place.nearest_city}
          </Action>
        ) : null}
      </Bar>
    );
  }

  /* A · skipped, placed by the connection. Estimates only, and
     checkout will ask again — said here rather than discovered
     at the moment of payment. */
  if (chip === 'city' || step === 'ip_city') {
    return (
      <Bar tone="gold">
        <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">
          <strong className="font-extrabold">
            Showing {place?.city ?? 'your city'} from your internet connection.
          </strong>{' '}
          Prices and delivery times are city-wide estimates until you set an exact spot. We will ask
          again at checkout.
        </span>
        <Action onClick={() => openSheet('banner')} variant="dark">
          Set my delivery spot
        </Action>
        <Action onClick={() => setDismissed(true)} variant="link">
          Dismiss
        </Action>
      </Bar>
    );
  }

  /* A paused zone is covered, not uncovered — different sentence,
     different action. */
  if (place?.paused && place.message) {
    return (
      <Bar tone="gold">
        <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">{place.message}</span>
        <Action onClick={() => setDismissed(true)} variant="link">
          Dismiss
        </Action>
      </Bar>
    );
  }

  return null;
}

function Bar({
  tone,
  children,
}: {
  tone: 'gold' | 'danger' | 'dark' | 'plain';
  children: React.ReactNode;
}) {
  const skin = {
    gold: 'border-gold/30 bg-gold/10 text-ink',
    danger: 'border-danger/30 bg-danger/5 text-ink',
    dark: 'border-ink bg-ink text-white',
    plain: 'border-border bg-surface text-muted',
  }[tone];

  return (
    <div className={`border-b ${skin}`} role="status">
      <div className="mx-auto flex max-w-[96rem] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 text-[0.75rem] font-semibold sm:px-8 lg:px-16">
        {children}
      </div>
    </div>
  );
}

function Action({
  children,
  href,
  onClick,
  variant,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  variant: 'dark' | 'gold' | 'outline' | 'link';
}) {
  const skin = {
    dark: 'bg-ink text-white hover:opacity-90',
    gold: 'bg-gold text-ink hover:opacity-90',
    outline: 'border border-border-strong bg-surface hover:border-ink',
    link: 'text-gold underline-offset-2 hover:underline',
  }[variant];

  const cls = `shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[0.75rem] font-extrabold transition-colors ${skin}`;

  if (href) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}
