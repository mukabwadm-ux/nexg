'use client';

import { useLocation } from '@nexg/location';
import { ArrowRight, Clock, MapPin, Navigation } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import * as React from 'react';

import { rankStores, type NearbyStore, type RankedStore } from '@/lib/stores-near';

import { CardRail } from './card-rail';

/** The same card size as Best sellers, so the two rows line up. */
const STORE_CARD = 'w-[16.5rem] shrink-0 snap-start sm:w-[18rem] lg:w-[calc((100%-3rem)/4)]';

/**
 * "Find Stores Near You": the live stores that deliver to where the visitor
 * is, nearest first, read from the location pill. With no spot set, or
 * nothing near it, the row shows Nairobi's usual stores instead, so the
 * section is never empty (lib/stores-near.ts decides the order).
 */

/* Merchant categories come in two spellings (the merchant record and the
   category config); both lead to the same label and stand-in photo. */
const CATEGORY: Record<string, { label: string; photo: string }> = {
  restaurant: { label: 'Restaurant', photo: 'restaurants' },
  restaurants_food: { label: 'Restaurant', photo: 'restaurants' },
  bar_liquor: { label: 'Drinks', photo: 'drinks' },
  alcohol_beverages: { label: 'Drinks', photo: 'drinks' },
  florist: { label: 'Flowers & gifts', photo: 'flowers' },
  flowers_gifts: { label: 'Flowers & gifts', photo: 'flowers' },
  gift_shop: { label: 'Gifts', photo: 'gifts' },
  laundry: { label: 'Laundry', photo: 'laundry' },
  laundry_cleaning: { label: 'Laundry', photo: 'laundry' },
  beauty_fashion: { label: 'Beauty', photo: 'beauty' },
  beauty: { label: 'Beauty', photo: 'beauty' },
  pharmacy: { label: 'Pharmacy', photo: 'pharmacy' },
  health: { label: 'Health', photo: 'health' },
  supermarket: { label: 'Groceries', photo: 'groceries' },
  groceries_essentials: { label: 'Groceries', photo: 'groceries' },
};

/** "[Westlands Kitchen]" → "Westlands Kitchen": some names were entered in brackets. */
const unbracket = (text: string) => text.replace(/[[\]]/g, '').trim() || text;

/** 0.4 → "400 m", 2.36 → "2.4 km", 23.7 → "24 km". */
const formatKm = (km: number) =>
  km < 1
    ? `${Math.max(100, Math.round(km * 10) * 100)} m`
    : km < 10
      ? `${km.toFixed(1)} km`
      : `${Math.round(km)} km`;

/** "22:00:00" → "22:00". */
const hhmm = (time: string | null) => (time ? time.slice(0, 5) : null);

function StoreCard({ store }: { store: RankedStore }) {
  const category = CATEGORY[store.category_key ?? ''] ?? CATEGORY[store.category ?? ''];
  const open = store.accepting_orders !== false && !store.closed_today;
  const minutes =
    store.prep_minutes != null && store.prep_minutes > 0 ? Math.round(store.prep_minutes) : null;
  const photo =
    store.cover_photo_path ?? (category ? `/images/categories/${category.photo}.jpg` : null);
  const closes = hhmm(store.closes_today);
  const name = unbracket(store.trading_name);
  const area = store.branch_name ? unbracket(store.branch_name) : null;

  return (
    <li className={STORE_CARD}>
      <Link
        href={`/explore/${store.id}`}
        className="focus-visible:ring-gold group flex h-full flex-col overflow-hidden rounded-2xl bg-[#17140F] ring-1 ring-white/[0.07] transition-shadow hover:ring-white/20 focus-visible:outline-none focus-visible:ring-2"
      >
        <span className="relative block aspect-[4/3] overflow-hidden bg-gradient-to-br from-[#3B2E1B] via-[#241D13] to-[#14120E]">
          {photo && (
            <Image
              src={photo}
              alt=""
              fill
              sizes="(min-width: 1024px) 24vw, 18rem"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          )}
          {category && (
            <span className="text-ink absolute left-3 top-3 rounded-full bg-[#FFF4D6] px-3 py-1 text-[0.6875rem] font-bold">
              {category.label}
            </span>
          )}
          {!open && (
            <span className="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-[0.6875rem] font-bold text-white backdrop-blur">
              Closed now
            </span>
          )}
        </span>

        <span className="flex flex-1 items-start justify-between gap-3 p-4 pb-3">
          <span className="min-w-0">
            <span className="block truncate text-[0.9375rem] font-extrabold">{name}</span>
            <span className="mt-0.5 block truncate text-[0.8125rem] font-semibold text-white/50">
              {store.category_other ?? category?.label ?? 'Store'}
            </span>
          </span>
          {/* The store's own preparation time; left out when it has none. */}
          {minutes && (
            <span className="shrink-0 rounded-xl bg-white/[0.06] px-3 py-1.5 text-center leading-tight">
              <span className="block text-sm font-bold">{minutes}</span>
              <span className="text-gold block text-[0.6875rem] font-semibold">min</span>
            </span>
          )}
        </span>

        <span className="mx-4 border-t border-dashed border-white/10" />
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-xs font-semibold text-white/55">
          {area && (
            <>
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{area}</span>
              </span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {open ? (closes ? `Open till ${closes}` : 'Open') : 'Closed today'}
          </span>
          {/* Straight-line distance from the visitor's spot, when both are known. */}
          {store.km != null && (
            <>
              <span aria-hidden="true">·</span>
              <span
                className="text-gold inline-flex items-center gap-1"
                title="Estimated distance from your location"
              >
                <Navigation className="h-3 w-3" aria-hidden="true" />~{formatKm(store.km)} away
              </span>
            </>
          )}
        </span>
      </Link>
    </li>
  );
}

export function StoresNearYou({ stores }: { stores: NearbyStore[] }) {
  const { place, chip, openSheet } = useLocation();
  /* Only a real spot counts; a city guessed from the connection does not. */
  const spot =
    place && (chip === 'set' || chip === 'qr' || chip === 'room' || chip === 'outside')
      ? { lat: place.lat, lng: place.lng }
      : null;
  const { stores: shown, nearCount } = React.useMemo(
    () => rankStores(stores, spot),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stores, spot?.lat, spot?.lng],
  );
  if (shown.length === 0) return null;

  const where = place?.zone ?? place?.label ?? 'you';
  const seeAll = spot
    ? `/explore?city=nairobi&near=${spot.lat.toFixed(4)},${spot.lng.toFixed(4)}`
    : '/explore?city=nairobi';

  return (
    <CardRail
      label="stores"
      heading={
        <>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.375rem]">
            Find Stores Near You
          </h2>
          <p className="mt-2 text-sm font-semibold text-white/55">
            {nearCount > 0 ? (
              <>Nearest to {where} first.</>
            ) : spot ? (
              <>No stores deliver near {where} yet, so here are Nairobi&apos;s favourites.</>
            ) : (
              <>
                Popular across Nairobi.{' '}
                <button
                  type="button"
                  onClick={() => openSheet('stores')}
                  className="text-gold font-bold underline-offset-4 hover:underline"
                >
                  Set your location
                </button>{' '}
                to see the stores nearest you.
              </>
            )}
          </p>
        </>
      }
      actions={
        <Link
          href={seeAll}
          className="text-gold focus-visible:ring-gold inline-flex h-11 items-center gap-1.5 rounded-full px-2 text-sm font-bold hover:underline focus-visible:outline-none focus-visible:ring-2"
        >
          See all
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      }
    >
      {shown.map((store) => (
        <StoreCard key={store.id} store={store} />
      ))}
    </CardRail>
  );
}
