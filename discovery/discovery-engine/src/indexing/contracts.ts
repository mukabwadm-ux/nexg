import { Ajv2020 } from 'ajv/dist/2020.js';
import { default as addFormatsModule } from 'ajv-formats';
import { parseCatalogProjection, type CatalogProjection } from '../contracts/ownerProjection.js';

export class IndexingError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'IndexingError'; }
}
export function requireIndex(condition: unknown, code: string): asserts condition { if (!condition) throw new IndexingError(code); }
export interface SourceStamp {
  ownerId: string; scopeId: string; snapshotId: string | null; checkpoint: number | null;
  asOf: string; complete: boolean; deletions: 'included' | 'unknown';
}
export interface ProjectionRecord { projection: CatalogProjection; sequence: number | null }
export interface CatalogSnapshot { kind: 'snapshot'; source: SourceStamp; records: ProjectionRecord[] }
export interface CatalogDelta { kind: 'delta'; source: SourceStamp; fromSnapshot: string; fromCheckpoint: number; records: ProjectionRecord[] }
export type IndexInput = CatalogSnapshot | CatalogDelta;
export type IndexPurpose = 'preview' | 'evaluation' | 'serving';
export interface SearchDocument {
  id: string; stable_key: string; entity_kind: 'merchant' | 'offering'; owner_id: string; source_id: string; merchant_id: string;
  label: string; context_labels: string[]; selection_tokens: string[]; provenance: 'confirmed' | 'demo' | 'unknown';
  deleted: boolean; sequence: number; source_revision: string; content_hash: string; release_id: string; mapping_revision: string;
  fact_valid_until: number;
}
export interface GenerationManifest {
  schemaVersion: '1'; projectionVersion: 'catalog-text/v1'; releaseId: string; mappingRevision: string; policyRevision: string;
  purpose: IndexPurpose; source: SourceStamp; expiresAt: string; inputDigest: string; documentsDigest: string; count: number; tombstoneCount: number;
}
export interface IndexGeneration { collection: string; manifest: GenerationManifest; count: number }

const ajv = new Ajv2020({ coerceTypes: false, removeAdditional: false, useDefaults: false });
(addFormatsModule as unknown as (validator: Ajv2020) => void)(ajv);
const text = { type: 'string', minLength: 1, maxLength: 256 };
const nullableText = { anyOf: [text, { type: 'null' }] };
const nullableSequence = { anyOf: [{ type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER }, { type: 'null' }] };
const sourceSchema = { type: 'object', additionalProperties: false, required: ['ownerId', 'scopeId', 'snapshotId', 'checkpoint', 'asOf', 'complete', 'deletions'],
  properties: { ownerId: text, scopeId: text, snapshotId: nullableText, checkpoint: nullableSequence,
    asOf: { type: 'string', format: 'date-time', pattern: '(Z|[+-]\\d{2}:\\d{2})$' }, complete: { type: 'boolean' }, deletions: { enum: ['included', 'unknown'] } } };
const record = { type: 'object', additionalProperties: false, required: ['projection', 'sequence'], properties: { projection: { type: 'object' }, sequence: nullableSequence } };
const inputValidator = ajv.compile<IndexInput>({ type: 'object', additionalProperties: false, required: ['kind', 'source', 'records'],
  properties: { kind: { enum: ['snapshot', 'delta'] }, source: sourceSchema, records: { type: 'array', maxItems: 10000, items: record }, fromSnapshot: text,
    fromCheckpoint: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER } },
  if: { properties: { kind: { const: 'delta' } } }, then: { required: ['fromSnapshot', 'fromCheckpoint'] },
  else: { not: { anyOf: [{ required: ['fromSnapshot'] }, { required: ['fromCheckpoint'] }] } } });
const digest = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const manifestValidator = ajv.compile<GenerationManifest>({ type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'projectionVersion', 'releaseId', 'mappingRevision', 'policyRevision', 'purpose', 'source', 'expiresAt', 'inputDigest', 'documentsDigest', 'count', 'tombstoneCount'],
  properties: { schemaVersion: { const: '1' }, projectionVersion: { const: 'catalog-text/v1' }, releaseId: text, mappingRevision: text, policyRevision: text,
    purpose: { enum: ['preview', 'evaluation', 'serving'] }, source: sourceSchema, expiresAt: { type: 'string', format: 'date-time' }, inputDigest: digest, documentsDigest: digest,
    count: { type: 'integer', minimum: 0, maximum: 10000 }, tombstoneCount: { type: 'integer', minimum: 0, maximum: 10000 } } });
const strings = { type: 'array', maxItems: 200, items: { type: 'string', maxLength: 1000 } };
const documentValidator = ajv.compile<SearchDocument>({ type: 'object', additionalProperties: false,
  required: ['id', 'stable_key', 'entity_kind', 'owner_id', 'source_id', 'merchant_id', 'label', 'context_labels', 'selection_tokens', 'provenance', 'deleted', 'sequence', 'source_revision', 'content_hash', 'release_id', 'mapping_revision', 'fact_valid_until'],
  properties: { id: digest, stable_key: digest, entity_kind: { enum: ['merchant', 'offering'] }, owner_id: text, source_id: text, merchant_id: text,
    label: { type: 'string', maxLength: 1000 }, context_labels: strings, selection_tokens: { type: 'array', maxItems: 200, items: digest },
    provenance: { enum: ['confirmed', 'demo', 'unknown'] }, deleted: { type: 'boolean' }, sequence: { type: 'integer', minimum: -1, maximum: Number.MAX_SAFE_INTEGER },
    source_revision: { type: 'string', maxLength: 256 }, content_hash: digest, release_id: text, mapping_revision: text,
    fact_valid_until: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER } } });

/** Only trusted operator/owner adapters may supply these internal envelopes. */
export function parseIndexInput(value: unknown): IndexInput {
  requireIndex(inputValidator(value), 'INVALID_INDEX_INPUT');
  const input = structuredClone(value);
  for (const row of input.records) row.projection = parseCatalogProjection(row.projection);
  requireIndex(Buffer.byteLength(JSON.stringify(input)) <= 32 * 1024 * 1024, 'GENERATION_TOO_LARGE');
  return input;
}
export function parseManifest(value: unknown): GenerationManifest {
  requireIndex(manifestValidator(value), 'INVALID_GENERATION'); return structuredClone(value);
}
export function parseSearchDocument(value: unknown): SearchDocument {
  requireIndex(documentValidator(value), 'INVALID_INDEX_DOCUMENT'); return structuredClone(value);
}
