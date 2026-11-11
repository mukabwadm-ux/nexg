import type { GenerationManifest, IndexGeneration, IndexInput, SearchDocument } from './contracts.js';

/** Catalog owners implement the versioned export, never the index adapter. */
export interface CatalogIndexSource { read(signal: AbortSignal): Promise<IndexInput> }
export interface IndexAdminPort {
  create(manifest: GenerationManifest, signal: AbortSignal): Promise<string>;
  importDocuments(collection: string, documents: readonly SearchDocument[], signal: AbortSignal): Promise<void>;
  inspect(collection: string, signal: AbortSignal): Promise<IndexGeneration>;
  exportDocuments(collection: string, signal: AbortSignal): Promise<SearchDocument[]>;
  readAlias(purpose: 'serving' | 'evaluation', signal: AbortSignal): Promise<string | null>;
  pointAlias(purpose: 'serving' | 'evaluation', collection: string, signal: AbortSignal): Promise<void>;
}
export interface WriterLock { run<T>(operation: () => Promise<T>): Promise<T> }
