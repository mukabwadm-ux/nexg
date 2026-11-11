import { parseSchema } from '../../contracts/validate.js';
import type { Schemas } from '../../contracts/index.js';
import type { ObservedMerchant } from '../../providers/DiscoveryProvider.js';
import { sourceUnavailable } from '../../contracts/readErrors.js';
import { taxonomyPathsFor, type TaxonomyPathIndex } from '../../releases/taxonomyPaths.js';
import { geoPoint } from '../presentation.js';

export interface NormalizeOptions { taxonomyPaths?: TaxonomyPathIndex }

export function sourceRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw sourceUnavailable(false);
  return value as Record<string, unknown>;
}
function requiredText(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw sourceUnavailable(false);
  return value;
}
function optionalText(value: unknown, maximum: number): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= maximum ? value : undefined;
}
function imageUrl(value: unknown): string | undefined {
  const text = optionalText(value, 2048);
  if (!text || /[\u0000-\u001f\\]/.test(text)) return undefined;
  if (text.startsWith('/') && !text.startsWith('//')) return text;
  try { const url = new URL(text); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? text : undefined; } catch { return undefined; }
}
function optional<T extends string>(key: T, value: string | undefined): Partial<Record<T, string>> { return value === undefined ? {} : { [key]: value } as Record<T, string>; }

/**
 * The public projection omits legacy operational defaults and unverifiable money. It keeps the source's own
 * subcategory, which the release's mappings turn into taxonomy paths, and branch coordinates when sent.
 */
export function normalizeMerchant(value: unknown, ownerId: string, observedAt: string, expectedId?: string, options: NormalizeOptions = {}): ObservedMerchant {
  const merchant = sourceRecord(value);
  const id = requiredText(merchant.id, 256);
  if ((expectedId && expectedId !== id) || merchant.status === 'inactive' || merchant.isActive === false || !Array.isArray(merchant.items) || merchant.items.length > 200) throw sourceUnavailable(false);
  const ref = { kind: 'merchant' as const, ownerId, id, merchantId: id };
  const seen = new Set<string>();
  const items: Schemas['PublicOffering'][] = merchant.items.map(raw => {
    const item = sourceRecord(raw); const itemId = requiredText(item.id, 256);
    if (item.merchantId !== id || seen.has(itemId)) throw sourceUnavailable(false); seen.add(itemId);
    return { ref: { kind: 'offering', ownerId, id: itemId, merchantId: id }, name: requiredText(item.name, 1000),
      ...optional('description', optionalText(item.description, 5000)), ...optional('image', imageUrl(item.image)),
      listedPrice: { state: 'unknown', reason: 'not_verified' } };
  });
  const taxonomyPaths = taxonomyPathsFor(options.taxonomyPaths, optionalText(merchant.subcategoryId, 256));
  const location = geoPoint(merchant.latitude, merchant.longitude);
  try {
    return { presentation: parseSchema('PublicMerchant', { ref, name: requiredText(merchant.name, 1000),
      ...optional('area', optionalText(merchant.nairobiArea, 256)), ...optional('image', imageUrl(merchant.heroImage) ?? imageUrl(merchant.logoUrl)),
      ...(taxonomyPaths ? { taxonomyPaths } : {}), ...(location ? { location } : {}),
      items, itemsCount: { kind: 'lower_bound', value: items.length }, itemsCompletion: 'bounded_window' }),
      evidence: { source: { ownerId, id }, observedAt } };
  } catch { throw sourceUnavailable(false); }
}

export function normalizeMerchantPage(value: unknown, ownerId: string, observedAt: string, limit: number, area?: string, options: NormalizeOptions = {}): ObservedMerchant[] {
  const page = sourceRecord(value);
  if (!Array.isArray(page.merchants) || page.merchants.length > limit || !Number.isSafeInteger(page.total) || (page.total as number) < 0
    || (page.offset !== undefined && page.offset !== 0) || (page.limit !== undefined && page.limit !== limit)) throw sourceUnavailable(false);
  const rows = page.merchants.map(raw => normalizeMerchant(raw, ownerId, observedAt, undefined, options));
  if (new Set(rows.map(row => row.presentation.ref.id)).size !== rows.length || (area && rows.some(row => row.presentation.area !== area))) throw sourceUnavailable(false);
  return rows;
}
