import { ContractError } from '../../../src/contracts/index.js';
import { assertSchema, validateSelection, type SelectionAuthority } from '../../../src/contracts/validate.js';
import type { ReleasedCollectionDefinition } from './contracts.js';

/** Compatible released records only. Executing code never flips baseline flags. */
export function validateCollectionDefinition(value: ReleasedCollectionDefinition, authority: SelectionAuthority): void {
  const fail = () => { throw new ContractError('RELEASE_INCOMPATIBLE', ['/collections']); };
  const text = (value: unknown, max = 256) => typeof value === 'string' && value.length > 0 && value.length <= max;
  if (!value || typeof value !== 'object' || !text(value.id) || !authority.nodes.some(node => node.id === value.categoryId && node.kind === 'category')) fail();
  if (!('predicate' in value)) {
    if (Object.keys(value).some(key => !['id', 'categoryId', 'title', 'enabled', 'reason'].includes(key))
      || value.enabled !== false || value.reason !== 'PREDICATE_NOT_IMPLEMENTED' || !text(value.title, 1000)) fail();
    return;
  }
  if (Object.keys(value).some(key => !['id', 'categoryId', 'titleKey', 'predicateVersion', 'predicate', 'mode', 'selection', 'filters', 'minDistinct', 'maxItems', 'enabled', 'reason'].includes(key))
    || !text(value.titleKey) || !/^[a-zA-Z0-9_.:-]+$/.test(value.titleKey) || value.predicateVersion !== '1'
    || !['merchant', 'offering'].includes(value.mode) || typeof value.enabled !== 'boolean'
    || (value.enabled ? value.reason !== undefined : !['EDITORIAL_DISABLED', 'SOURCE_CAPABILITY_PENDING'].includes(value.reason))
    || !Number.isSafeInteger(value.minDistinct) || !Number.isSafeInteger(value.maxItems)
    || value.minDistinct < 2 || value.maxItems > 48 || value.minDistinct > value.maxItems || value.maxItems < 2) fail();
  const predicate = value.predicate;
  if (!predicate || !['scoped-explore', 'query-matches', 'requested-task-fit', 'more-from-merchant', 'comparable-alternatives'].includes(predicate.kind)
    || Object.keys(predicate).some(key => !['kind', ...(predicate.kind === 'comparable-alternatives' ? ['priceKind'] : [])].includes(key))) fail();
  if (predicate.kind === 'comparable-alternatives' && !['listed_price', 'comparable_total'].includes(predicate.priceKind)) fail();
  if (['more-from-merchant', 'comparable-alternatives'].includes(predicate.kind) && value.mode !== 'offering') fail();
  if (value.selection) {
    try { assertSchema('Selection', value.selection); validateSelection(value.selection, authority); } catch { fail(); }
    if (value.selection.categoryId !== value.categoryId) fail();
  }
  if (value.filters !== undefined) {
    if (!Array.isArray(value.filters) || value.filters.length > 12) fail();
    try { value.filters.forEach(filter => assertSchema('SupportedFilter', filter)); } catch { fail(); }
  }
  if (predicate.kind === 'requested-task-fit' && !value.filters?.length) fail();
}
