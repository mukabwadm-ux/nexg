import { ContractError, type Selection } from '../contracts/index.js';
import { validateSelection } from '../contracts/validate.js';
import { policyRegistry } from '../policy/registry.js';
import { canonicalJson, deepFreeze, revision, sha256 } from '../shared/immutable.js';
import type { ReleasedCollectionDefinition } from '../../engines/collection-composition/src/contracts.js';
import { validateCollectionDefinition } from '../../engines/collection-composition/src/definitions.js';

export interface TaxonomyNode {
  id: string; kind: 'category' | 'subcategory' | 'option'; parentId?: string;
  label: string; order: number; assetPath?: string;
  lifecycle: 'active' | 'context_candidate';
}
export interface Placement { id: string; nodeId: string; surface: 'L1' | 'L2'; contextId?: string; order: number }
export interface Mapping {
  nodeId: string; sourceCategoryIds: string[]; sourceSubcategoryIds: string[];
  status: 'configured_context_only' | 'unmapped'; note: string;
}
export interface ReleaseParts {
  schemaVersion: '1'; compatibility: { engineSchema: '1'; rendererSchema: '1' };
  nodes: TaxonomyNode[]; placements: Placement[]; mappings: Mapping[];
  collections: ReleasedCollectionDefinition[];
  assets: { path: string; sha256: string }[];
  sourceFiles: { path: string; sha256: string }[];
  policy: typeof policyRegistry;
  fallback: { unmapped: 'explicit_unmapped'; unknownFacts: 'preserve_unknown' };
}
export interface ReleaseArtifact extends ReleaseParts {
  releaseId: string; checksum: string;
  taxonomyRevision: string; layoutRevision: string; mappingRevision: string;
  collectionRevision: string; policyRevision: string; assetRevision: string;
  declaredCounts: { categories: number; subcategories: number; options: number };
}

function requireValue(condition: unknown, path: string): asserts condition {
  if (!condition) throw new ContractError('RELEASE_INCOMPATIBLE', [path]);
}
export function safeRelativePath(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && !value.includes('\\') && !value.includes('\0')
    && !value.includes(':') && !value.startsWith('/') && value.split('/').every(part => part !== '.' && part !== '..' && part !== '');
}
function unique(values: readonly string[], path: string): void {
  requireValue(values.every(value => typeof value === 'string' && value.length > 0 && value.length <= 512) && new Set(values).size === values.length, path);
}
export function sealRelease(parts: ReleaseParts): Readonly<ReleaseArtifact> {
  const payload = {
    ...structuredClone({ schemaVersion: parts.schemaVersion, compatibility: parts.compatibility, nodes: parts.nodes, placements: parts.placements,
      mappings: parts.mappings, collections: parts.collections, assets: parts.assets, sourceFiles: parts.sourceFiles, policy: parts.policy, fallback: parts.fallback }),
    declaredCounts: {
      categories: parts.nodes.filter(node => node.kind === 'category').length,
      subcategories: parts.nodes.filter(node => node.kind === 'subcategory').length,
      options: parts.nodes.filter(node => node.kind === 'option').length,
    },
    taxonomyRevision: revision(parts.nodes), layoutRevision: revision(parts.placements), mappingRevision: revision(parts.mappings),
    collectionRevision: revision(parts.collections), policyRevision: revision(parts.policy), assetRevision: revision(parts.assets),
  };
  const checksum = sha256(canonicalJson(payload));
  return validateReleaseArtifact({ ...payload, releaseId: `baseline-${checksum}`, checksum });
}

// This checks integrity/compatibility. Only a trusted reader selects an active release.
export function validateReleaseArtifact(value: unknown): Readonly<ReleaseArtifact> {
  try {
    requireValue(value && typeof value === 'object' && !Array.isArray(value), '/');
    const artifact = structuredClone(value) as ReleaseArtifact;
    requireValue(artifact.schemaVersion === '1' && artifact.compatibility.engineSchema === '1' && artifact.compatibility.rendererSchema === '1', '/compatibility');
    for (const key of ['nodes', 'placements', 'mappings', 'collections', 'assets', 'sourceFiles'] as const) requireValue(Array.isArray(artifact[key]), `/${key}`);
    unique(artifact.nodes.map(node => node.id), '/nodes');
    const nodes = new Map(artifact.nodes.map(node => [node.id, node]));
    unique(artifact.assets.map(asset => asset.path), '/assets');
    unique(artifact.sourceFiles.map(file => file.path), '/sourceFiles');
    const assets = new Set(artifact.assets.map(asset => asset.path));
    for (const file of [...artifact.assets, ...artifact.sourceFiles]) requireValue(safeRelativePath(file.path) && /^[a-f0-9]{64}$/.test(file.sha256), '/assets');
    for (const node of artifact.nodes) {
      requireValue(node.id.length <= 256, '/nodes/id');
      requireValue(typeof node.label === 'string' && node.label.trim() && Number.isSafeInteger(node.order) && node.order > 0, '/nodes');
      requireValue(node.lifecycle === 'active' || node.lifecycle === 'context_candidate', '/nodes/lifecycle');
      if (node.kind === 'category') requireValue(node.parentId === undefined, '/nodes/parentId');
      else requireValue((node.kind === 'subcategory' && nodes.get(node.parentId!)?.kind === 'category')
        || (node.kind === 'option' && nodes.get(node.parentId!)?.kind === 'subcategory'), '/nodes/parentId');
      requireValue(node.assetPath === undefined ? node.kind === 'option' : assets.has(node.assetPath), '/nodes/assetPath');
    }
    unique(artifact.nodes.map(node => `${node.kind}:${node.parentId ?? ''}:${node.order}`), '/nodes/order');
    unique(artifact.placements.map(placement => placement.id), '/placements');
    const slots = new Set<string>();
    for (const placement of artifact.placements) {
      const node = nodes.get(placement.nodeId);
      requireValue(Number.isSafeInteger(placement.order) && placement.order > 0, '/placements/order');
      requireValue((placement.surface === 'L1' && node?.kind === 'category' && placement.contextId === undefined)
        || (placement.surface === 'L2' && node?.kind === 'subcategory' && placement.contextId === node.parentId), '/placements/nodeId');
      const slot = `${placement.surface}:${placement.contextId ?? ''}:${placement.order}`;
      requireValue(!slots.has(slot), '/placements/order'); slots.add(slot);
    }
    unique(artifact.mappings.map(mapping => mapping.nodeId), '/mappings');
    requireValue(artifact.mappings.length === artifact.nodes.length, '/mappings');
    for (const mapping of artifact.mappings) {
      requireValue(nodes.has(mapping.nodeId), '/mappings/nodeId');
      unique(mapping.sourceCategoryIds, '/mappings/sourceCategoryIds'); unique(mapping.sourceSubcategoryIds, '/mappings/sourceSubcategoryIds');
      requireValue([...mapping.sourceCategoryIds, ...mapping.sourceSubcategoryIds].every(id => id.length <= 256), '/mappings/sourceIds');
      requireValue(mapping.status === (mapping.sourceCategoryIds.length || mapping.sourceSubcategoryIds.length ? 'configured_context_only' : 'unmapped'), '/mappings/status');
      requireValue(typeof mapping.note === 'string', '/mappings/note');
    }
    unique(artifact.collections.map(collection => collection.id), '/collections');
    for (const collection of artifact.collections) validateCollectionDefinition(collection, artifact);
    requireValue(artifact.fallback.unmapped === 'explicit_unmapped' && artifact.fallback.unknownFacts === 'preserve_unknown', '/fallback');
    requireValue(revision(artifact.policy) === revision(policyRegistry), '/policy');
    const counts = { categories: 0, subcategories: 0, options: 0 };
    for (const node of artifact.nodes) counts[node.kind === 'category' ? 'categories' : node.kind === 'subcategory' ? 'subcategories' : 'options']++;
    requireValue(canonicalJson(counts) === canonicalJson(artifact.declaredCounts), '/declaredCounts');
    for (const [field, data] of Object.entries({ taxonomyRevision: artifact.nodes, layoutRevision: artifact.placements, mappingRevision: artifact.mappings,
      collectionRevision: artifact.collections, policyRevision: artifact.policy, assetRevision: artifact.assets })) {
      requireValue((artifact as unknown as Record<string, unknown>)[field] === revision(data), `/${field}`);
    }
    const { releaseId, checksum, ...payload } = artifact;
    requireValue(checksum === sha256(canonicalJson(payload)) && releaseId === `baseline-${checksum}`, '/checksum');
    return deepFreeze(artifact);
  } catch (error) {
    if (error instanceof ContractError) throw error;
    throw new ContractError('RELEASE_INCOMPATIBLE', ['/']);
  }
}

export function resolveSelection(release: Readonly<ReleaseArtifact>, selection: Selection): { state: 'mapped_context' | 'unmapped'; nodeId?: string } {
  validateSelection(selection, release);
  const id = selection.optionId ?? selection.subcategoryId ?? selection.categoryId;
  if (!id) return { state: 'mapped_context' };
  const mapping = release.mappings.find(entry => entry.nodeId === id)!;
  return { state: mapping.status === 'unmapped' ? 'unmapped' : 'mapped_context', nodeId: id };
}
