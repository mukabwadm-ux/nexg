import type { CatalogItem } from '../providers/DiscoveryProvider';
import { convertedKes } from './displayCurrency';

/**
 * Format only a source price paired with its original currency. A KES price is shown in the visitor's display
 * currency ("≈ $11.24") when they chose one on the website; `convert: false` keeps KES (the cart, which is charged).
 */
export function formatPrice(item: Pick<CatalogItem, 'price' | 'currency'>, currencyDisplay: 'symbol' | 'code' = 'symbol', convert = true): string | undefined {
  if (item.price === undefined || !Number.isFinite(item.price) || !item.currency) return;
  if (convert && item.currency === 'KES') {
    const converted = convertedKes(item.price);
    if (converted) return converted;
  }
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
