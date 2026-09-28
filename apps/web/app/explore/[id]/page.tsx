import { Button, VALUE_PLACEHOLDER } from '@nexg/ui';
import { Clock, Info, MapPin, MessageSquare, Store } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CATEGORY_ICON, CATEGORY_LABEL, MerchantCard } from '@/components/explore/merchant-card';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const SELECT =
  'id, trading_name, category, category_other, cover_photo_path, branch_name, branch_address, city_name, city_slug, concierge_pick, featured, accepting_orders, explore_visible, listed_at';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supabase = createClient();
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
  const supabase = createClient();

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

  const { data: nearby } = await supabase
    .from('merchant_public')
    .select(SELECT)
    .eq('city_slug', merchant.city_slug ?? '')
    .neq('id', merchant.id)
    .limit(4);

  const category = merchant.category ?? 'other';
  const Icon = CATEGORY_ICON[category] ?? Store;
  const open = merchant.accepting_orders !== false;

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-[80rem] px-4 pb-16 pt-5 sm:px-8">
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
        <div className="bg-ink relative mt-4 flex h-52 items-center justify-center overflow-hidden rounded-2xl sm:h-64">
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
            <Icon aria-hidden="true" className="text-gold/20 h-24 w-24" />
          )}
        </div>

        <div className="border-border bg-surface relative -mt-8 rounded-2xl border p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                {merchant.trading_name}
                <span
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-bold ${
                    open ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-success' : 'bg-danger'}`}
                  />
                  {open ? 'Open now' : 'Not taking orders'}
                </span>
              </h1>
              <p className="text-muted mt-2 max-w-2xl text-[0.9375rem] font-semibold leading-[1.7]">
                {merchant.category_other ?? CATEGORY_LABEL[category]}
                {merchant.branch_name && ` · ${merchant.branch_name}`}
                {merchant.city_name && `, ${merchant.city_name}`}
              </p>
            </div>

            <Button asChild className="shrink-0">
              <Link href="/#ask">
                <span className="inline-flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Ask the concierge
                </span>
              </Link>
            </Button>
          </div>

          {/*
           * Every figure a guest would use to decide — delivery time, fee,
           * minimum order — comes from an orders domain that does not exist.
           * Bracketed rather than estimated: a guest planning around an
           * invented 25 minutes is worse than one who knows we have not said
           * (ground rule 3).
           */}
          <ul className="mt-5 flex flex-wrap gap-2">
            {[
              { icon: Clock, text: `${VALUE_PLACEHOLDER} min to your hotel` },
              { icon: MapPin, text: `Delivery from KES ${VALUE_PLACEHOLDER}` },
              { icon: Store, text: `Min. order KES ${VALUE_PLACEHOLDER}` },
            ].map((chip) => (
              <li
                key={chip.text}
                className="border-border bg-bg/60 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold"
              >
                <chip.icon aria-hidden="true" className="text-muted-light h-3.5 w-3.5" />
                {chip.text}
              </li>
            ))}
          </ul>
        </div>

        {/* --------------------------------------------------------- catalogue */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
          <section aria-label="Catalogue">
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
                {merchant.trading_name} is registered and taking orders through the concierge desk,
                but hasn’t loaded its catalogue into NexG yet. Tell a concierge what you want and
                they will confirm the price and the timing with the shop before anything is bought.
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
              <p className="text-muted mt-3 text-[0.875rem] leading-[1.7]">
                Not published yet. The desk knows who is open — ask and they will check.
              </p>
            </div>

            <div className="border-border bg-surface rounded-2xl border p-5">
              <h2 className="text-sm font-extrabold uppercase tracking-wide">Good to know</h2>
              <ul className="text-muted mt-3 space-y-2 text-[0.8125rem] leading-[1.7]">
                <li>Allergen information is available on request.</li>
                <li>Alcohol is delivered only to guests aged 18 or over, with ID.</li>
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
                  <MerchantCard key={m.id} merchant={m} />
                ))}
            </ul>
          </section>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
