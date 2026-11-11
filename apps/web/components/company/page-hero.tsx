/**
 * The dark rounded header the company pages (About us, How we work, Blog,
 * Affiliate) open with: an eyebrow, a headline with one gold phrase, and a
 * short lede. Same shape as the Help page's header.
 */
export function PageHero({
  eyebrow,
  title,
  gold,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  /** Printed after the title, in gold. */
  gold?: string;
  lede: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-[120rem] px-4 pt-6 sm:px-[30px]">
      <div className="bg-ink relative overflow-hidden rounded-[2rem] border-t-[3px] border-[#E5B32A] px-6 py-16 text-white sm:px-12 sm:py-20 lg:px-16 lg:py-24">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-40 h-[28rem] w-[28rem] rounded-full bg-[#E5B32A]/15 blur-3xl"
        />
        <div className="relative max-w-3xl">
          <p className="text-gold text-xs font-extrabold uppercase tracking-[0.2em]">{eyebrow}</p>
          <h1 className="mt-5 text-4xl/[1.06] font-extrabold tracking-tight sm:text-5xl/[1.06] lg:text-[4rem]/[1.04]">
            {title}
            {gold && (
              <>
                {' '}
                <span className="text-gold">{gold}</span>
              </>
            )}
          </h1>
          <p className="mt-5 max-w-2xl text-base font-semibold leading-[1.75] text-white/65 sm:text-lg">
            {lede}
          </p>
          {children}
        </div>
      </div>
    </section>
  );
}

/** A section heading with its gold eyebrow, used under the hero. */
export function SectionHead({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-gold-text text-xs font-extrabold uppercase tracking-[0.2em]">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.75rem]">
        {title}
      </h2>
      {lede && <p className="text-muted mt-3 text-base font-semibold leading-[1.75]">{lede}</p>}
    </div>
  );
}
