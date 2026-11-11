import type { EngineRef, EngineRequest, Evidence, Fact } from '../../../src/contracts/index.js';
import type { OfferingFacts } from '../../catalog-eligibility/src/index.js';
import type { ReleaseArtifact } from '../../../src/releases/artifact.js';

export const rankerRevision = 'deterministic-recommendation/v1';
export type RelevanceBand = 'name' | 'context' | 'partial';
export interface RankingCandidate {
  source: OfferingFacts;
  relevance: { exactIdentity: boolean; band: RelevanceBand; retrievalRank: number };
  /** Verified classification/comparison predicate key, never a category default. */
  diversityGroup?: Fact<string>;
  /** Comparable, owner-qualified confidence metric, not an unverified raw rating. */
  quality?: { metricId: string; value: Fact<number> };
}
export type ExplicitPreference = { id: string; weight: number } & (
  { kind: 'catalog_area'; areaId: string } | { kind: 'attribute'; key: string; valueId: string }
);
export interface PreferenceContext {
  origin: 'explicit_request'; requestBinding: string; preferences: readonly ExplicitPreference[];
}
/** A trusted owner port must attest global semantics, never a top-K local sort.
 * The current platform adapter does not produce this proof.
 */
export interface SourceSortOrder {
  sort: Exclude<EngineRequest['sort'], 'recommended'>;
  requestBinding: string; ownerId: string; scopeId: string; snapshotId: string;
  scope: 'complete_request_scope'; comparisonKey: string;
  refs: readonly EngineRef[]; evidence: Evidence;
}
export interface RankingInput {
  release: Readonly<ReleaseArtifact>; request: EngineRequest; checkedAt: string;
  candidates: readonly RankingCandidate[];
  attributeRegistry?: Readonly<Record<string, readonly string[]>>;
  /** Server-approved metric definitions. Empty by default; no legacy rating input. */
  qualityMetricIds?: readonly string[];
  preferenceContext?: PreferenceContext;
  explicitOrder?: SourceSortOrder;
  intent?: 'general' | 'exact_merchant';
}
export interface RankedItem {
  ref: EngineRef;
  reasonCodes: string[];
  /** Internal audit only. These values never become source or public wire facts. */
  score: { base: number; preferenceFit?: number; combined: number };
}
export type DiversityStatus = 'not_applicable' | 'explicit_sort' | 'exact_merchant' | 'applied' | 'unchanged' | 'sparse_supply' | 'comparison_unresolved' | 'exact_identity';
export interface RankingResult {
  rankerRevision: string; items: RankedItem[];
  excluded: { ref: EngineRef; reasonCodes: string[] }[];
  diversity: { statuses: DiversityStatus[]; movedCount: number; windowSize: number };
}
export interface RankedRow {
  candidate: RankingCandidate; item: RankedItem; groupKey: string;
  diversityKey?: string; qualityValue?: number; qualityComparable?: boolean;
}
/** JSON tuple avoids delimiter collisions in opaque owner/source identifiers. */
export const refKey = (ref: EngineRef): string => JSON.stringify([ref.ownerId, ref.kind, ref.id]);
export const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
export const compareRef = (a: EngineRef, b: EngineRef): number => compareText(a.id, b.id) || compareText(a.merchantId, b.merchantId)
  || compareText(a.ownerId, b.ownerId) || compareText(a.kind, b.kind);
