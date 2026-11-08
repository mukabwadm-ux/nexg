import type { BoundedPage, CollectionResult, DiscoveryProvider, DiscoveryQuery, EngineSchemas, Merchant, MerchantResult, OfferingResult } from './DiscoveryProvider';
import { EngineTransport } from './engineTransport';
import { ProviderReadError } from './readState';

export const engineCapabilities = { availabilityFilter: false, nearestSort: false, priceRangeFilter: false, transactions: false,
  resultSemantics: 'bounded/v2' as const, supportedSorts: ['recommended'] as const };
const unavailable = () => new ProviderReadError({ kind: 'unavailable' });
function canonical(value: unknown): string {
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
}
const currencies = new Set(Intl.supportedValuesOf('currency'));
function price(value: EngineSchemas['Money']): { price: number; currency: string } | undefined {
  if (!currencies.has(value.currency)) return undefined;
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency: value.currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return { price: value.minor / (10 ** digits), currency: value.currency };
}
function image(value?: string): string | undefined {
  if (!value || /[\u0000-\u001f\\]/.test(value)) return undefined;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? value : undefined; } catch { return undefined; }
}
/** Presentations arrive hydrated by the engine; no browser detail fan-out. */
function merchant(row: EngineSchemas['PublicMerchant']): Merchant {
  if (row.ref.kind !== 'merchant' || row.ref.id !== row.ref.merchantId
    || row.items.some(item => item.ref.kind !== 'offering' || item.ref.ownerId !== row.ref.ownerId || item.ref.merchantId !== row.ref.id)
    || new Set(row.items.map(item => item.ref.id)).size !== row.items.length
    || (row.itemsCount.kind !== 'unknown' && row.itemsCount.value < row.items.length)) throw unavailable();
  return { id: row.ref.id, name: row.name, area: row.area, heroImage: image(row.image), itemsCount: row.itemsCount, itemsCompletion: row.itemsCompletion,
    items: row.items.map(item => ({ id: item.ref.id, merchantId: row.ref.id, merchantName: row.name, name: item.name,
      description: item.description, image: image(item.image),
      // Source money knownness is retained by the wire contract. Only a verified
      // listed price is displayable, including a real zero, never a legacy default.
      ...(item.listedPrice.state === 'known' ? price(item.listedPrice.value) : {}) })) };
}
function metadata(page: EngineSchemas['EnginePage'], offset: number): BoundedPage {
  return { semantics: 'bounded/v2', offset, mapping: page.status === 'unmapped' ? 'unmapped' : 'mapped', count: page.count,
    retrieval: page.retrieval, versions: page.versions, applied: page.applied, status: page.status,
    ...(page.pageCursor ? { pageCursor: page.pageCursor } : {}), ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    ...(page.previousCursor ? { previousCursor: page.previousCursor } : {}),
    ...(page.exposureToken ? { observations: page.refs.map((ref, position) => ({ token: page.exposureToken!, ref, position })) } : {}) };
}
function validatePage(page: EngineSchemas['EnginePage'], request: EngineSchemas['EngineRequest'], published?: EngineSchemas['Versions']): void {
  if (page.requestId !== request.requestId || page.versions.discoveryRelease !== request.discoveryReleaseId
    || canonical(page.applied.selection) !== canonical(request.selection) || page.applied.sort !== request.sort
    || page.applied.constraints.length !== request.filters.length
    || page.applied.constraints.some((item, index) => item.state !== 'supported' || item.strength !== 'hard' || canonical(item.value) !== canonical(request.filters[index]))
    || page.refs.length > request.limit || page.presentations.offerings.length || page.refs.length !== page.presentations.merchants.length
    || page.refs.some(ref => ref.kind !== 'merchant' || ref.id !== ref.merchantId)
    || new Set(page.refs.map(ref => `${ref.ownerId}:${ref.id}`)).size !== page.refs.length
    || page.presentations.merchants.some((row, index) => { const ref = page.refs[index]; return !ref || row.ref.ownerId !== ref.ownerId || row.ref.id !== ref.id || row.ref.merchantId !== ref.merchantId; })
    || (page.count.kind !== 'unknown' && page.count.value < page.refs.length) || page.retrieval.candidateCount < page.refs.length) throw unavailable();
  if (published && (['discoveryRelease', 'taxonomy', 'layout', 'mapping', 'policy', 'ranker', 'modelRevision'] as const).some(key => page.versions[key] !== published[key])) throw unavailable();
}
export function collectionQuery(request: EngineSchemas['EngineRequest']): DiscoveryQuery {
  const area = request.filters.find(filter => filter.kind === 'catalog_area');
  return { categoryId: request.selection.categoryId, subcategoryId: request.selection.subcategoryId, optionId: request.selection.optionId,
    search: request.query, area: area?.kind === 'catalog_area' ? area.areaId : undefined, sort: request.sort as DiscoveryQuery['sort'],
    limit: request.limit, engineRequest: structuredClone(request), offset: 0 };
}

/** Bounded versioned adapter. Cursor bookkeeping contains no merchant cache. */
export class EngineDiscoveryProvider implements DiscoveryProvider {
  readonly version = 'discovery-provider/bounded-v2';
  readonly capabilities = engineCapabilities;
  #release: EngineSchemas['ReleaseContext'] | undefined;
  readonly #pages = new Map<string, { at: number; cursors: Map<number, string> }>();
  #activeObservations = 0;
  constructor(private readonly http = new EngineTransport(), private readonly now = () => Date.now(), private readonly id: () => string = () => crypto.randomUUID()) {}
  async #context(signal?: AbortSignal) {
    if (!this.#release) this.#release = await this.http.read('/api/discovery/release', 'ReleaseContext', undefined, signal);
    if (this.#release.discoveryReleaseId !== this.#release.versions.discoveryRelease || new Set(this.#release.collections.map(item => item.id)).size !== this.#release.collections.length) throw unavailable();
    return this.#release;
  }
  #key(query: DiscoveryQuery): string {
    return JSON.stringify([query.categoryId, query.subcategoryId, query.optionId, query.search, query.area, query.sort ?? 'recommended', query.openNow ?? false, query.limit ?? 24, query.engineRequest, query.contextRequired]);
  }
  restart(query: DiscoveryQuery): void { this.#pages.delete(this.#key(query)); this.#release = undefined; }
  async observe(event: EngineSchemas['ClientEvent']): Promise<EngineSchemas['EventReceipt']> {
    if (this.#activeObservations >= 8) return { accepted: 0, duplicates: 0, rejected: 1 };
    this.#activeObservations++;
    try { return await this.http.read('/api/discovery/events', 'EventReceipt', { contractVersion: '1', events: [event] }); }
    finally { this.#activeObservations--; }
  }
  async #request(query: DiscoveryQuery, signal?: AbortSignal): Promise<EngineSchemas['EngineRequest']> {
    if (query.contextRequired && !query.engineRequest) throw new ProviderReadError({ kind: 'invalid', detail: {
      contractVersion: '1', requestId: this.id(), code: 'INVALID_REQUEST', retryable: false, recovery: 'correct_request', fieldPaths: ['/contextToken'] } });
    const release = await this.#context(signal);
    const request: EngineSchemas['EngineRequest'] = query.engineRequest ? structuredClone(query.engineRequest) : {
      contractVersion: '1', requestId: this.id(), discoveryReleaseId: release.discoveryReleaseId, mode: 'merchant',
      selection: { ...(query.categoryId ? { categoryId: query.categoryId } : {}), ...(query.subcategoryId ? { subcategoryId: query.subcategoryId } : {}), ...(query.optionId ? { optionId: query.optionId } : {}) },
      ...(query.search?.trim() ? { query: query.search.trim() } : {}),
      filters: [...(query.area ? [{ kind: 'catalog_area' as const, areaId: query.area }] : []), ...(query.openNow ? [{ kind: 'merchant_open' as const, value: true as const }] : [])],
      sort: query.sort ?? 'recommended', limit: query.limit ?? 24,
    };
    request.requestId = this.id();
    if (query.engineRequest) {
      const expected = collectionQuery(query.engineRequest);
      for (const key of ['categoryId', 'subcategoryId', 'optionId', 'search', 'area', 'sort', 'limit'] as const) {
        if (query[key] !== undefined && query[key] !== expected[key]) throw new ProviderReadError({ kind: 'invalid' });
      }
      if (query.openNow && !request.filters.some(filter => filter.kind === 'merchant_open' && filter.value)) throw new ProviderReadError({ kind: 'invalid' });
    }
    delete request.cursor; delete request.offset;
    const cache = this.#pages.get(this.#key(query));
    const cursor = query.cursor ?? (cache && this.now() - cache.at < 300_000 ? cache.cursors.get(query.offset ?? 0) : undefined);
    if (cursor) request.cursor = cursor;
    else if ((query.offset ?? 0) > 0) request.offset = query.offset!;
    return request;
  }
  async getMerchants(query: DiscoveryQuery, signal?: AbortSignal): Promise<MerchantResult> {
    const request = await this.#request(query, signal);
    const page = await this.http.read('/api/discovery/results', 'EnginePage', request, signal);
    validatePage(page, request, this.#release?.versions);
    const rows = page.presentations.merchants.map(merchant);
    if (signal?.aborted) throw signal.reason;
    const key = this.#key(query); const offset = query.offset ?? 0;
    let cache = this.#pages.get(key);
    if (!cache || !request.cursor) { cache = { at: this.now(), cursors: new Map() }; this.#pages.set(key, cache); }
    if (page.pageCursor) cache.cursors.set(offset, page.pageCursor);
    if (page.nextCursor) cache.cursors.set(offset + request.limit, page.nextCursor);
    if (page.previousCursor) cache.cursors.set(Math.max(0, offset - request.limit), page.previousCursor);
    while (this.#pages.size > 32) this.#pages.delete(this.#pages.keys().next().value!);
    return { ...metadata(page, offset), merchants: rows };
  }
  async getExperienceOfferings(_query: DiscoveryQuery, _signal?: AbortSignal): Promise<OfferingResult> {
    throw new ProviderReadError({ kind: 'unsupported', detail: { contractVersion: '1', requestId: this.id(), code: 'UNSUPPORTED_CAPABILITY', retryable: false, recovery: 'correct_request', fieldPaths: ['/mode'] } });
  }
  getTourOfferings(query: DiscoveryQuery, signal?: AbortSignal): Promise<OfferingResult> { return this.getExperienceOfferings(query, signal); }
  async getCollections(categoryId: string, query: Pick<DiscoveryQuery, 'area' | 'search' | 'sort' | 'openNow'> = {}, signal?: AbortSignal): Promise<CollectionResult> {
    const release = await this.#context(signal);
    const definitions = release.collections.filter(item => item.categoryId === categoryId);
    if (!definitions.length) return { collections: [], partial: false, reasonCodes: [] };
    const request = await this.#request({ ...query, categoryId, limit: 24 }, signal);
    const result = await this.http.read('/api/discovery/collections', 'CollectionPage', { request, definitionIds: definitions.slice(0, 8).map(item => item.id) }, signal);
    let previousDefinition = -1;
    const collections = result.sections.map(section => {
      const definition = definitions.find(item => item.id === section.definitionId);
      const position = definitions.findIndex(item => item.id === section.definitionId);
      if (!definition || section.viewAllRequest.discoveryReleaseId !== release.discoveryReleaseId || section.viewAllRequest.selection.categoryId !== categoryId
        || position <= previousDefinition || position >= 8 || (definition.titleKey && section.titleKey !== definition.titleKey)
        || section.viewAllRequest.mode !== 'merchant' || section.viewAllRequest.query !== request.query || section.viewAllRequest.sort !== request.sort
        || request.filters.some(filter => !section.viewAllRequest.filters.some(effective => canonical(filter) === canonical(effective)))) throw unavailable();
      previousDefinition = position;
      // Preview limit can differ, but every effective predicate must agree.
      validatePage(section.page, { ...section.viewAllRequest, requestId: request.requestId, limit: 48 }, release.versions);
      return { id: section.definitionId, title: definition.title ?? 'Explore more', subcategoryId: section.viewAllRequest.selection.subcategoryId ?? '',
        merchants: section.page.presentations.merchants.map(merchant), viewAllQuery: collectionQuery(section.viewAllRequest),
        ...(section.page.exposureToken ? { observations: section.page.refs.map((ref, position) => ({ token: section.page.exposureToken!, ref, position })) } : {}) };
    });
    return { collections, partial: result.partial || definitions.length > 8, reasonCodes: [...result.reasonCodes, ...(definitions.length > 8 ? ['COLLECTION_REQUEST_WINDOW_LIMIT'] : [])] };
  }
  async getMerchant(id: string, signal?: AbortSignal): Promise<Merchant> {
    const row = await this.http.read(`/api/discovery/merchants/${encodeURIComponent(id)}`, 'PublicMerchant', undefined, signal);
    if (row.ref.id !== id) throw unavailable();
    return merchant(row);
  }
  async getAreas(signal?: AbortSignal): Promise<string[]> { return (await this.http.read('/api/discovery/areas', 'Areas', undefined, signal)).areas; }
}
