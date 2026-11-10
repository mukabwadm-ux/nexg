import type { EngineSchemas, PageResult } from './DiscoveryProvider';

export type ReadFailureKind = 'clarification' | 'unsupported' | 'restart' | 'unavailable' | 'missing' | 'invalid';
export interface ReadFailure {
  kind: ReadFailureKind;
  detail?: EngineSchemas['EngineError'];
  retryAfterSeconds?: number;
}
export class ProviderReadError extends Error {
  constructor(readonly failure: ReadFailure) { super(failure.detail?.code ?? failure.kind); this.name = 'ProviderReadError'; }
}
export function failureFrom(error: unknown): ReadFailure {
  return error instanceof ProviderReadError ? error.failure : { kind: 'unavailable' };
}
export function wireFailure(detail: EngineSchemas['EngineError'], retryAfterSeconds?: number): ProviderReadError {
  const kind: ReadFailureKind = detail.code === 'CLARIFICATION_REQUIRED' ? 'clarification'
    : detail.recovery === 'restart_preserving_constraints' ? 'restart'
    : ['UNSUPPORTED_CAPABILITY', 'REQUIRED_FACT_UNKNOWN', 'FACTS_TOO_STALE'].includes(detail.code) ? 'unsupported'
    : detail.code === 'NOT_FOUND' ? 'missing'
    : ['CATALOG_UNAVAILABLE', 'OWNER_UNAVAILABLE', 'RATE_LIMITED'].includes(detail.code) ? 'unavailable' : 'invalid';
  return new ProviderReadError({ kind, detail, ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) });
}
export function countLabel(page: PageResult, singular = 'merchant', plural = 'merchants'): string {
  const count = page.semantics === 'bounded/v2' ? page.count : { kind: 'exact' as const, value: page.total };
  if (count.kind === 'unknown') return 'Count unavailable';
  return `${count.kind === 'lower_bound' ? 'At least ' : ''}${count.value} ${count.value === 1 ? singular : plural}`;
}
export function windowMessage(page: PageResult): string | undefined {
  if (page.semantics !== 'bounded/v2' || page.status === 'unmapped') return undefined;
  if (page.retrieval.completion === 'window_exhausted') return 'End of this discovery window. More results may exist in the catalog.';
  if (page.retrieval.completion === 'unknown') return 'This is a limited discovery window; the catalog total is unknown.';
  return undefined;
}

export const recoveryCopy = (failure: ReadFailure) => failure.kind === 'invalid' && failure.detail?.fieldPaths.includes('/contextToken')
  ? { title: 'Return to the original collection', text: 'This link needs its original discovery context. Open the collection again to keep all its filters.' }
  : failure.kind === 'unsupported' && failure.detail?.fieldPaths.includes('/selection/categoryId')
  ? { title: 'Choose a category to explore', text: 'Select a category above to search its merchant listings.' } : ({
  clarification: { title: 'Your search needs a little more detail', text: 'Your filters are saved. Refine your search to continue.' },
  unsupported: { title: 'This request is not supported yet', text: 'Your selection is saved. Change the unsupported search or filter to continue.' },
  restart: { title: 'Refresh this discovery window', text: 'This page has expired or changed. Start again with the same search and filters.' },
  unavailable: { title: 'Discovery is temporarily unavailable', text: 'We couldn’t load the current catalog. Your selection is saved.' },
  missing: { title: 'This listing is no longer available', text: 'The current catalog could not find this listing. Return to discovery to continue.' },
  invalid: { title: 'Check your discovery selection', text: 'Some search details conflict or are no longer valid. Your selection is saved.' },
}[failure.kind]);

/** Only registered copy is rendered. Unknown localization keys remain metadata. */
export const clarificationLabel = (key: string): string | undefined => ({
  'discovery.query.refine_request': 'Refine your search above',
  'discovery.query.keep_selected_browse': 'You can edit the search while keeping your selected filters.',
}[key]);
export const clarificationMessage = (key: string): string | undefined => ({
  'date_timezone_required': 'Specify the date and timezone for this search.',
  'time_window_required': 'Specify the start and end time you need.',
  'date_conflict': 'The date in your search differs from your selected date. Choose the date you mean.',
  'party_conflict': 'The group size in your search differs from your selected group. Choose the size you mean.',
  'party_configuration_required': 'Specify the group size before comparing options.',
  'budget_meaning_required': 'Specify the currency and whether the budget covers each person or the whole group.',
  'location_correction_required': 'Check the place name and select the area you mean.',
  'entity_mode_required': 'This search needs verified offerings. Choose a supported merchant search to continue.',
  'selection_text_conflict': 'Your search names a different category from your selection. Choose which one you mean.',
}[key]);
