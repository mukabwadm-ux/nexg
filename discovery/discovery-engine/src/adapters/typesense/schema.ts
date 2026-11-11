import type { GenerationManifest } from '../../indexing/contracts.js';

/** No auto schema, operational facts, vectors, private payloads or default popularity. */
export function catalogCollectionSchema(name: string, manifest: GenerationManifest) {
  return { name, metadata: { discovery: manifest }, fields: [
    ...['stable_key', 'entity_kind', 'owner_id', 'source_id', 'merchant_id', 'provenance', 'release_id', 'mapping_revision', 'source_revision', 'content_hash']
      .map(name => ({ name, type: 'string', ...(name === 'stable_key' ? { sort: true } : {}),
        ...(['entity_kind', 'owner_id', 'provenance', 'release_id', 'mapping_revision'].includes(name) ? { facet: true } : {}) })),
    { name: 'label', type: 'string' }, { name: 'context_labels', type: 'string[]' },
    { name: 'selection_tokens', type: 'string[]', facet: true }, { name: 'deleted', type: 'bool', facet: true }, { name: 'sequence', type: 'int64' },
    { name: 'fact_valid_until', type: 'int64' },
  ] };
}
