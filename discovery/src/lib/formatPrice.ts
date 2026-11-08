import type { CatalogItem } from '../providers/DiscoveryProvider';

/** Format only a source price paired with its original currency. */
export function formatPrice(item: Pick<CatalogItem, 'price' | 'currency'>, currencyDisplay: 'symbol' | 'code' = 'symbol'): string | undefined {
  if (item.price === undefined || !Number.isFinite(item.price) || !item.currency) return;
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: item.currency,
      currencyDisplay,
      maximumFractionDigits: Number.isInteger(item.price) ? 0 : 2,
    }).format(item.price);
  } catch {
    return `${item.currency} ${item.price.toLocaleString('en-KE')}`;
  }
}
