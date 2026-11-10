import type { EngineRequest } from '../contracts/index.js';
import { canonicalJson, sha256 } from './immutable.js';

/** Preserve the F07 applied-request hash; paging/session semantics remain F10. */
export function requestFingerprint(request: EngineRequest, normalizedQuery?: string): string {
  return sha256(canonicalJson(normalizedQuery === undefined ? request.filters
    : { filters: request.filters, query: normalizedQuery, mode: request.mode, selection: request.selection }));
}
