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

/** A gold marker under the words a heading leans on. Wraps cleanly across lines. */
export function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="[-webkit-box-decoration-break:clone] [box-decoration-break:clone]"
      style={{
        backgroundImage:
          'linear-gradient(to top, transparent 0.04em, rgb(var(--gold-rgb) / 0.75) 0.04em, rgb(var(--gold-rgb) / 0.75) 0.22em, transparent 0.22em)',
      }}
    >
      {children}
    </span>
  );
}
