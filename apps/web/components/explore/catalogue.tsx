import { Button } from '@nexg/ui';
import Link from 'next/link';

import { TodayMarker } from './today-marker';

export interface CatalogueItem {
  id: string;
  name: string;
  description: string | null;
  price_kes: number | null;
  available: boolean;
  age_restricted: boolean;
  highlighted: boolean;
}

export interface CatalogueSection {
  id: string;
  name: string;
  blurb: string | null;
  items: CatalogueItem[];
}

/** Whole shillings, grouped — "KES 1,450". */
function price(kes: number | null): string {
  if (kes === null) return 'Ask the desk';
  /*
   * Grouped by hand rather than with toLocaleString. Node and the browser do
   * not always carry the same ICU data, and a thousands separator that
   * differs between them is a hydration mismatch on every price on the page.
   */
  return 'KES ' + String(kes).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * The merchant's menu.
 *
 * There is no basket. Adding something to one only means anything once an
 * order can be placed, and a button that fills a basket nobody can check out
 * is a worse lie than no button — so each item offers the route that does
 * work, which is asking the concierge for it by name.
 */
export function Catalogue({
  merchantName,
  sections,
}: {
  merchantName: string;
  sections: CatalogueSection[];
}) {
  return (
    <div className="space-y-8">
      {/* Jump links, as the artboard's category pills. */}
      {sections.length > 1 && (
        <nav aria-label="Menu sections" className="flex flex-wrap gap-2">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#section-${section.id}`}
              className="border-border-strong bg-surface text-ink hover:border-ink rounded-full border px-3.5 py-1.5 text-[0.8125rem] font-bold transition-colors"
            >
              {section.name}
            </a>
          ))}
        </nav>
      )}

      {sections.map((section) => (
        <section key={section.id} id={`section-${section.id}`} className="scroll-mt-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-2xl font-extrabold tracking-tight">{section.name}</h2>
            {section.blurb && (
              <p className="text-muted-light text-xs font-semibold">{section.blurb}</p>
            )}
          </div>

          <ul className="mt-4 space-y-2.5">
            {section.items.map((item) => (
              <li
                key={item.id}
                className={`border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${
                  item.available ? '' : 'opacity-60'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-extrabold">
                    {item.name}
                    {item.highlighted && item.available && (
                      <span className="bg-gold-soft text-gold-text rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-wide">
                        Popular
                      </span>
                    )}
                    {item.age_restricted && (
                      <span className="border-border-strong text-muted rounded-full border px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide">
                        18+ · ID
                      </span>
                    )}
                  </p>
                  {item.description && (
                    <p className="text-muted-light mt-0.5 text-xs font-semibold leading-snug">
                      {item.description}
                    </p>
                  )}
                  {!item.available && (
                    <p className="text-danger mt-1 text-xs font-bold">Sold out today</p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-[0.9375rem] font-extrabold">{price(item.price_kes)}</span>
                  {item.available ? (
                    <Button variant="gold" size="sm" asChild>
                      <Link
                        href={`/?need=${encodeURIComponent(`${item.name} from ${merchantName}`)}`}
                      >
                        Ask for this
                      </Link>
                    </Button>
                  ) : (
                    <span className="border-border text-muted-light rounded-lg border px-3 py-1.5 text-xs font-bold">
                      Unavailable
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="text-muted-light text-xs font-semibold leading-[1.7]">
        Prices are set by {merchantName} and may differ from in-store prices. Nothing is bought
        until a concierge has quoted you and you have approved it.
      </p>
    </div>
  );
}

export interface HoursRow {
  day_of_week: number;
  opens: string | null;
  closes: string | null;
  closed: boolean;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "18:00:00" from Postgres reads better as "18:00". */
function hhmm(t: string | null): string {
  return t ? t.slice(0, 5) : '';
}

export function OpeningHours({ hours }: { hours: HoursRow[] }) {
  if (hours.length === 0) {
    return (
      <p className="text-muted mt-3 text-[0.875rem] leading-[1.7]">
        Not published yet. The desk knows who is open — ask and they will check.
      </p>
    );
  }

  // Monday first; the database stores Sunday as 0 to match Postgres and JS.
  const ordered = [...hours].sort((a, b) => ((a.day_of_week + 6) % 7) - ((b.day_of_week + 6) % 7));

  return (
    <ul className="mt-3 space-y-1.5">
      {ordered.map((row) => (
        <li
          key={row.day_of_week}
          /*
           * Which day it is gets decided in the browser, by TodayMarker. This
           * page is cached for an hour, so a "today" computed when it was
           * rendered is wrong for most readers and disagrees with their
           * browser — which is a hydration mismatch.
           */
          data-day={row.day_of_week}
          className="text-muted data-[today]:text-ink flex justify-between gap-3 text-[0.8125rem] font-semibold data-[today]:font-extrabold"
        >
          <span>{DAYS[row.day_of_week]}</span>
          <span>{row.closed ? 'Closed' : `${hhmm(row.opens)} – ${hhmm(row.closes)}`}</span>
        </li>
      ))}
      <TodayMarker />
    </ul>
  );
}
