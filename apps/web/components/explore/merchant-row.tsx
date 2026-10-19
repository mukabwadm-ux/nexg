import { ChevronRight, Store } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { CategoryScroller } from './category-scroller';
import { price } from './catalogue';
import { CATEGORY_ICON, CATEGORY_LABEL, type ExploreMerchant } from './merchant-card';

export interface RowItem {
  id: string;
  name: string;
  price_kes: number | null;
}

/**
 * One merchant on a category page: who they are, then a swipeable row of what
 * they sell. A merchant with no catalogue loaded yet gets a single card that
 * opens their page instead of an empty row.
 */
export function MerchantRow({ merchant, items }: { merchant: ExploreMerchant; items: RowItem[] }) {
  const category = merchant.category ?? 'other';
  const Icon = CATEGORY_ICON[category] ?? Store;
  const open = merchant.accepting_orders !== false;
  const placeholder = merchant.placeholder === true;
  const href = `/explore/${merchant.id}`;

  const header = (
    <>
      <span className="bg-surface border-border text-gold relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border">
        {merchant.cover_photo_path ? (
          <Image src={merchant.cover_photo_path} alt="" fill sizes="44px" className="object-cover" />
        ) : (
          <Icon aria-hidden="true" className="h-5 w-5" />
        )}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-[1rem] font-extrabold">{merchant.trading_name}</span>
          {!placeholder && <ChevronRight aria-hidden="true" className="text-muted-light h-4 w-4" />}
        </span>
        <span className="text-muted-light mt-0.5 flex flex-wrap items-center gap-x-2 text-xs font-semibold">
          <span
            className={`rounded-full px-2 py-0.5 text-[0.625rem] font-extrabold ${
              placeholder
                ? 'bg-gold-soft text-gold-text'
                : open
                  ? 'bg-success-bg text-success'
                  : 'bg-danger-bg text-danger'
            }`}
          >
            {placeholder ? 'Coming soon' : open ? 'Open' : 'Closed'}
          </span>
          {merchant.category_other ?? CATEGORY_LABEL[category] ?? 'Merchant'}
          {merchant.branch_name && ` · ${merchant.branch_name}`}
        </span>
      </span>
    </>
  );

  return (
    <li className="border-border bg-surface rounded-2xl border p-4 sm:p-5">
      {placeholder ? (
        <div className="flex items-center gap-3">{header}</div>
      ) : (
        <Link href={href} className="flex items-center gap-3">
          {header}
        </Link>
      )}

      {!placeholder && (
        <CategoryScroller
          className="mt-4"
          itemClass="[&>li]:w-[10.5rem] sm:[&>li]:w-[12rem]"
          label={`${merchant.trading_name} items`}
        >
          {(items.length > 0 ? items : [null]).map((item) => (
            <li key={item?.id ?? 'view'}>
              <Link
                href={href}
                className="border-border bg-bg hover:border-gold group block overflow-hidden rounded-xl border transition-colors"
              >
                <span className="relative flex h-28 items-center justify-center overflow-hidden bg-gradient-to-br from-bg to-border/40">
                  {merchant.cover_photo_path ? (
                    <Image
                      src={merchant.cover_photo_path}
                      alt=""
                      fill
                      sizes="12rem"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <Icon aria-hidden="true" className="text-muted-light/40 h-8 w-8" />
                  )}
                </span>
                <span className="block p-3">
                  <span className="line-clamp-2 block text-[0.8125rem] font-extrabold leading-tight">
                    {item?.name ?? 'View menu'}
                  </span>
                  <span className="text-muted-light mt-1 block text-xs font-bold">
                    {item ? price(item.price_kes) : `Open ${merchant.trading_name}`}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </CategoryScroller>
      )}
    </li>
  );
}
