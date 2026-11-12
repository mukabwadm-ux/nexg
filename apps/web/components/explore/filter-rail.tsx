import Link from 'next/link';

import { Button } from '@nexg/ui';

export interface FilterState {
  city: string;
  category: string | null;
  area: string | null;
  zone: string | null;
  openNow: boolean;
  picksOnly: boolean;
}

/**
 * The filter rail from the `Explore` artboard.
 *
 * Every control is a link, so a filtered view is a URL someone can send. The
 * artboard also draws a price-band filter and an "under 30 min" toggle; there
 * is no price or delivery-time data behind either, so they are not rendered —
 * a checkbox that silently does nothing is worse than one that is missing
 * (ground rule 3).
 */
export function FilterRail({
  state,
  areas,
  hrefFor,
}: {
  state: FilterState;
  areas: string[];
  hrefFor: (patch: Partial<FilterState>) => string;
}) {
  const anyFilter = state.category || state.area || state.zone || state.openNow || state.picksOnly;

  return (
    <aside aria-label="Filters" className="space-y-4">
      <div className="text-ink bg-surface rounded-3xl p-6 sm:p-7">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold">Filters</h2>
          {anyFilter && (
            <Link
              href={hrefFor({
                category: null,
                area: null,
                zone: null,
                openNow: false,
                picksOnly: false,
              })}
              className="text-muted-light hover:text-ink text-xs font-bold transition-colors"
            >
              Clear
            </Link>
          )}
        </div>

        <fieldset className="mt-5">
          <legend className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-[0.18em]">
            Availability
          </legend>
          <ul className="mt-3.5 space-y-3">
            {[
              {
                label: 'Open now',
                on: state.openNow,
                href: hrefFor({ openNow: !state.openNow }),
              },
              {
                label: 'Concierge picks only',
                on: state.picksOnly,
                href: hrefFor({ picksOnly: !state.picksOnly }),
              },
            ].map((option) => (
              <li key={option.label}>
                <Link
                  href={option.href}
                  aria-pressed={option.on}
                  className="group flex items-center gap-2.5"
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[0.625rem] font-bold transition-colors ${
                      option.on
                        ? 'border-gold bg-gold text-ink'
                        : 'border-border-strong group-hover:border-ink bg-white'
                    }`}
                  >
                    {option.on ? '✓' : ''}
                  </span>
                  <span className="text-[0.9375rem] font-semibold">{option.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </fieldset>

        {areas.length > 0 && (
          <fieldset className="mt-6">
            <legend className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-[0.18em]">
              Area
            </legend>
            <ul className="mt-3.5 space-y-3">
              {areas.map((area) => {
                const on = state.area === area;
                return (
                  <li key={area}>
                    <Link
                      href={hrefFor({ area: on ? null : area })}
                      aria-pressed={on}
                      className="group flex items-center gap-2.5"
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[0.625rem] font-bold transition-colors ${
                          on
                            ? 'border-gold bg-gold text-ink'
                            : 'border-border-strong group-hover:border-ink bg-white'
                        }`}
                      >
                        {on ? '✓' : ''}
                      </span>
                      <span className="text-[0.9375rem] font-semibold">
                        {area.replace(/[[\]]/g, '').trim() || area}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        )}
      </div>

      <div className="rounded-3xl border border-[#FDD128]/30 bg-[#17140F] p-6 text-white sm:p-7">
        <p className="text-gold text-[0.6875rem] font-extrabold uppercase tracking-[0.2em]">
          Can’t find it?
        </p>
        <p className="mt-3 text-xl font-extrabold leading-snug">
          Ask a concierge. We’ll source it, wherever it is.
        </p>
        <p className="mt-3 text-sm leading-[1.7] text-white/60">
          A specific dish, a pharmacy that’s still open, a gift from a shop we haven’t listed yet.
        </p>
        <Button variant="gold" asChild className="mt-5 h-12 w-full rounded-xl text-base">
          <Link href="/#ask">Make a request</Link>
        </Button>
      </div>
    </aside>
  );
}
