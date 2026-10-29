import { AddToCart } from '@/components/cart/add-to-cart';

import { TodayMarker } from './today-marker';

export interface CatalogueItem {
  id: string;
  name: string;
  description: string | null;
  price_kes: number | null;
  available: boolean;
  age_restricted: boolean;
  highlighted: boolean;
  photo_url?: string | null;
  photo_path?: string | null;
}

export interface CatalogueSection {
  id: string;
  name: string;
  blurb: string | null;
  items: CatalogueItem[];
}

/** Whole shillings, grouped — "KES 1,450". */
export function price(kes: number | null): string {
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
 * Items go into a one-merchant basket that is priced and paid at /checkout.
 */
export function Catalogue({
  merchantId,
  merchantName,
  sections,
}: {
  merchantId: string;
  merchantName: string;
  sections: CatalogueSection[];
}) {
  const popular = sections.flatMap((s) => s.items).filter((i) => i.highlighted && i.available);
  const groups: CatalogueSection[] =
    popular.length > 0
      ? [
          { id: 'popular', name: 'Most ordered', blurb: null, items: popular.slice(0, 6) },
          ...sections,
        ]
      : sections;

  return (
    <div className="space-y-8">
      {/* Sticky section tabs, as in the reference. */}
      {groups.length > 1 && (
        <nav
          aria-label="Menu sections"
          className="bg-bg/95 border-border sticky top-[4.5rem] z-20 -mx-1 flex gap-1 overflow-x-auto border-b px-1 py-2 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {groups.map((section, index) => (
            <a
              key={section.id}
              href={`#section-${section.id}`}
              className={`hover:bg-surface shrink-0 rounded-full px-3.5 py-1.5 text-[0.8125rem] font-bold transition-colors ${
                index === 0 ? 'bg-ink hover:bg-ink text-white' : 'text-muted hover:text-ink'
              }`}
            >
              {section.name}
            </a>
          ))}
        </nav>
      )}

      {groups.map((section) => (
        <section key={section.id} id={`section-${section.id}`} className="scroll-mt-32">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-2xl font-extrabold tracking-tight">{section.name}</h2>
            {section.blurb && (
              <p className="text-muted-light text-xs font-semibold">{section.blurb}</p>
            )}
          </div>

          <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {section.items.map((item) => (
              <li
                key={item.id}
                className={`border-border bg-surface hover:border-gold flex min-h-[7.5rem] overflow-hidden rounded-xl border transition-colors ${
                  item.available ? '' : 'opacity-60'
                }`}
              >
                <div className="flex min-w-0 flex-1 flex-col justify-between p-3.5">
                  <div>
                    <p className="text-[0.9375rem] font-extrabold leading-snug">{item.name}</p>
                    {item.description && (
                      <p className="text-muted-light mt-1 line-clamp-2 text-xs font-semibold leading-snug">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[0.9375rem] font-extrabold">{price(item.price_kes)}</span>
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
                    {!item.available && (
                      <span className="text-danger text-xs font-bold">Sold out today</span>
                    )}
                  </div>
                </div>

                <div className="from-bg to-border/40 relative flex w-28 shrink-0 items-center justify-center bg-gradient-to-br sm:w-32">
                  {item.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.photo_url}
                      alt={item.name}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : null}
                  {item.available ? (
                    <div className="absolute bottom-2 right-2 z-10">
                      <AddToCart merchant={{ id: merchantId, name: merchantName }} item={item} />
                    </div>
                  ) : (
                    <span className="text-muted-light text-[0.625rem] font-bold uppercase">
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
        Prices are set by {merchantName}. Delivery and service fees are shown at checkout before you
        pay.
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
