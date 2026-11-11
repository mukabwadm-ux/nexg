import type { EngineRequest, Schemas } from '../contracts/index.js';
import { ReadServiceError } from '../contracts/readErrors.js';
import type { ReleaseArtifact } from '../releases/artifact.js';
import type { ReadBudget } from './readBudget.js';
import { canonicalJson } from '../shared/immutable.js';
import type { QueryRules } from '../../engines/query-understanding/src/index.js';
import { prepareCollections, selectCollections, type CollectionCandidate } from '../../engines/collection-composition/src/index.js';

/** The port reuses the exact results application path, never a catalog adapter. */
export interface CollectionResultsPort { results(request: EngineRequest, budget: ReadBudget): Promise<Schemas['EnginePage']> }
export class CollectionCompositionService {
  constructor(private readonly release: Readonly<ReleaseArtifact>, private readonly results: CollectionResultsPort, private readonly queryRules?: QueryRules) {}
  async compose(value: unknown, budget: ReadBudget): Promise<Schemas['CollectionPage']> {
    budget.assertOpen();
    const { prepared, diagnostics } = prepareCollections(value, this.release, this.queryRules);
    const candidates: CollectionCandidate[] = []; const reads = new Map<string, Promise<Schemas['EnginePage']>>();
    for (const item of prepared) {
      budget.assertOpen();
      const key = canonicalJson(item.readRequest);
      let page = reads.get(key);
      if (!page) {
        page = this.results.results(item.readRequest, budget); reads.set(key, page);
      }
      try { candidates.push({ prepared: item, page: await budget.waitFor(page) }); }
      catch (error) {
        // A released definition may require an unconnected capability. Hide it,
        // retaining every explicit requirement. Source/time/budget errors propagate.
        if (error instanceof ReadServiceError && error.code === 'UNSUPPORTED_CAPABILITY') {
          diagnostics.push({ definitionId: item.definition.id, reasonCode: 'COLLECTION_SOURCE_CAPABILITY_UNSUPPORTED' });
        } else throw error;
      }
    }
    budget.assertOpen();
    const result = selectCollections(candidates, diagnostics, this.release);
    budget.assertOpen(); return result.page;
  }
}
