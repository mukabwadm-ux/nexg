import type { Schemas } from '../../../src/contracts/index.js';
import type { ReadBudget } from '../../../src/orchestrator/readBudget.js';

/** Engine-owned read boundary. No collection names/purpose/filter strings from callers. */
export interface CandidateRequest { query: string; selectionId: string; mode: 'merchant' | 'offering'; limit: number }
export interface CandidateWindow {
  refs: Schemas['EngineRef'][];
  indexGeneration: string;
  sourceSnapshot: string;
  /** Revalidate the pinned alias/freshness after current source hydration. */
  assertCurrent(budget: ReadBudget): Promise<void>;
}
export interface RetrievalCandidatePort { search(request: CandidateRequest, budget: ReadBudget): Promise<CandidateWindow> }
