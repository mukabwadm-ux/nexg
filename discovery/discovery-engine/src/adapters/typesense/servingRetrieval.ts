import type { CandidateRequest, CandidateWindow, RetrievalCandidatePort } from '../../../engines/search-retrieval/src/ports.js';
import type { ReadBudget } from '../../orchestrator/readBudget.js';
import type { ReleaseArtifact } from '../../releases/artifact.js';
import { ReadServiceError, sourceUnavailable } from '../../contracts/readErrors.js';
import { IndexingError } from '../../indexing/contracts.js';
import { validateSourceStamp } from '../../indexing/projection.js';
import { TypesenseCandidateReader } from './candidateReader.js';
import type { TypesenseIndexAdapter } from './indexAdapter.js';

/** Only the active serving alias is reachable through the application port.
 * A preview/evaluation generation is never a fallback. Source hydration is mandatory.
 */
export class TypesenseServingRetrieval implements RetrievalCandidatePort {
  constructor(private readonly index: TypesenseIndexAdapter, private readonly release: Readonly<ReleaseArtifact>, private readonly now: () => number = Date.now) {}
  async #safe<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); } catch (error) {
      if (error instanceof ReadServiceError) throw error;
      if (error instanceof IndexingError && error.code === 'INDEX_GENERATION_RESTART_REQUIRED') {
        throw new ReadServiceError('CURSOR_RESTART_REQUIRED', 409, false, 'restart_preserving_constraints', ['/query']);
      }
      if (error instanceof IndexingError && ['STALE_SOURCE', 'STALE_SOURCE_FACT'].includes(error.code)) {
        throw new ReadServiceError('FACTS_TOO_STALE', 503, true, 'retry_read');
      }
      throw sourceUnavailable();
    }
  }
  async search(request: CandidateRequest, budget: ReadBudget): Promise<CandidateWindow> {
    return this.#safe(async () => {
      budget.assertOpen();
      const collection = await this.index.readAlias('serving', budget.signal);
      if (!collection) throw sourceUnavailable(false);
      const reader = new TypesenseCandidateReader(this.index, this.release, this.now);
      const window = await reader.search(collection, request, 'serving', budget.signal);
      if (!window.sourceSnapshot) throw sourceUnavailable(false);
      budget.assertOpen();
      return { refs: window.refs, indexGeneration: collection, sourceSnapshot: window.sourceSnapshot,
        assertCurrent: async currentBudget => this.#safe(async () => {
          currentBudget.assertOpen();
          if (await this.index.readAlias('serving', currentBudget.signal) !== collection) throw new IndexingError('INDEX_GENERATION_RESTART_REQUIRED');
          const generation = await this.index.inspect(collection, currentBudget.signal);
          validateSourceStamp(generation.manifest.source, 'serving', this.now());
          if (Date.parse(generation.manifest.expiresAt) <= this.now()) throw new IndexingError('STALE_SOURCE_FACT');
          currentBudget.assertOpen();
        }) };
    });
  }
}
