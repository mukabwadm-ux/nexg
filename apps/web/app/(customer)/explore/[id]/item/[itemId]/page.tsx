import { ArrowLeft, Store } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { price } from '@/components/explore/catalogue';
import { CATEGORY_ICON, CATEGORY_LABEL } from '@/components/explore/merchant-card';
import { ProductActions } from '@/components/explore/product-actions';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createPublicClient } from '@/lib/supabase/public';

/* Prices and availability change during the day, so this is kept short. */
export const revalidate = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ITEM =
  'id, name, description, price_kes, available, age_restricted, photo_path, portion_size, ingredients, allergens, dietary_labels, availability_notes, handling_notes, storage_guidance, prep_time_minutes, merchant_id, catalogue_section(name)';

type Params = { id: string; itemId: string };

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
        'id, trading_name, category, category_other, branch_name, city_name, accepting_orders',
      )
      .eq('id', params.id)
      .maybeSingle(),
    supabase.from('catalogue_item').select(ITEM).eq('id', params.itemId).maybeSingle(),
  ]);
  const section = item?.catalogue_section as unknown as { name: string } | null;
  if (!merchant?.id || !merchant.trading_name || !item || item.merchant_id !== merchant.id) {
    return null;
  }

  let photoUrl: string | null = null;
  if (item.photo_path) {
    const { data } = await supabase.storage
      .from('catalogue-images')
      .createSignedUrl(item.photo_path, 2 * 60 * 60);
    photoUrl = data?.signedUrl ?? null;
  }
  return { merchant, item, section, photoUrl };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const found = await load(params);
  if (!found) return { title: 'Product' };
  return {
    title: `${found.item.name} · ${found.merchant.trading_name}`,
    description:
      found.item.description ??
      `${found.item.name} from ${found.merchant.trading_name}, delivered by NexG.`,
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const found = await load(params);
  if (!found) notFound();
  const { merchant, item, section, photoUrl } = found;

  const category = merchant.category ?? 'other';
  const Icon = CATEGORY_ICON[category] ?? Store;
  const merchantName = merchant.trading_name as string;
  const open = merchant.accepting_orders !== false;
  const allergens = (item.allergens as string[] | null) ?? [];
  const dietary = (item.dietary_labels as string[] | null) ?? [];
  const details: [string, string][] = [
    ['Portion', item.portion_size],
    ['Ingredients', item.ingredients],
    ['Allergens', allergens.join(', ')],
    ['Dietary', dietary.join(', ')],
    ['Availability', item.availability_notes],
    ['Handling', item.handling_notes],
    ['Storage', item.storage_guidance],
    ['Preparation', item.prep_time_minutes ? `${item.prep_time_minutes} min` : null],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[72rem] px-4 pb-24 pt-5 sm:px-8">
        <nav aria-label="Breadcrumb" className="text-muted-light text-xs font-semibold">
          <Link href="/explore" className="hover:text-ink transition-colors">
            Explore
          </Link>
          <span className="mx-2" aria-hidden="true">
            ›
          </span>
          <Link href={`/explore/${merchant.id}`} className="hover:text-ink transition-colors">
            {merchantName}
          </Link>
          <span className="mx-2" aria-hidden="true">
            ›
          </span>
          <span className="text-ink">{item.name}</span>
        </nav>

        <div className="mt-5 grid gap-8 md:grid-cols-2 md:items-start">
          <div className="from-bg to-border/60 border-border relative aspect-square overflow-hidden rounded-2xl border bg-gradient-to-br">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt={item.name} className="h-full w-full object-cover" />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center">
                <Icon aria-hidden="true" className="text-gold/50 h-24 w-24" />
              </span>
            )}
          </div>

          <div>
            <Link
              href={`/explore/${merchant.id}`}
              className="text-muted hover:text-ink text-[0.8125rem] font-bold transition-colors"
            >
              {merchantName}
              {merchant.branch_name ? ` · ${merchant.branch_name}` : ''}
            </Link>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">{item.name}</h1>
            <p className="text-muted-light mt-1 text-xs font-semibold">
              {merchant.category_other ?? CATEGORY_LABEL[category] ?? 'Merchant'}
              {section?.name ? ` · ${section.name}` : ''}
            </p>

            <p className="mt-4 text-2xl font-extrabold">{price(item.price_kes)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.age_restricted && (
                <span className="border-border-strong text-muted rounded-full border px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide">
                  18+ · ID checked on delivery
                </span>
              )}
              {!item.available && (
                <span className="text-danger text-xs font-bold">Sold out today</span>
              )}
              {!open && (
                <span className="text-danger text-xs font-bold">
                  {merchantName} is not taking orders right now
                </span>
              )}
            </div>

            {item.description && (
              <p className="text-muted mt-4 text-[0.9375rem] font-semibold leading-relaxed">
                {item.description}
              </p>
            )}

            <div className="mt-6">
              {item.available && open ? (
                <ProductActions
                  merchant={{ id: merchant.id as string, name: merchantName }}
                  item={{ id: item.id, name: item.name, price_kes: item.price_kes }}
                />
              ) : (
                <Link
                  href={`/explore/${merchant.id}`}
                  className="border-border-strong hover:border-ink inline-flex rounded-full border px-4 py-2 text-xs font-extrabold transition-colors"
                >
                  See what else {merchantName} has
                </Link>
              )}
            </div>

            {details.length > 0 && (
              <dl className="border-border mt-8 divide-y rounded-xl border text-[0.8125rem]">
                {details.map(([label, value]) => (
                  <div key={label} className="border-border flex gap-4 px-4 py-2.5">
                    <dt className="text-muted w-28 shrink-0 font-extrabold">{label}</dt>
                    <dd className="font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
            )}

            <p className="text-muted-light mt-6 text-xs font-semibold leading-[1.7]">
              Price set by {merchantName}. Delivery and service fees are shown at checkout before
              you pay.
            </p>

            <Link
              href={`/explore/${merchant.id}`}
              className="text-ink mt-6 inline-flex items-center gap-1.5 text-sm font-bold underline underline-offset-4"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              Everything from {merchantName}
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
