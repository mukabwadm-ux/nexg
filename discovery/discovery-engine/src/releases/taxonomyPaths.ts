import type { Schemas } from '../contracts/index.js';
import type { ReleaseArtifact } from './artifact.js';

export type TaxonomyPath = Schemas['TaxonomyPath'];
/** Source subcategory ID → where the published release places it in the Discovery taxonomy. */
export type TaxonomyPathIndex = ReadonlyMap<string, readonly Readonly<TaxonomyPath>[]>;

/** The contract allows at most this many paths per merchant. */
const MAX_PATHS = 8;

/**
 * Builds, once per release, the taxonomy path of every source subcategory the release maps: its subcategory,
 * that subcategory's category and, when exactly one option under the subcategory maps the same source group,
 * the option. Only the release's own mappings are used: never names, text or the request being answered.
 */
export function taxonomyPathIndex(release: Pick<ReleaseArtifact, 'nodes' | 'mappings'>): TaxonomyPathIndex {
  const nodes = new Map(release.nodes.map(node => [node.id, node]));
  const paths = new Map<string, TaxonomyPath[]>();
  const options = new Map<string, string[]>();
  for (const mapping of release.mappings) {
    const node = nodes.get(mapping.nodeId);
    if (!node?.parentId || mapping.status === 'unmapped') continue;
    for (const source of new Set(mapping.sourceSubcategoryIds)) {
      if (node.kind === 'subcategory') {
        const list = paths.get(source) ?? [];
        if (!list.some(path => path.subcategoryId === node.id)) list.push({ categoryId: node.parentId, subcategoryId: node.id });
        paths.set(source, list);
      } else if (node.kind === 'option') {
        const key = `${source}\u0000${node.parentId}`;
        options.set(key, [...(options.get(key) ?? []), node.id]);
      }
    }
  }
  const order = (id: string) => nodes.get(id)?.order ?? Number.MAX_SAFE_INTEGER;
  const index = new Map<string, readonly Readonly<TaxonomyPath>[]>();
  for (const [source, list] of paths) {
    const resolved = list.map(path => {
      const candidates = options.get(`${source}\u0000${path.subcategoryId}`) ?? [];
      return Object.freeze(candidates.length === 1 ? { ...path, optionId: candidates[0]! } : path);
    }).sort((left, right) => order(left.categoryId) - order(right.categoryId) || order(left.subcategoryId) - order(right.subcategoryId)
      || left.subcategoryId.localeCompare(right.subcategoryId));
    index.set(source, Object.freeze(resolved.slice(0, MAX_PATHS)));
  }
  return index;
}

/** The paths for one source subcategory, as fresh objects for a response. Undefined when the release has none. */
export function taxonomyPathsFor(index: TaxonomyPathIndex | undefined, sourceSubcategoryId: string | undefined): TaxonomyPath[] | undefined {
  const paths = index && sourceSubcategoryId ? index.get(sourceSubcategoryId) : undefined;
  return paths?.length ? paths.map(path => ({ ...path })) : undefined;
}
