'use client';

import { useLocation } from '@nexg/location';
import * as React from 'react';

/**
 * Hold a second dialog back until the location question is
 * settled.
 *
 * Both the location sheet and the language card are first-visit
 * asks, and both were opening at once — two modals over each
 * other, one of them half-hidden behind the other. Each was
 * correct alone and the pair was not, which is the sort of thing
 * only showing up in a browser catches.
 *
 * Location goes first because it changes what the page shows;
 * language only changes how it reads, and a visitor who has
 * skipped the first is in no mood for a second. If the sheet
 * never opens — a QR arrival, a returning device, a signed-in
 * guest — this renders immediately and nothing is delayed.
 */
export function AfterLocationSettled({ children }: { children: React.ReactNode }) {
  const { sheetOpen, asked, ready, place } = useLocation();

  /* Settled means: the sheet is closed, and either it has been
     answered this visit or there was never anything to answer. */
  const settled = ready && !sheetOpen && (asked || place !== null);

  if (!settled) return null;
  return <>{children}</>;
}
