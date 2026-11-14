import type * as React from 'react';

/** The page width and gutters every section of the merchants page shares. */
export const CONTAINER = 'mx-auto max-w-[120rem] px-4 sm:px-[30px]';

/** Section headings across the merchants page. */
export const H2 =
  'text-3xl font-extrabold leading-[1.08] tracking-tight sm:text-4xl lg:text-[2.75rem]';

/**
 * The colours a card on this page takes from the theme: white on the cream
 * page, a raised charcoal on the dark one. Set once on <main>.
 *
 * Cards here use this rather than bg-surface on purpose: the site-wide dark
 * rules keep bg-surface cards cream, and the merchants design draws its cards
 * dark in the dark theme. Text inside follows the page colours either way.
 */
export const THEME_VARS = '[--m-card:#ffffff] dark:[--m-card:#1b1d20]';

/** A card that follows the theme (see THEME_VARS). */
export const CARD = 'border-border border bg-[var(--m-card)]';

/** The small gold section label from the merchants design. */
export function SectionLabel({
  children,
  onDark = false,
}: {
  children: React.ReactNode;
  onDark?: boolean;
}) {
  return (
    <p
      className={`text-[0.6875rem] font-extrabold uppercase tracking-[0.18em] ${
        onDark ? 'text-gold' : 'text-gold-text dark:text-gold'
      }`}
    >
      {children}
    </p>
  );
}

/** The words a heading leans on. Plain now: the gold marker under them was removed. */
export function Highlight({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/** The merchants page's entrances play a little quicker than the homepage's. */
export const MERCHANT_SPEED = 1.25;
