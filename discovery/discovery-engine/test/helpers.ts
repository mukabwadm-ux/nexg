import { fileURLToPath } from 'node:url';
import { BaselineReleaseReader } from '../src/releases/baselineReleaseReader.js';
import { sealRelease, type ReleaseParts } from '../src/releases/artifact.js';
import type { EngineRequest, Evidence, Fact, SupportedFilter } from '../src/contracts/index.js';
import { requestBinding, type PolicyInput, type VerifiedWorkflow } from '../engines/catalog-eligibility/src/index.js';
import type { WorkflowKind } from '../src/policy/registry.js';

export const workspace = fileURLToPath(new URL('../../../', import.meta.url));
export const release = await new BaselineReleaseReader(workspace).resolvePublishedRelease();
/**
 * Since 8 Nov 2026 every baseline subcategory has a source mapping (owner decision). Unmapped behaviour is
 * exercised on this isolated, resealed copy with one subcategory's source groups removed.
 */
export function releaseWithUnmappedSubcategory(nodeId = 'beauty-wellness:salon-barber') {
  const parts = structuredClone(release) as ReleaseParts;
  const mapping = parts.mappings.find(entry => entry.nodeId === nodeId);
  if (!mapping || parts.nodes.some(node => node.parentId === nodeId)) throw new Error(`${nodeId} cannot be unmapped in isolation`);
  mapping.sourceSubcategoryIds = []; mapping.status = 'unmapped'; mapping.note = 'Isolated unmapped-behaviour control.';
  const { nodes, placements, mappings, collections, assets, sourceFiles, policy, fallback, schemaVersion, compatibility } = parts;
  return sealRelease({ nodes, placements, mappings, collections, assets, sourceFiles, policy, fallback, schemaVersion, compatibility });
}
export const checkedAt = '2026-10-19T09:00:00Z';
export const evidence: Evidence = { source: { ownerId: 'contract-owner', id: 'contract-offering', revision: 'control-revision' }, observedAt: checkedAt, validUntil: '2026-10-19T10:00:00Z' };
export const known = <T>(value: T): Fact<T> => ({ state: 'known', value, evidence: structuredClone(evidence) });
export const unknown: Fact<never> = { state: 'unknown', reason: 'not_verified' };
export function request(filters: SupportedFilter[] = []): EngineRequest {
  return { contractVersion: '1', requestId: 'contract-request', discoveryReleaseId: release.releaseId, mode: 'offering',
    selection: { categoryId: 'beauty-wellness' }, filters, sort: 'recommended', limit: 24 };
}
// Isolated policy/schema controls only. These references are never catalog/provider records.
export function policyControl(filters: SupportedFilter[] = [], kind: WorkflowKind = 'APPOINTMENT'): PolicyInput {
  const selectedRequest = request(filters);
  const workflow: VerifiedWorkflow = { kind, version: '1', ref: { ownerId: 'contract-owner', id: 'contract-workflow', revision: 'workflow-revision' },
    supportedFilters: ['party', 'workflow_kind', 'comparable_total', 'required_availability', 'required_attributes', 'listed_price', 'fulfillment', 'service_area'],
    modules: ['resources'], layers: [] };
  return { release, request: selectedRequest, checkedAt,
    source: { ref: { kind: 'offering', ownerId: 'contract-owner', id: 'contract-offering', merchantId: 'contract-parent' }, sourceRevision: 'control-revision',
      requestBinding: requestBinding(selectedRequest), current: known(true), callerAccess: known(true), discoveryScope: known(true), workflow: known(workflow) } };
}
export const interval = { start: '2026-10-20T09:00:00+03:00', end: '2026-10-20T10:00:00+03:00', timezone: 'Africa/Nairobi', boundary: 'start_inclusive_end_exclusive' as const };
