import type { EngineRequest, Schemas } from '../contracts/index.js';
import { ContractError } from '../contracts/index.js';
import { parseEngineRequest, parseSchema } from '../contracts/validate.js';
import { unsupported } from '../contracts/readErrors.js';
import type { ServerDiscoveryProvider, CatalogScope } from '../providers/DiscoveryProvider.js';
import type { ReleaseArtifact } from '../releases/artifact.js';
import { resolveSelection } from '../releases/artifact.js';
import type { ReadBudget } from './readBudget.js';
import { requestFingerprint } from '../shared/requestFingerprint.js';
import { understandQuery, type QueryRules } from '../../engines/query-understanding/src/index.js';
import type { RetrievalCandidatePort } from '../../engines/search-retrieval/src/ports.js';
import { requireReadyQuery } from './queryApplication.js';
import { retrieveMerchants } from './merchantRetrieval.js';
import { rankMerchants, revalidateMerchants } from './merchantRanking.js';
import { rankerRevision } from '../../engines/recommendation/src/contracts.js';
import { CollectionCompositionService } from './collectionService.js';
import { parseCollectionRequest } from '../../engines/collection-composition/src/prepare.js';
import { ResultSessions } from './resultSessions.js';
import type { RuntimeController } from '../operations/runtimeControl.js';

/** Application layer. No HTTP client, browser state or framework dependency. */
export class DiscoveryReadService {
  readonly sessions: ResultSessions;
  constructor(readonly release: Readonly<ReleaseArtifact>, private readonly provider: ServerDiscoveryProvider,
    private readonly options: { retrieval?: RetrievalCandidatePort; queryRules?: QueryRules; sessions?: ResultSessions; controls?: RuntimeController } = {}) {
    this.sessions = options.sessions ?? new ResultSessions();
  }
  versions(): Schemas['Versions'] {
    const release = this.release;
    return { discoveryRelease: release.releaseId, taxonomy: release.taxonomyRevision, layout: release.layoutRevision,
      mapping: release.mappingRevision, policy: release.policyRevision, ranker: rankerRevision,
      ...(this.options.controls ? { profileRevision: this.options.controls.profileRevision } : {}),
      sourceSnapshots: [{ ownerId: this.provider.ownerId, snapshot: { state: 'unknown', reason: 'not_exposed' } }] };
  }
  async health(budget: ReadBudget): Promise<Schemas['EngineHealth']> {
    if (this.options.controls && !this.options.controls.snapshot.flags.serving) return { contractVersion: '1', status: 'degraded', readiness: 'R0' };
    const ready = await this.provider.probe(budget);
    return { contractVersion: '1', status: ready ? 'ok' : 'degraded', readiness: ready ? 'R1' : 'R0' };
  }
  async capabilities(releaseId: string, budget: ReadBudget): Promise<Schemas['EngineCapabilities']> {
    if (releaseId !== this.release.releaseId) throw new ContractError('RELEASE_INCOMPATIBLE', ['/releaseId']);
    const health = await this.health(budget);
    return parseSchema('EngineCapabilities', { contractVersion: '1', discoveryReleaseId: this.release.releaseId, versions: this.versions(),
      resultModes: health.readiness === 'R1' ? ['merchant'] : [], filterKinds: health.readiness === 'R1' ? ['catalog_area'] : [],
      sorts: health.readiness === 'R1' ? ['recommended'] : [], countKinds: ['lower_bound', 'unknown'], workflowKinds: [], readiness: health.readiness,
      limits: { maxPageSize: 48, maxTaskComponents: 4, maxRequiredTaskComponents: 3, maxBodyBytes: 65536, sessionLifetimeSeconds: 300 },
      policyCoverage: this.release.nodes.map(node => { const mapping = this.release.mappings.find(item => item.nodeId === node.id)!;
        return { nodeId: node.id, state: mapping.status === 'unmapped' ? 'unmapped' : 'partial',
          reasonCodes: mapping.status === 'unmapped' ? ['NO_SOURCE_MAPPING'] : ['MERCHANT_CONTEXT_ONLY', 'ITEM_AND_WORKFLOW_UNVERIFIED', 'BOUNDED_MERCHANT_LEXICAL_QUERY'] }; }) });
  }
  getMerchant(id: string, budget: ReadBudget): Promise<Schemas['PublicMerchant']> { this.options.controls?.assertServing(); return this.provider.getMerchant(id, budget); }
  getAreas(budget: ReadBudget): Promise<Schemas['Areas']> { this.options.controls?.assertServing(); return this.provider.getAreas(budget); }

  async collections(value: unknown, budget: ReadBudget, caller = 'internal-public'): Promise<Schemas['CollectionPage']> {
    this.options.controls?.assertServing();
    budget.assertOpen();
    const collection = parseCollectionRequest(value, this.release);
    const plan = understandQuery(collection.request, this.release, this.options.queryRules ? { rules: this.options.queryRules } : {});
    requireReadyQuery(plan);
    this.#scope(collection.request); // Explicit unsupported base controls fail even if all definitions are disabled.
    const compose = () => new CollectionCompositionService(this.release, { results: (request, scope) => this.results(request, scope, caller) }, this.options.queryRules).compose(collection, budget);
    return budget.trace ? budget.trace.run('collections.compose', compose) : compose();
  }

  #scope(request: EngineRequest): CatalogScope {
    if (request.mode !== 'merchant') throw unsupported('/mode');
    if (request.contextToken !== undefined) throw unsupported('/contextToken');
    if (request.sourceScope !== undefined) throw unsupported('/sourceScope');
    if (request.sort !== 'recommended') throw unsupported('/sort');
    if (!request.selection.categoryId) throw unsupported('/selection/categoryId');
    let area: string | undefined;
    for (const [index, filter] of request.filters.entries()) {
      if (filter.kind !== 'catalog_area' || filter.areaId === 'all') throw unsupported(`/filters/${index}`);
      if (area && area !== filter.areaId) throw new ContractError('CONSTRAINT_CONFLICT', ['/filters']);
      area = filter.areaId;
    }
    const node = request.selection.optionId ?? request.selection.subcategoryId;
    const ids = node ? this.release.mappings.find(mapping => mapping.nodeId === node)!.sourceSubcategoryIds
      : this.release.nodes.filter(item => item.kind === 'subcategory' && item.parentId === request.selection.categoryId)
        .flatMap(item => this.release.mappings.find(mapping => mapping.nodeId === item.id)!.sourceSubcategoryIds);
    return { sourceSubcategoryIds: [...new Set(ids)], limit: request.limit, ...(area ? { area } : {}) };
  }
  async results(value: unknown, budget: ReadBudget, caller = 'internal-public'): Promise<Schemas['EnginePage']> {
    this.options.controls?.assertServing();
    budget.assertOpen();
    const request = parseEngineRequest(value, this.release);
    const understand = () => understandQuery(request, this.release, this.options.queryRules ? { rules: this.options.queryRules } : {});
    const plan = budget.trace ? budget.trace.sync('query.understand', understand) : understand();
    requireReadyQuery(plan);
    const scope = this.#scope(request);
    const binding = this.sessions.binding(request, plan?.normalized);
    const existing = this.sessions.resolve(request, caller, binding);
    const mapping = resolveSelection(this.release, request.selection);
    const unmapped = mapping.state === 'unmapped' || !scope.sourceSubcategoryIds.length;
    const retrieval = this.options.controls?.snapshot.flags.search === false ? undefined : this.options.retrieval;
    const retrieve = () => retrieveMerchants(request, plan, scope, this.release, this.provider, budget, retrieval);
    const retrieved = unmapped ? { rows: [], matches: [], candidateCount: 0 } : await (budget.trace ? budget.trace.run('retrieval', retrieve) : retrieve());
    const rank = () => existing ? revalidateMerchants(request, retrieved.rows, this.release, budget)
      : rankMerchants(request, retrieved.rows, retrieved.matches, this.release, budget).rows;
    const rows = budget.trace ? budget.trace.sync('ranking', rank) : rank();
    if (retrieved.window) await retrieved.window.assertCurrent(budget);
    const versions = { ...this.versions(), ...(retrieved.window ? { indexGeneration: retrieved.window.indexGeneration } : {}) };
    if (existing) this.sessions.assertVersions(existing.session, versions, retrieved.window?.sourceSnapshot);
    const session = existing?.session ?? this.sessions.create(caller, binding, rows.map(row => row.presentation.ref.id), versions, retrieved.candidateCount, unmapped, retrieved.window?.sourceSnapshot);
    const offset = existing?.offset ?? 0;
    // Current facts remove stale rows from their original slots. Never insert new
    // candidates, shift earlier slots, or apply a new ranking to the next page.
    const current = new Map(rows.map(row => [row.presentation.ref.id, row]));
    const returned = session.refs.slice(offset, offset + request.limit).flatMap(id => current.has(id) ? [current.get(id)!] : []);
    const nextOffset = offset + request.limit;
    const hasNext = nextOffset < session.refs.length;
    const page = parseSchema('EnginePage', { contractVersion: '1', requestId: request.requestId, refs: returned.map(row => row.presentation.ref),
      count: unmapped ? { kind: 'unknown' } : { kind: 'lower_bound', value: session.refs.filter(id => current.has(id)).length },
      retrieval: { scope: 'bounded_candidates', windowId: session.id, candidateCount: session.candidateCount, completion: unmapped ? 'unknown' : hasNext ? 'more_in_window' : 'window_exhausted' },
      versions,
      pageCursor: this.sessions.cursor(session, offset),
      ...(hasNext ? { nextCursor: this.sessions.cursor(session, nextOffset) } : {}),
      ...(offset > 0 ? { previousCursor: this.sessions.cursor(session, Math.max(0, offset - request.limit)) } : {}),
      applied: { selection: request.selection, filterHash: requestFingerprint(request, plan?.normalized),
        constraints: request.filters.map(value => ({ value, origin: 'explicit_control', strength: 'hard', state: 'supported', reasonCodes: ['CATALOG_AREA_ONLY'] })), sort: request.sort },
      status: unmapped ? 'unmapped' : returned.length < request.limit ? 'underfilled' : 'ok',
      presentations: { merchants: returned.map(row => row.presentation), offerings: [] } });
    budget.trace?.underfilled(page.status === 'underfilled'); budget.trace?.version(canonicalVersions(versions));
    budget.trace?.resultCounts(page.refs.length, retrieved.candidateCount);
    budget.assertOpen(); return page;
  }
}

function canonicalVersions(versions: Schemas['Versions']): string { return JSON.stringify(versions); }
