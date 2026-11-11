import Link from 'next/link';

import { AddToCart } from '@/components/cart/add-to-cart';
import { productHref } from '@/lib/best-sellers';
import { promoBadge, type PromoPrice, type PromoPrices } from '@/lib/promotions';

import { SectionTabs } from './section-tabs';
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
  portion_size?: string | null;
  ingredients?: string | null;
  allergens?: string[];
  dietary_labels?: string[];
  availability_notes?: string | null;
  handling_notes?: string | null;
  storage_guidance?: string | null;
  prep_time_minutes?: number | null;
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
/*
 * The heading over a merchant's list, by kind of business: a restaurant has a
 * menu, a shop has products, a laundry or a salon has services.
 */
const SERVICE_CATEGORIES = new Set([
  'laundry',
  'laundry_cleaning',
  'beauty',
  'beauty_fashion',
  'wellness',
  'health',
  'vehicle_services',
  'vehicle_rentals',
  'financial_services',
  'logistics_shipping',
  'concierge_services',
  'travel_tours',
  'airport_transfers',
  'experiences',
]);
const MENU_CATEGORIES = new Set(['restaurant', 'restaurants_food']);

export function catalogueTitle(category: string | null | undefined): string {
  if (category && MENU_CATEGORIES.has(category)) return 'Menu';
  if (category && SERVICE_CATEGORIES.has(category)) return 'Services';
  return 'Shop';
}

export function Catalogue({
  merchantId,
  merchantName,
  category = null,
  sections,
  promotions = {},
}: {
  merchantId: string;
  merchantName: string;
  /** The merchant's category, which names the list (Menu, Shop, Services). */
  category?: string | null;
  sections: CatalogueSection[];
  /** Running promotions by item: the price shown is the price charged. */
  promotions?: PromoPrices;
}) {
  const popular = sections.flatMap((s) => s.items).filter((i) => i.highlighted && i.available);
  const groups: CatalogueSection[] =
    popular.length > 0
      ? [
          { id: 'popular', name: 'Most ordered', blurb: null, items: popular.slice(0, 6) },
          ...sections,
        ]
      : sections;

  const itemCount = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="space-y-8">
      {/* What this list is, in the business's own terms: a menu, a shop, services. */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-3xl font-extrabold tracking-tight">{catalogueTitle(category)}</h2>
        <p className="text-muted text-sm font-semibold">
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
          {sections.length > 1 && ` · ${sections.length} sections`}
        </p>
      </div>

      {/* Sticky section tabs: the merchant's own sections, whatever the business. */}
      {groups.length > 1 && (
        <SectionTabs sections={groups.map((g) => ({ id: g.id, name: g.name }))} />
      )}

      {groups.map((section) => (
        <section key={section.id} id={`section-${section.id}`} className="scroll-mt-32">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-2xl font-extrabold tracking-tight">{section.name}</h3>
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
                    <p className="text-[0.9375rem] font-extrabold leading-snug">
                      <Link
                        href={productHref(merchantId, item.id)}
                        className="hover:underline hover:underline-offset-4"
                      >
                        {item.name}
                      </Link>
                    </p>
                    {item.description && (
                      <p className="text-muted-light mt-1 line-clamp-2 text-xs font-semibold leading-snug">
                        {item.description}
                      </p>
                    )}
                    {(item.portion_size ||
                      item.ingredients ||
                      item.allergens?.length ||
                      item.dietary_labels?.length ||
                      item.availability_notes ||
                      item.handling_notes ||
                      item.storage_guidance ||
                      item.prep_time_minutes) && (
                      <dl className="text-muted-light mt-2 space-y-1 text-[0.6875rem] font-semibold leading-snug">
                        {item.portion_size && (
                          <div>
                            <dt className="inline font-extrabold">Portion: </dt>
                            <dd className="inline">{item.portion_size}</dd>
                          </div>
                        )}
                        {item.ingredients && (
                          <div>
                            <dt className="inline font-extrabold">Ingredients: </dt>
                            <dd className="inline">{item.ingredients}</dd>
                          </div>
                        )}
                        {!!item.allergens?.length && (
                          <div>
                            <dt className="inline font-extrabold">Allergens: </dt>
                            <dd className="inline">{item.allergens.join(', ')}</dd>
                          </div>
                        )}
                        {!!item.dietary_labels?.length && (
                          <div>
                            <dt className="inline font-extrabold">Dietary: </dt>
                            <dd className="inline">{item.dietary_labels.join(', ')}</dd>
                          </div>
                        )}
                        {item.availability_notes && (
                          <div>
                            <dt className="inline font-extrabold">Availability: </dt>
                            <dd className="inline">{item.availability_notes}</dd>
                          </div>
                        )}
                        {item.handling_notes && (
                          <div>
                            <dt className="inline font-extrabold">Handling: </dt>
                            <dd className="inline">{item.handling_notes}</dd>
                          </div>
                        )}
                        {item.storage_guidance && (
                          <div>
                            <dt className="inline font-extrabold">Storage: </dt>
                            <dd className="inline">{item.storage_guidance}</dd>
                          </div>
                        )}
                        {item.prep_time_minutes && (
                          <div>
                            <dt className="inline font-extrabold">Item prep: </dt>
                            <dd className="inline">{item.prep_time_minutes} min</dd>
                          </div>
                        )}
                      </dl>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <ItemPrice listKes={item.price_kes} promo={promotions[item.id]} />
                    {item.highlighted && item.available && (
                      <span className="bg-gold-soft text-gold-text rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-wide">
                        Popular
                      </span>
                    )}
                    {item.age_restricted && (
                      <span className="border-border-strong text-muted rounded-full border px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide">
                        21+ · ID
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
                      <AddToCart
                        merchant={{ id: merchantId, name: merchantName }}
                        item={{ ...item, price_kes: promotions[item.id]?.promo ?? item.price_kes }}
                      />
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

/** The item's price, or its promotional price with the list price struck through. */
function ItemPrice({ listKes, promo }: { listKes: number | null; promo?: PromoPrice }) {
  if (!promo) return <span className="text-[0.9375rem] font-extrabold">{price(listKes)}</span>;
  return (
    <>
      <span className="text-danger text-[0.9375rem] font-extrabold">{price(promo.promo)}</span>
      <s className="text-muted-light text-xs font-semibold">{price(listKes)}</s>
      <span className="bg-danger-bg text-danger rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-wide">
        {promoBadge(promo)}
      </span>
    </>
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
