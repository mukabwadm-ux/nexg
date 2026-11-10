import type { EngineRequest, Selection, SupportedFilter, Schemas } from '../../../src/contracts/index.js';

export type CollectionPredicate =
  | { kind: 'scoped-explore' }
  | { kind: 'query-matches' }
  | { kind: 'requested-task-fit' }
  | { kind: 'more-from-merchant' }
  | { kind: 'comparable-alternatives'; priceKind: 'listed_price' | 'comparable_total' };
export interface LegacyCollectionDefinition {
  id: string; categoryId: string; title: string; enabled: false; reason: 'PREDICATE_NOT_IMPLEMENTED';
}
interface ExecutableFields {
  id: string; categoryId: string; titleKey: string; predicateVersion: '1'; predicate: CollectionPredicate;
  mode: EngineRequest['mode']; selection?: Selection; filters?: SupportedFilter[];
  minDistinct: number; maxItems: number;
}
export type ExecutableCollectionDefinition = ExecutableFields & (
  { enabled: true; reason?: never } | { enabled: false; reason: 'EDITORIAL_DISABLED' | 'SOURCE_CAPABILITY_PENDING' }
);
export type ReleasedCollectionDefinition = LegacyCollectionDefinition | ExecutableCollectionDefinition;
export interface PreparedCollection {
  definition: ExecutableCollectionDefinition;
  /** This exact predicate is executed by the existing results read port. */
  viewAllRequest: EngineRequest;
  readRequest: EngineRequest;
  expectedFilterHash: string;
}
export interface CollectionDiagnostic { definitionId: string; reasonCode: string }
export interface PreparedCollections { prepared: PreparedCollection[]; diagnostics: CollectionDiagnostic[] }
export interface CollectionCandidate { prepared: PreparedCollection; page: Schemas['EnginePage'] }
export interface CompositionResult { page: Schemas['CollectionPage']; diagnostics: CollectionDiagnostic[] }
