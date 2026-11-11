import { Button } from '@nexg/ui';
import { CalendarDays, Clock, Info, MapPin, MessageSquare, Store } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  Catalogue,
  type CatalogueSection,
  type HoursRow,
  OpeningHours,
} from '@/components/explore/catalogue';
import { DeliveryFee } from '@/components/explore/delivery-fee';
import { CATEGORY_ICON, CATEGORY_LABEL, MerchantCard } from '@/components/explore/merchant-card';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import {
  durationLabel,
  priceLabel,
  PUBLIC_RESOURCE_COLUMNS,
  type PublicResource,
} from '@/lib/booking/customer';
import type { DeliveryRate } from '@/lib/delivery-fee';
import { loadPromotedPrices } from '@/lib/promotions';
import { createPublicClient } from '@/lib/supabase/public';

/*
 * Cached for a minute. Long enough to spare a round trip per view, short
 * enough that a promotion starting or ending shows within a minute (checkout
 * always charges the current price either way).
 */
export const revalidate = 60;

const SELECT =
  'id, trading_name, category, category_key, category_other, cover_photo_path, branch_name, branch_address, branch_latitude, branch_longitude, city_name, city_slug, concierge_pick, featured, accepting_orders, explore_visible, listed_at, prep_minutes';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('merchant_public')
    .select('trading_name, city_name')
    .eq('id', params.id)
    .maybeSingle();

  if (!data?.trading_name) return { title: 'Merchant' };
  return {
    title: data.trading_name,
    description: `Order from ${data.trading_name} in ${data.city_name ?? 'Kenya'} with the NexG concierge.`,
  };
}

export default async function MerchantPage({ params }: { params: { id: string } }) {
  const supabase = createPublicClient();

  /*
   * Read through merchant_public, never the base table. It cannot return a
   * business that is not live, so a delisted or suspended merchant 404s here
   * without this page having to know the rule (ground rule 5).
   */
  const { data: merchant } = await supabase
    .from('merchant_public')
    .select(SELECT)
    .eq('id', params.id)
    .maybeSingle();

  if (!merchant?.id || !merchant.trading_name) notFound();

  const [{ data: nearby }, { data: sections }, { data: hours }, promotions, { data: bookable }] =
    await Promise.all([
      supabase
        .from('merchant_public')
        .select(SELECT)
        .eq('city_slug', merchant.city_slug ?? '')
        .neq('id', merchant.id)
        .limit(4),
      /*
       * The policy on these tables only returns rows for a live business, so
       * nothing here has to re-check the status the page already relied on.
       */
      supabase
        .from('catalogue_section')
        .select(
          'id, name, blurb, sort, catalogue_item(id, name, description, price_kes, available, age_restricted, highlighted, sort, photo_path, portion_size, ingredients, allergens, dietary_labels, availability_notes, handling_notes, storage_guidance, prep_time_minutes)',
        )
        .eq('merchant_id', params.id)
        .order('sort', { ascending: true }),
      supabase
        .from('merchant_hours')
        .select('day_of_week, opens, closes, closed')
        .eq('merchant_id', params.id),
      loadPromotedPrices(supabase, params.id),
      // Only active resources of a live business are readable without signing in.
      supabase
        .from('bookable_resource')
        .select(PUBLIC_RESOURCE_COLUMNS)
        .eq('merchant_id', params.id)
        .eq('active', true)
        .order('created_at'),
    ]);
  const resources = (bookable ?? []) as unknown as PublicResource[];

  /*
   * The prices in the chips under the name: the city's delivery rate card
   * (priced from the visitor's spot on the client) and this category's
   * minimum order. Either can be unset; its chip is then left out.
   */
  const citySlug = merchant.city_slug ?? 'nairobi';
  const [{ data: rateRows }, { data: minOrder }] = await Promise.all([
    supabase.rpc('rpc_delivery_rate', { p_city_slug: citySlug }),
    supabase.rpc('rpc_min_order', {
      p_city_slug: citySlug,
      p_category: merchant.category_key ?? merchant.category ?? '',
    }),
  ]);
  const rateRow = rateRows?.[0];
  const deliveryRate: DeliveryRate | null =
    rateRow && rateRow.base != null && rateRow.per_km != null && rateRow.max_km != null
      ? { base: Number(rateRow.base), perKm: Number(rateRow.per_km), maxKm: Number(rateRow.max_km) }
      : null;
  const prepMinutes =
    merchant.prep_minutes != null && merchant.prep_minutes > 0
      ? Math.round(merchant.prep_minutes)
      : null;

  const catalogueItems = (sections ?? []).flatMap((section) => section.catalogue_item ?? []);
  const photoPaths = catalogueItems.flatMap((item) => (item.photo_path ? [item.photo_path] : []));
  const { data: signedPhotos } = photoPaths.length
    ? await supabase.storage.from('catalogue-images').createSignedUrls(photoPaths, 2 * 60 * 60)
    : { data: [] };
  const photoUrls = new Map(
    (signedPhotos ?? []).flatMap((photo) =>
      photo.signedUrl ? [[photo.path, photo.signedUrl]] : [],
    ),
  );
  const menu: CatalogueSection[] = (sections ?? [])
    .map((section) => ({
      id: section.id,
      name: section.name,
      blurb: section.blurb,
      items: [...((section.catalogue_item as CatalogueSection['items']) ?? [])]
        .map((item) => ({
          ...item,
          photo_url: item.photo_path ? (photoUrls.get(item.photo_path) ?? null) : null,
        }))
        .sort(
          (a, b) => ((a as { sort?: number }).sort ?? 0) - ((b as { sort?: number }).sort ?? 0),
        ),
    }))
    // A section with nothing in it is a heading over blank space.
    .filter((section) => section.items.length > 0);

  const category = merchant.category ?? 'other';
  const Icon = CATEGORY_ICON[category] ?? Store;
  const open = merchant.accepting_orders !== false;

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-[120rem] px-4 pb-16 pt-5 sm:px-[30px]">
        <nav aria-label="Breadcrumb" className="text-muted-light text-xs font-semibold">
          <Link href="/explore" className="hover:text-ink transition-colors">
            Explore
          </Link>
          <span className="mx-2" aria-hidden="true">
            ›
          </span>
          <Link href={`/explore?category=${category}`} className="hover:text-ink transition-colors">
            {CATEGORY_LABEL[category] ?? 'Merchants'}
          </Link>
          <span className="mx-2" aria-hidden="true">
            ›
          </span>
          <span className="text-ink">{merchant.trading_name}</span>
        </nav>

        {/* ------------------------------------------------------------ hero */}
        <div className="bg-ink relative mt-4 flex h-56 items-end overflow-hidden rounded-2xl sm:h-72">
          {merchant.concierge_pick && (
            <span className="bg-gold text-ink absolute left-4 top-4 z-10 rounded-full px-3 py-1.5 text-[0.625rem] font-extrabold uppercase tracking-[0.12em]">
              ★ Concierge pick
            </span>
          )}
          {merchant.cover_photo_path ? (
            <Image
              src={merchant.cover_photo_path}
              alt=""
              fill
              sizes="(min-width: 1280px) 80rem, 100vw"
              className="object-cover opacity-70"
              priority
            />
          ) : (
            <Icon
              aria-hidden="true"
              className="text-gold/20 absolute right-8 top-1/2 h-32 w-32 -translate-y-1/2"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          <div className="relative p-5 text-white sm:p-8">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
              {merchant.trading_name}
            </h1>
            <p className="mt-2 max-w-2xl text-[0.9375rem] font-semibold text-white/75">
              {merchant.category_other ?? CATEGORY_LABEL[category]}
              {merchant.branch_name && ` · ${merchant.branch_name}`}
              {merchant.city_name && `, ${merchant.city_name}`}
            </p>
          </div>
        </div>

        <div className="border-border bg-surface mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 sm:px-5">
          {/*
           * Every figure a guest would use to decide — delivery time, fee,
           * minimum order — comes from an orders domain that does not exist.
           * Bracketed rather than estimated: a guest planning around an
           * invented 25 minutes is worse than one who knows we have not said
           * (ground rule 3).
           */}
          <ul className="flex flex-wrap items-center gap-2">
            <li
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-bold ${
                open ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-success' : 'bg-danger'}`}
              />
              {open ? 'Open now' : 'Not taking orders'}
            </li>
            {/* The merchant's own preparation time; no chip when they have not set one. */}
            {prepMinutes && (
              <li
                className="border-border bg-bg/60 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold"
                title="Preparation time set by the merchant"
              >
                <Clock aria-hidden="true" className="text-muted-light h-3.5 w-3.5" />
                Ready in {prepMinutes} min
              </li>
            )}
            {/* Priced from the visitor's spot, or "from" the base fee without one. */}
            {deliveryRate && (
              <li className="border-border bg-bg/60 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold">
                <MapPin aria-hidden="true" className="text-muted-light h-3.5 w-3.5" />
                <DeliveryFee
                  rate={deliveryRate}
                  lat={merchant.branch_latitude ?? null}
                  lng={merchant.branch_longitude ?? null}
                  className="text-xs font-semibold"
                />
              </li>
            )}
            {/* The category's minimum order, once one is set in Admin. */}
            {typeof minOrder === 'number' && minOrder > 0 && (
              <li className="border-border bg-bg/60 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold">
                <Store aria-hidden="true" className="text-muted-light h-3.5 w-3.5" />
                Min. order KES {minOrder.toLocaleString('en-KE')}
              </li>
            )}
          </ul>

          <Button asChild size="sm" className="shrink-0">
            <Link href="/#ask">
              <span className="inline-flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Ask the concierge
              </span>
            </Link>
          </Button>
        </div>

        {/* --------------------------------------------------------- catalogue */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
          <section aria-label="Catalogue" className="space-y-6">
            {resources.length > 0 && <BookSection merchantId={merchant.id} resources={resources} />}
            {menu.length > 0 ? (
              <Catalogue
                merchantId={merchant.id}
                merchantName={merchant.trading_name}
                sections={menu}
                promotions={promotions}
              />
            ) : resources.length > 0 ? null : (
              <div className="border-border bg-surface rounded-2xl border p-6 sm:p-8">
                <span
                  aria-hidden="true"
                  className="bg-bg text-muted-light flex h-12 w-12 items-center justify-center rounded-xl"
                >
                  <Info className="h-5 w-5" />
                </span>
                <h2 className="mt-4 text-xl font-extrabold tracking-tight">
                  The menu isn’t online yet
                </h2>
                <p className="text-muted mt-2 max-w-xl text-[0.9375rem] leading-[1.8]">
                  {merchant.trading_name} is registered and taking orders through the concierge
                  desk, but hasn’t loaded its catalogue into NexG yet. Tell a concierge what you
                  want and they will confirm the price and the timing with the shop before anything
                  is bought.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button asChild>
                    <Link href="/#ask">Ask for something from here</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/explore">Back to Explore</Link>
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* ------------------------------------------------------- aside */}
          <aside className="space-y-4">
            <div className="border-border bg-surface rounded-2xl border p-5">
              <h2 className="text-sm font-extrabold uppercase tracking-wide">Where they are</h2>
              <p className="text-muted mt-3 text-[0.875rem] font-semibold leading-[1.7]">
                {merchant.branch_address ?? merchant.branch_name ?? merchant.city_name ?? '—'}
              </p>
              {/* The map arrives with the Maps key; a dead "view on map" link
                  would be worse than none. */}
            </div>

            <div className="border-border bg-surface rounded-2xl border p-5">
              <h2 className="text-sm font-extrabold uppercase tracking-wide">Opening hours</h2>
              <OpeningHours hours={(hours ?? []) as HoursRow[]} />
            </div>

            <div className="border-border bg-surface rounded-2xl border p-5">
              <h2 className="text-sm font-extrabold uppercase tracking-wide">Good to know</h2>
              <ul className="text-muted mt-3 space-y-2 text-[0.8125rem] leading-[1.7]">
                <li>Allergen information is available on request.</li>
                <li>Alcohol is delivered only to guests aged 21 or over, with ID.</li>
                <li>Nothing is bought until you approve the concierge’s quote.</li>
              </ul>
            </div>
          </aside>
        </div>

        {/* ---------------------------------------------------------- nearby */}
        {(nearby ?? []).length > 0 && (
          <section className="mt-12">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-extrabold tracking-tight">
                Also delivering to {merchant.city_name}
              </h2>
              <Link
                href="/explore"
                className="text-ink text-sm font-bold underline underline-offset-4"
              >
                Back to Explore
              </Link>
            </div>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {(nearby ?? [])
                .filter(
                  (m): m is typeof m & { id: string; trading_name: string } =>
                    Boolean(m.id) && Boolean(m.trading_name) && m.explore_visible !== false,
                )
                .map((m) => (
                  <MerchantCard key={m.id} merchant={m} deliveryRate={deliveryRate} />
                ))}
            </ul>
          </section>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

function BookSection({
  merchantId,
  resources,
}: {
  merchantId: string;
  resources: PublicResource[];
}) {
  return (
    <div id="book" className="border-border bg-surface rounded-2xl border p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="bg-gold/15 text-ink flex h-10 w-10 items-center justify-center rounded-xl"
        >
          <CalendarDays className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Book a time</h2>
          <p className="text-muted text-[0.8125rem] font-semibold">
            Pick a time that suits you. You pay at the venue.
          </p>
        </div>
      </div>
      <ul className="divide-border mt-4 divide-y">
        {resources.map((r) => {
          const length = durationLabel(r.duration_minutes);
          return (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block text-[0.9375rem] font-extrabold">{r.name}</span>
                {r.description && (
                  <span className="text-muted block text-[0.8125rem] leading-[1.6]">
                    {r.description}
                  </span>
                )}
                <span className="text-muted block text-[0.75rem] font-bold">
                  {priceLabel(r)}
                  {length && ` · ${length}`}
                  {r.model === 'capacity' && ' · Set sessions'}
                </span>
              </span>
              <Button asChild size="sm" className="shrink-0">
                <Link href={`/book/${merchantId}?resource=${r.id}`}>Book</Link>
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
