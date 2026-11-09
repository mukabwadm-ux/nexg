/**
 * The Supabase connector (plan steps E3–E4, 9 Nov 2026). Guide: discovery-engine/docs/SUPABASE_CONNECTOR.md.
 *
 * Reads what merchants publish through the NexG merchant portal straight from Supabase's public views,
 * merchant_public and catalogue_public, with the public key only: GET requests, no writes, never the
 * service-role key. It keeps one snapshot in memory and re-reads it every 30 seconds. After five minutes
 * without a good read it answers CATALOG_UNAVAILABLE rather than serve old data.
 *
 * Engine results then carry Supabase IDs, listed prices in Kenya shillings, branch coordinates and the
 * release's taxonomy paths. Opening hours, ratings, stock and photos are not read from Supabase yet.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Schemas } from '../../contracts/index.js';
import { parseSchema } from '../../contracts/validate.js';
import { ReadServiceError, sourceUnavailable } from '../../contracts/readErrors.js';
import type { CatalogScope, ObservedMerchant, ServerDiscoveryProvider } from '../../providers/DiscoveryProvider.js';
import type { ReadBudget } from '../../orchestrator/readBudget.js';
import { taxonomyPathsFor, type TaxonomyPathIndex } from '../../releases/taxonomyPaths.js';
import { deepFreeze } from '../../shared/immutable.js';
import { sourcePathId } from '../platform/httpTransport.js';
import { geoPoint } from '../presentation.js';
import { BridgeError, CatalogBridge, SupabaseCatalogReader, demoMediaFromSnapshot, portalMapRows,
  type BridgeItem, type BridgeMapRow, type BridgeMerchant, type CatalogRows, type DemoMedia } from './catalogBridge.js';

export const supabaseConnectorManifest = deepFreeze({
  id: 'nexg-supabase-catalog', version: '1', ownerId: 'nexg-supabase-catalog', authority: 'READ_ONLY_EXTERNAL',
  views: ['merchant_public', 'catalogue_public'], methods: ['GET'], credentials: 'public_key_only',
  refreshMs: 30_000, staleAfterMs: 5 * 60_000, listItemsPerMerchant: 30, detailItemsPerMerchant: 200,
});

export interface SupabaseConnectorSettings { origin: string; key: string }

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** The key's role, from a legacy JWT payload or a new-style key prefix. Unknown formats give undefined. */
export function supabaseKeyRole(key: string): string | undefined {
  if (key.startsWith('sb_secret_')) return 'secret';
  if (key.startsWith('sb_publishable_')) return 'publishable';
  const parts = key.split('.');
  if (parts.length !== 3 || !parts[1]) return undefined;
  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const role = payload && typeof payload === 'object' ? (payload as { role?: unknown }).role : undefined;
    return typeof role === 'string' ? role : undefined;
  } catch { return undefined; }
}

/**
 * Accepts only a plain project URL (https, or http on this computer) and a public anon or publishable key.
 * The views are public, so a service-role or secret key is never needed and is refused. Errors never repeat the key.
 */
export function supabaseConnectorSettings(url: string | undefined, key: string | undefined): SupabaseConnectorSettings {
  let parsed: URL | undefined;
  try { parsed = url ? new URL(url) : undefined; } catch { parsed = undefined; }
  const secure = parsed?.protocol === 'https:' || (parsed?.protocol === 'http:' && LOOPBACK.has(parsed.hostname));
  if (!parsed || !secure || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('SUPABASE_URL must be the Supabase project URL, such as https://<project>.supabase.co, or http://127.0.0.1:54321 for the local Supabase');
  }
  if (!key || /\s/.test(key)) throw new Error('SUPABASE_ANON_KEY is missing');
  const role = supabaseKeyRole(key);
  if (role !== 'anon' && role !== 'publishable') throw new Error('SUPABASE_ANON_KEY must be the public anon or publishable key, never a service-role or secret key');
  return { origin: parsed.origin, key };
}

/** Supabase lists prices as whole Kenya shillings (catalogue_public.price_kes). The contract counts cents. */
function listedPrice(item: BridgeItem, ownerId: string, observedAt: string): Schemas['MoneyFact'] {
  const price = item.price;
  if (item.currency !== 'KES' || price === undefined || !Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(price * 100)) {
    return { state: 'unknown', reason: 'not_exposed' };
  }
  return { state: 'known', value: { minor: price * 100, currency: 'KES' }, evidence: { source: { ownerId, id: item.id }, observedAt } };
}

export interface SupabaseConnectorOptions {
  /** Reads both public views in full; SupabaseCatalogReader.load in service. */
  load: () => Promise<CatalogRows>;
  /** The reviewed subcategory map, with the portal's spellings (portalMapRows). */
  map: readonly BridgeMapRow[];
  /** Demo photos for demo IDs only. Supabase has no public photos yet. */
  media?: DemoMedia;
  /** From the published release (taxonomyPathIndex). */
  taxonomyPaths: TaxonomyPathIndex;
  now?: () => number;
  refreshMs?: number;
  staleAfterMs?: number;
}

/** Engine source port over Supabase. Every read is answered from the current snapshot; nothing is written. */
export class SupabaseConnector implements ServerDiscoveryProvider {
  readonly ownerId = supabaseConnectorManifest.ownerId;
  readonly configured = true;
  readonly #catalog: CatalogBridge;
  readonly #load: () => Promise<CatalogRows>;
  readonly #paths: TaxonomyPathIndex;
  readonly #now: () => number;
  readonly #refreshMs: number;
  readonly #staleAfterMs: number;
  #lastError: string | undefined;
  #refreshing: Promise<void> | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;
  #closed = false;

  constructor(options: SupabaseConnectorOptions) {
    this.#catalog = new CatalogBridge(options.map, options.media);
    this.#load = options.load;
    this.#paths = options.taxonomyPaths;
    this.#now = options.now ?? Date.now;
    this.#refreshMs = options.refreshMs ?? supabaseConnectorManifest.refreshMs;
    this.#staleAfterMs = options.staleAfterMs ?? supabaseConnectorManifest.staleAfterMs;
    if (!Number.isSafeInteger(this.#refreshMs) || this.#refreshMs < 1 || !Number.isSafeInteger(this.#staleAfterMs) || this.#staleAfterMs < this.#refreshMs) {
      throw new Error('Invalid Supabase connector refresh settings');
    }
  }

  /** Builds the connector from the repository's reviewed map (required) and demo photos (optional). */
  static async fromWorkspace(root: string, settings: SupabaseConnectorSettings, taxonomyPaths: TaxonomyPathIndex): Promise<SupabaseConnector> {
    const map = portalMapRows(JSON.parse(await readFile(join(root, 'demo-seed/subcategory-map.json'), 'utf8')));
    let media: DemoMedia | undefined;
    try { media = demoMediaFromSnapshot(JSON.parse(await readFile(join(root, 'demo-seed/source/demo-api-snapshot.json'), 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const reader = new SupabaseCatalogReader(settings.origin, settings.key);
    return new SupabaseConnector({ load: () => reader.load(), map, taxonomyPaths, ...(media ? { media } : {}) });
  }

  /** For start-up logs and health checks: never contains catalog rows or the key. */
  get status(): { loadedAt?: string; merchants: number; items: number; lastError?: string } {
    const loadedAt = this.#catalog.loadedAt;
    return { ...(loadedAt !== undefined ? { loadedAt: new Date(loadedAt).toISOString() } : {}), ...this.#catalog.size, ...(this.#lastError ? { lastError: this.#lastError } : {}) };
  }

  /** First read, then a re-read every refresh interval. A failed first read leaves the engine at readiness R0 until one succeeds. */
  async start(): Promise<void> {
    await this.refresh();
    if (this.#closed || this.#timer) return;
    this.#timer = setInterval(() => { void this.refresh(); }, this.#refreshMs);
    this.#timer.unref();
  }

  async close(): Promise<void> {
    this.#closed = true;
    clearInterval(this.#timer); this.#timer = undefined;
    await this.#refreshing;
  }

  /** Replaces the snapshot in one step. A failed read keeps the previous snapshot until it goes stale. */
  refresh(): Promise<void> {
    return this.#refreshing ??= (async () => {
      try { this.#catalog.replace(await this.#load(), this.#now()); this.#lastError = undefined; }
      catch (error) { this.#lastError = error instanceof BridgeError ? error.message : 'Catalog refresh failed'; }
    })().finally(() => { this.#refreshing = undefined; });
  }

  #fresh(): string {
    const loadedAt = this.#catalog.loadedAt;
    if (loadedAt === undefined || this.#now() - loadedAt > this.#staleAfterMs) throw sourceUnavailable(true);
    return new Date(loadedAt).toISOString();
  }

  async probe(budget: ReadBudget): Promise<boolean> {
    try { this.#fresh(); budget.assertOpen(); return true; } catch { return false; }
  }

  async getMerchants(scope: CatalogScope, budget: ReadBudget): Promise<ObservedMerchant[]> {
    budget.assertOpen();
    if (!scope.sourceSubcategoryIds.length) return [];
    if (!Number.isSafeInteger(scope.limit) || scope.limit < 1 || scope.limit > 48
      || scope.sourceSubcategoryIds.some(id => typeof id !== 'string' || !id || id.length > 256)
      || (scope.area !== undefined && (!scope.area || scope.area === 'all' || scope.area.length > 256))) throw sourceUnavailable(false);
    const observedAt = this.#fresh();
    const unique = new Map<string, ObservedMerchant>();
    for (const id of new Set(scope.sourceSubcategoryIds)) {
      const page = this.#catalog.merchants({ subcategory: id, ...(scope.area ? { area: scope.area } : {}), limit: scope.limit, offset: 0 });
      for (const merchant of page.merchants) if (!unique.has(merchant.id)) unique.set(merchant.id, this.#observe(merchant, observedAt));
      budget.assertOpen();
    }
    return [...unique.values()].slice(0, scope.limit);
  }

  async getMerchant(id: string, budget: ReadBudget): Promise<Schemas['PublicMerchant']> {
    budget.assertOpen();
    sourcePathId(id);
    const observedAt = this.#fresh();
    let merchant: BridgeMerchant;
    try { merchant = this.#catalog.merchant(id); }
    catch (error) {
      if (error instanceof BridgeError && error.status === 404) throw new ReadServiceError('NOT_FOUND', 404, false, 'none');
      throw sourceUnavailable(true);
    }
    const { presentation } = this.#observe(merchant, observedAt);
    budget.assertOpen(); return presentation;
  }

  async getAreas(budget: ReadBudget): Promise<Schemas['Areas']> {
    budget.assertOpen(); this.#fresh();
    let areas: Schemas['Areas'];
    try { areas = parseSchema('Areas', this.#catalog.areas()); } catch { throw sourceUnavailable(false); }
    budget.assertOpen(); return areas;
  }

  #observe(merchant: BridgeMerchant, observedAt: string): ObservedMerchant {
    const ownerId = this.ownerId;
    const items: Schemas['PublicOffering'][] = merchant.items.map(item => ({
      ref: { kind: 'offering', ownerId, id: item.id, merchantId: merchant.id }, name: item.name,
      ...(item.description ? { description: item.description } : {}), ...(item.image ? { image: item.image } : {}),
      listedPrice: listedPrice(item, ownerId, observedAt) }));
    const image = merchant.heroImage ?? merchant.logoUrl;
    const taxonomyPaths = taxonomyPathsFor(this.#paths, merchant.subcategoryId);
    const location = geoPoint(merchant.latitude, merchant.longitude);
    try {
      return { presentation: parseSchema('PublicMerchant', { ref: { kind: 'merchant', ownerId, id: merchant.id, merchantId: merchant.id }, name: merchant.name,
        ...(merchant.nairobiArea ? { area: merchant.nairobiArea } : {}), ...(image ? { image } : {}),
        ...(taxonomyPaths ? { taxonomyPaths } : {}), ...(location ? { location } : {}),
        items, itemsCount: { kind: 'lower_bound', value: items.length }, itemsCompletion: 'bounded_window' }),
        evidence: { source: { ownerId, id: merchant.id }, observedAt } };
    } catch { throw sourceUnavailable(false); }
  }
}
