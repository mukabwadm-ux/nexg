import type * as React from 'react';

/** The page width and gutters every section of the merchants page shares. */
export const CONTAINER = 'mx-auto max-w-[120rem] px-4 sm:px-[30px]';

/** Section headings across the merchants page. */
export const H2 =
  'text-3xl font-extrabold leading-[1.08] tracking-tight sm:text-4xl lg:text-[2.75rem]';

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
        onDark ? 'text-gold' : 'text-gold-text'
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
