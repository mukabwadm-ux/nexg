import { ArrowLeft, Store } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { price } from '@/components/explore/catalogue';
import { CATEGORY_ICON, CATEGORY_LABEL } from '@/components/explore/merchant-card';
import { ProductPurchase, type Pairing } from '@/components/explore/product-purchase';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { loadPromotedPrices, promoBadge } from '@/lib/promotions';
import { createPublicClient } from '@/lib/supabase/public';

/* Prices, promotions and availability change during the day, so this is kept short. */
export const revalidate = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ITEM =
  'id, name, description, price_kes, available, age_restricted, photo_path, portion_size, ingredients, allergens, dietary_labels, availability_notes, handling_notes, storage_guidance, prep_time_minutes, merchant_id, section_id, catalogue_section(name)';

type Params = { id: string; itemId: string };

/** "[Westlands Kitchen]" -> "Westlands Kitchen": some names were entered in brackets. */
const unbracket = (text: string) => text.replace(/[[\]]/g, '').trim() || text;

/* The mark on a "Goes well with" tile, read from the item's section name. */
function markFor(section: string | null | undefined): Pairing['mark'] {
  const s = (section ?? '').toLowerCase();
  if (/wine|spirit|beer|cider|cocktail|whisk|gin/.test(s)) return 'wine';
  if (/drink|juice|soda|soft|beverage|mixer|coffee|tea/.test(s)) return 'drink';
  if (/dessert|sweet|cake|pastr/.test(s)) return 'dessert';
  if (/salad|side|starter|veg|extra|add-on/.test(s)) return 'side';
  return 'item';
}

/**
 * One product, read through the public policies: a product of a business
 * that is not live, or of another merchant than the one in the address,
 * 404s. From here it goes into the basket and on to checkout.
 */
async function load(params: Params) {
  if (!UUID.test(params.id) || !UUID.test(params.itemId)) return null;
  const supabase = createPublicClient();
  const [{ data: merchant }, { data: item }] = await Promise.all([
    supabase
      .from('merchant_public')
      .select(
        'id, trading_name, category, category_key, category_other, branch_name, city_name, accepting_orders',
      )
      .eq('id', params.id)
      .maybeSingle(),
    supabase.from('catalogue_item').select(ITEM).eq('id', params.itemId).maybeSingle(),
  ]);
  const section = item?.catalogue_section as unknown as { name: string } | null;
  if (!merchant?.id || !merchant.trading_name || !item || item.merchant_id !== merchant.id) {
    return null;
  }

  const [{ data: others }, promotions, photo] = await Promise.all([
    /* Candidates for "Goes well with": the merchant's other items on sale. */
    supabase
      .from('catalogue_item')
      .select('id, name, price_kes, highlighted, sort, section_id, catalogue_section(name)')
      .eq('merchant_id', merchant.id)
      .eq('available', true)
      .neq('id', item.id)
      .not('price_kes', 'is', null)
      .limit(60),
    loadPromotedPrices(supabase, merchant.id as string),
    item.photo_path
      ? supabase.storage.from('catalogue-images').createSignedUrl(item.photo_path, 2 * 60 * 60)
      : Promise.resolve({ data: null }),
  ]);

  /*
   * Up to three: items from other sections first (a drink or a side with a
   * main, not a second main), one per section, popular ones first; then
   * anything else to fill the row. Each at its running promotional price.
   */
  const candidates = [...(others ?? [])].sort(
    (a, b) => Number(!!b.highlighted) - Number(!!a.highlighted) || (a.sort ?? 0) - (b.sort ?? 0),
  );
  const chosen: typeof candidates = [];
  const sections = new Set<string>();
  for (const c of candidates) {
    if (chosen.length >= 3) break;
    if (c.section_id === item.section_id || sections.has(c.section_id)) continue;
    sections.add(c.section_id);
    chosen.push(c);
  }
  for (const c of candidates) {
    if (chosen.length >= 3) break;
    if (!chosen.includes(c)) chosen.push(c);
  }
  const pairings: Pairing[] = chosen.map((c) => ({
    id: c.id,
    name: c.name,
    price_kes: promotions[c.id]?.promo ?? (c.price_kes as number),
    mark: markFor((c.catalogue_section as unknown as { name: string } | null)?.name),
  }));

  return {
    merchant,
    item,
    section,
    photoUrl: photo.data?.signedUrl ?? null,
    promo: promotions[item.id] ?? null,
    pairings,
  };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const found = await load(params);
  if (!found) return { title: 'Product' };
  return {
    title: `${found.item.name} · ${unbracket(found.merchant.trading_name as string)}`,
    description:
      found.item.description ??
      `${found.item.name} from ${found.merchant.trading_name}, delivered by NexG.`,
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const found = await load(params);
  if (!found) notFound();
  const { merchant, item, section, photoUrl, promo, pairings } = found;

  const category = merchant.category_key ?? merchant.category ?? 'other';
  const Icon = CATEGORY_ICON[category] ?? CATEGORY_ICON[merchant.category ?? ''] ?? Store;
  const merchantName = unbracket(merchant.trading_name as string);
  const open = merchant.accepting_orders !== false;
  const allergens = (item.allergens as string[] | null) ?? [];
  const dietary = (item.dietary_labels as string[] | null) ?? [];
  const prep = item.prep_time_minutes ? `${item.prep_time_minutes} min` : null;
  const details: [string, string][] = [
    ['Preparation', prep],
    ['Portion', item.portion_size],
    ['Ingredients', item.ingredients],
    ['Allergens', allergens.join(', ')],
    ['Dietary', dietary.join(', ')],
    ['Availability', item.availability_notes],
    ['Handling', item.handling_notes],
    ['Storage', item.storage_guidance],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  const kind = merchant.category_other ?? CATEGORY_LABEL[merchant.category ?? ''] ?? 'Item';
  const unitPrice = promo?.promo ?? item.price_kes;

  return (
    <>
      <SiteHeader />
      <div className="relative overflow-hidden bg-[#0b0907] text-white">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-48 top-10 h-[40rem] w-[40rem] rounded-full bg-[#E5B32A]/10 blur-3xl"
        />
        <main
          id="main"
          className="relative mx-auto max-w-[120rem] px-4 pb-24 pt-8 sm:px-[30px] lg:pt-10"
        >
          <nav aria-label="Breadcrumb" className="text-sm text-white/55">
            <Link href="/explore" className="transition-colors hover:text-white">
              Explore
            </Link>
            <span className="mx-2.5" aria-hidden="true">
              ›
            </span>
            <Link href={`/explore/${merchant.id}`} className="transition-colors hover:text-white">
              {merchantName}
            </Link>
            <span className="mx-2.5" aria-hidden="true">
              ›
            </span>
            <span className="font-bold text-white">{item.name}</span>
          </nav>

          <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-20">
            {/* The photo, or the category mark in a gold glow; a deep curve at the foot. */}
            <div className="relative aspect-[7/8] max-h-[46rem]">
              <div className="absolute inset-0 overflow-hidden rounded-[2.5rem] rounded-bl-[10rem] bg-gradient-to-br from-[#26221A] to-[#151310] ring-1 ring-white/10 sm:rounded-bl-[14rem]">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt={item.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_50%_50%,rgba(229,179,42,0.35),transparent_45%)]">
                    <Icon aria-hidden="true" className="text-gold h-28 w-28" strokeWidth={1.5} />
                  </span>
                )}
              </div>
              {/* Over the curve, outside the clipped photo, as drawn. */}
              {prep && (
                <span className="text-gold absolute bottom-8 left-8 rounded-full bg-black/60 px-5 py-2.5 text-base font-bold ring-1 ring-white/15 backdrop-blur sm:bottom-10 sm:left-10">
                  Preparation · {prep}
                </span>
              )}
            </div>

            <div className="lg:pt-2">
              <Link
                href={`/explore/${merchant.id}`}
                className="text-gold text-base font-bold transition-opacity hover:opacity-80"
              >
                {merchantName}
                {merchant.branch_name ? ` · ${unbracket(merchant.branch_name)}` : ''}
              </Link>
              <h1 className="mt-3 text-5xl/[1.02] font-extrabold tracking-tight sm:text-6xl/[1] lg:text-[5.5rem]/[0.98]">
                {item.name}
              </h1>
              <p className="mt-5 inline-flex rounded-full px-4 py-2 text-sm text-white/75 ring-1 ring-white/20">
                {kind}
                {section?.name ? ` · ${section.name}` : ''}
              </p>

              {promo ? (
                <p className="mt-8 flex flex-wrap items-baseline gap-3">
                  <span className="text-gold text-5xl font-extrabold">{price(promo.promo)}</span>
                  <s className="text-lg font-semibold text-white/45">{price(item.price_kes)}</s>
                  <span className="rounded-full bg-[#E5B32A]/15 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-[#FFD35F]">
                    {promoBadge(promo)} · {promo.name}
                  </span>
                </p>
              ) : (
                <p className="text-gold mt-8 text-5xl font-extrabold">{price(item.price_kes)}</p>
              )}

              {(item.age_restricted || !item.available || !open) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.age_restricted && (
                    <span className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide text-white/75 ring-1 ring-white/20">
                      21+ · ID checked on delivery
                    </span>
                  )}
                  {!item.available && (
                    <span className="text-sm font-bold text-red-400">Sold out today</span>
                  )}
                  {!open && (
                    <span className="text-sm font-bold text-red-400">
                      {merchantName} is not taking orders right now
                    </span>
                  )}
                </div>
              )}

              {item.description && (
                <p className="mt-6 text-lg leading-relaxed text-white/80">{item.description}</p>
              )}

              <div className="mt-8">
                {item.available && open && unitPrice !== null ? (
                  <ProductPurchase
                    merchant={{ id: merchant.id as string, name: merchantName }}
                    item={{ id: item.id, name: item.name, price_kes: unitPrice }}
                    pairings={pairings}
                  />
                ) : (
                  <Link
                    href={`/explore/${merchant.id}`}
                    className="inline-flex rounded-full px-5 py-3 text-sm font-extrabold ring-1 ring-white/25 transition-colors hover:bg-white/10"
                  >
                    See what else {merchantName} has
                  </Link>
                )}
              </div>

              {details.length > 0 && (
                <dl className="mt-10 space-y-3 border-t border-white/10 pt-6">
                  {details.map(([label, value]) => (
                    <div key={label} className="flex gap-4 text-base">
                      <dt className="w-28 shrink-0 text-white/55">{label}</dt>
                      <dd className="font-bold">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <p className="mt-6 text-sm leading-[1.7] text-white/50">
                Price set by {merchantName}. Delivery and service fees are shown at checkout before
                you pay.
              </p>

              <Link
                href={`/explore/${merchant.id}`}
                className="decoration-gold mt-6 inline-flex items-center gap-1.5 text-base font-bold underline decoration-2 underline-offset-[6px]"
              >
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                Everything from {merchantName}
              </Link>
            </div>
          </div>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
