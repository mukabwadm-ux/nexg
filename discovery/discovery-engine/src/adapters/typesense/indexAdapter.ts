import { randomUUID } from 'node:crypto';
import type { IndexAdminPort } from '../../indexing/ports.js';
import { IndexingError, parseManifest, parseSearchDocument, requireIndex, type GenerationManifest, type SearchDocument } from '../../indexing/contracts.js';
import { TypesenseTransport, jsonObject, type TypesenseConnection } from './transport.js';
import { catalogCollectionSchema } from './schema.js';

/** Typesense details are confined to this adapter behind an engine-owned port. */
export class TypesenseIndexAdapter implements IndexAdminPort {
  readonly http: TypesenseTransport;
  constructor(options: TypesenseConnection) { this.http = new TypesenseTransport(options); }
  async health(signal = AbortSignal.timeout(1000)): Promise<boolean> {
    try { return jsonObject(await this.http.request('GET', '/health', signal)).ok === true; } catch { return false; }
  }
  async create(manifest: GenerationManifest, signal: AbortSignal): Promise<string> {
    const name = `${this.http.namespace}_g_${randomUUID().replaceAll('-', '')}`;
    const result = jsonObject(await this.http.request('POST', '/collections', signal, { body: catalogCollectionSchema(name, parseManifest(manifest)) }));
    requireIndex(result.name === name, 'INVALID_SEARCH_RESPONSE'); return name;
  }
  async importDocuments(collection: string, documents: readonly SearchDocument[], signal: AbortSignal): Promise<void> {
    this.http.collection(collection);
    let batch: string[] = []; let bytes = 0;
    const flush = async () => {
      if (!batch.length) return;
      const result = await this.http.request('POST', `/collections/${collection}/documents/import?action=upsert&dirty_values=reject`, signal, { jsonl: batch.join('\n') });
      const lines = result?.trim().split('\n') ?? [];
      requireIndex(lines.length === batch.length, 'PARTIAL_INDEX_IMPORT');
      for (const line of lines) requireIndex(jsonObject(line).success === true, 'PARTIAL_INDEX_IMPORT');
      batch = []; bytes = 0;
    };
    for (const document of documents) {
      const line = JSON.stringify(parseSearchDocument(document)); const size = Buffer.byteLength(line) + 1;
      requireIndex(size <= 1024 * 1024, 'INDEX_DOCUMENT_TOO_LARGE');
      if (batch.length >= 200 || bytes + size > 1024 * 1024) await flush();
      batch.push(line); bytes += size;
    }
    await flush();
  }
  async inspect(collection: string, signal: AbortSignal) {
    this.http.collection(collection);
    const result = jsonObject(await this.http.request('GET', `/collections/${collection}`, signal));
    const metadata = result.metadata as { discovery?: unknown } | undefined;
    const manifest = parseManifest(metadata?.discovery);
    requireIndex(result.name === collection && Number.isSafeInteger(result.num_documents) && (result.num_documents as number) >= 0 && (result.num_documents as number) <= 10000, 'INVALID_SEARCH_RESPONSE');
    return { collection, manifest, count: result.num_documents as number };
  }
  async exportDocuments(collection: string, signal: AbortSignal): Promise<SearchDocument[]> {
    this.http.collection(collection);
    const body = await this.http.request('GET', `/collections/${collection}/documents/export`, signal, { maxBytes: 32 * 1024 * 1024 });
    const lines = body!.trim() ? body!.trim().split('\n') : [];
    requireIndex(lines.length <= 10000, 'GENERATION_TOO_LARGE'); return lines.map(line => parseSearchDocument(jsonObject(line)));
  }
  async readAlias(purpose: 'serving' | 'evaluation', signal: AbortSignal): Promise<string | null> {
    const result = await this.http.request('GET', `/aliases/${this.http.alias(purpose)}`, signal, { allow404: true });
    if (result === null) return null;
    const name = jsonObject(result).collection_name;
    requireIndex(typeof name === 'string', 'INVALID_SEARCH_RESPONSE'); return this.http.collection(name);
  }
  async pointAlias(purpose: 'serving' | 'evaluation', collection: string, signal: AbortSignal): Promise<void> {
    this.http.collection(collection);
    try { await this.http.request('PUT', `/aliases/${this.http.alias(purpose)}`, signal, { body: { collection_name: collection } }); }
    catch (error) {
      // A timeout is an unknown write outcome. Read back before any retry.
      let observed;
      try { observed = await this.readAlias(purpose, AbortSignal.timeout(1000)); }
      catch { throw new IndexingError('ALIAS_PUBLICATION_UNKNOWN'); }
      if (observed === collection) return;
      throw error;
    }
    try { requireIndex(await this.readAlias(purpose, signal) === collection, 'ALIAS_PUBLICATION_UNKNOWN'); }
    catch { throw new IndexingError('ALIAS_PUBLICATION_UNKNOWN'); }
  }
  async removeUnpublished(collection: string, signal: AbortSignal): Promise<void> {
    this.http.collection(collection);
    requireIndex(await this.readAlias('serving', signal) !== collection && await this.readAlias('evaluation', signal) !== collection, 'PUBLISHED_GENERATION_DELETE_FORBIDDEN');
    await this.http.request('DELETE', `/collections/${collection}`, signal);
  }
}
