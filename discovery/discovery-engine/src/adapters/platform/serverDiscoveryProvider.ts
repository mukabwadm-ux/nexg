import type { ServerDiscoveryProvider, CatalogScope, ObservedMerchant } from '../../providers/DiscoveryProvider.js';
import type { ReadBudget } from '../../orchestrator/readBudget.js';
import { sourceUnavailable } from '../../contracts/readErrors.js';
import { parseSchema } from '../../contracts/validate.js';
import { CatalogHttpTransport, sourcePathId, type CatalogFetch } from './httpTransport.js';
import { normalizeMerchant, normalizeMerchantPage, type NormalizeOptions } from './normalize.js';
import { catalogAdapterManifest } from './manifest.js';
import type { TaxonomyPathIndex } from '../../releases/taxonomyPaths.js';

export interface PlatformProviderOptions { origin?: string; fetcher?: CatalogFetch; now?: () => string; taxonomyPaths?: TaxonomyPathIndex }

/** All legacy catalog semantics are confined to this replaceable adapter. */
export class PlatformDiscoveryProvider implements ServerDiscoveryProvider {
  readonly ownerId = catalogAdapterManifest.ownerId;
  readonly #http: CatalogHttpTransport | undefined;
  readonly #now: () => string;
  readonly #normalize: NormalizeOptions;
  constructor(options: PlatformProviderOptions = {}) {
    this.#http = options.origin ? new CatalogHttpTransport(options.origin, options.fetcher) : undefined;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#normalize = options.taxonomyPaths ? { taxonomyPaths: options.taxonomyPaths } : {};
  }
  get configured(): boolean { return this.#http !== undefined; }
  #connection(): CatalogHttpTransport { if (!this.#http) throw sourceUnavailable(false); return this.#http; }
  async probe(budget: ReadBudget): Promise<boolean> {
    try {
      const result = await this.#connection().get('/api/merchants', new URLSearchParams({ limit: '1', offset: '0', sort: 'recommended' }), budget);
      normalizeMerchantPage(result, this.ownerId, this.#now(), 1); budget.assertOpen(); return true;
    } catch { return false; }
  }
  async getMerchants(scope: CatalogScope, budget: ReadBudget): Promise<ObservedMerchant[]> {
    budget.assertOpen();
    if (!scope.sourceSubcategoryIds.length) return [];
    if (!Number.isSafeInteger(scope.limit) || scope.limit < 1 || scope.limit > 48
      || scope.sourceSubcategoryIds.some(id => typeof id !== 'string' || !id || id.length > 256)
      || (scope.area !== undefined && (!scope.area || scope.area === 'all' || scope.area.length > 256))) throw sourceUnavailable(false);
    const connection = this.#connection();
    const groups = [...new Set(scope.sourceSubcategoryIds)];
    const pages = await Promise.all(groups.map(async id => {
      const params = new URLSearchParams({ subcategory: id, limit: String(scope.limit), offset: '0', sort: 'recommended' });
      if (scope.area) params.set('area', scope.area);
      const raw = await connection.get('/api/merchants', params, budget);
      const rows = normalizeMerchantPage(raw, this.ownerId, this.#now(), scope.limit, scope.area, this.#normalize);
      budget.assertOpen(); return rows;
    }));
    // Preserve source observations as complete rows; never merge conflicting fields.
    const unique = new Map<string, ObservedMerchant>();
    for (const row of pages.flat()) if (!unique.has(row.presentation.ref.id)) unique.set(row.presentation.ref.id, row);
    budget.assertOpen(); return [...unique.values()].slice(0, scope.limit);
  }
  async getMerchant(id: string, budget: ReadBudget) {
    const path = sourcePathId(id);
    const raw = await this.#connection().get(`/api/merchants/${path}`, new URLSearchParams(), budget, id);
    const merchant = normalizeMerchant(raw, this.ownerId, this.#now(), id, this.#normalize).presentation;
    budget.assertOpen(); return merchant;
  }
  async getAreas(budget: ReadBudget) {
    const raw = await this.#connection().get('/api/areas', new URLSearchParams(), budget);
    let areas;
    try { areas = parseSchema('Areas', raw); } catch { throw sourceUnavailable(false); }
    budget.assertOpen(); return areas;
  }
}
