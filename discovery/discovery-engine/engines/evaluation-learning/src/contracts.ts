import type { Selection } from '../../../src/contracts/index.js';

export interface JudgedQuery {
  id: string; familyId: string; language: 'en' | 'sw' | 'mixed'; selection: Selection;
  crossCategory: boolean; expectedEmpty: 'known_empty' | 'unknown';
  caseKind: 'relevance' | 'routing' | 'unknown_fact'; review: 'judged' | 'unreviewed';
  judgments: { ref: string; grade: number; eligible: 'yes' | 'no' | 'unknown' }[];
}
export interface EvaluationManifest {
  schemaVersion: '1'; runId: string; createdAt: string; discoveryReleaseId: string;
  track: 'nexg_release' | 'public_research' | 'protocol_control';
  source: { origin: 'production_verified' | 'observed_unverified' | 'public_research' | 'protocol_control'; corpusSha256: string;
    license: string; snapshotRef?: string; approvalRef?: string };
  split: { kind: 'development' | 'held_out' | 'official_test'; familyIsolation: boolean; independentReview: boolean; reviewerRef?: string };
  protocol: { gain: 'exponential' | 'linear'; unjudged: 'zero_gain_unjudged_reported'; selfMatch: 'exclude'; seed: number; bootstrapSamples: number; outOfCorpusJudgments?: 'retain_unretrievable_public' };
  resources: { identity: string; allocationVerified: boolean; cpuCount: number; memoryGiB: number; runtime: string };
  system: { id: string; codeSha256: string; configSha256: string; tuningTrials: number; validationOnly: boolean };
  inputSha256: string;
}
export interface QueryRun { queryId: string; status: 'ok' | 'failed'; refs: string[]; constraintViolations: number }
export interface EvaluationBundle { manifest: EvaluationManifest; universe: string[]; queries: JudgedQuery[]; runs: QueryRun[] }
export interface QueryScore {
  queryId: string; familyId: string; status: 'ok' | 'failed'; ndcg10: number | null; ndcg20: number | null; recall100: number | null;
  positiveJudgments: number; outOfCorpusJudgments: number; unjudgedReturned: number; emptyCorrect: boolean | null; violations: number;
}
export interface AggregateScore {
  queries: number; scored: number; failures: number; violations: number; outOfCorpusJudgments: number; unjudgedReturned: number;
  ndcg10: number | null; ndcg20: number | null; recall100: number | null; emptyCases: number; emptyAccuracy: number | null;
}
export interface SliceScore extends AggregateScore { id: string; kind: 'category' | 'subcategory' | 'option' | 'language'; mapping: string }
export interface EvaluationReport {
  schemaVersion: '1'; manifest: EvaluationManifest; perQuery: QueryScore[]; overall: AggregateScore;
  slices: SliceScore[]; macro: { categoriesScored: number; categoriesTotal: number; subcategoriesScored: number; subcategoriesTotal: number;
    categoryNdcg10: number | null; subcategoryNdcg10: number | null };
  limitations: string[];
}
export interface Gate { id: string; state: 'pass' | 'fail' | 'not_evaluated'; reason: string }
export interface ReleaseEvidence {
  routing: { testedNodes: number; releasedNodes: number; violations: number };
  performance?: { attempts: number; failures: number; p95Ms: number; p99Ms: number; sustained: boolean; allocationVerified: boolean;
    resourceIdentity?: string; rps?: number; measuredSeconds?: number };
  cost?: { currency: string; perThousandSuccessful: number; quoteRef: string };
  reference?: { bundle?: EvaluationBundle; report?: EvaluationReport; strongestReviewed: boolean; reviewRef?: string };
  reviewerRef?: string; rollbackRef?: string;
}
export class EvaluationError extends Error { constructor(readonly code: string) { super(code); } }
