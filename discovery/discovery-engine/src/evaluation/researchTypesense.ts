import { createHash, randomBytes } from 'node:crypto';
import { TypesenseTransport } from '../adapters/typesense/transport.js';
import { EvaluationError } from '../../engines/evaluation-learning/src/contracts.js';
import type { ResearchDocument } from '../../engines/evaluation-learning/src/bm25.js';

export const researchSearchRecipe = Object.freeze({ query_by: 'title,text', query_by_weights: '1,1', text_match_type: 'sum_score', num_typos: '0', prefix: 'false', drop_tokens_threshold: '1', per_page: '101', exclude_fields: 'title,text', highlight_fields: 'none' });
/** Isolated public-research generation. No serving/evaluation alias operation is exposed. */
export class ResearchTypesense {
  readonly #transport: TypesenseTransport; readonly #generation: string; #owned = false; #ready = false;
  constructor(origin: string, key: string) {
    this.#transport = new TypesenseTransport({ origin, apiKey: key, namespace: 'nexg_eval' });
    this.#generation = this.#transport.collection(`nexg_eval_g_${randomBytes(16).toString('hex')}`);
  }
  async prepare(documents: readonly ResearchDocument[]): Promise<void> {
    if (this.#owned || !documents.length || new Set(documents.map(row => row.id)).size !== documents.length) throw new EvaluationError('INVALID_RESEARCH_CORPUS');
    const schema = { name: this.#generation, enable_nested_fields: false, fields: [{ name: 'title', type: 'string' }, { name: 'text', type: 'string' }] };
    const created = await this.#transport.request('POST', '/collections', AbortSignal.timeout(5000), { body: schema });
    if (!created || JSON.parse(created).name !== this.#generation) throw new EvaluationError('RESEARCH_CREATE_UNKNOWN');
    this.#owned = true;
    for (let offset = 0; offset < documents.length; offset += 50) {
      const rows = documents.slice(offset, offset + 50);
      const imported = await this.#transport.request('POST', `/collections/${this.#generation}/documents/import?action=create`, AbortSignal.timeout(5000),
        { jsonl: rows.map(row => JSON.stringify(row)).join('\n') });
      const receipts = imported?.trim().split('\n').map(line => JSON.parse(line));
      if (receipts?.length !== rows.length || receipts.some(row => row.success !== true)) throw new EvaluationError('RESEARCH_PARTIAL_IMPORT');
    }
    const actual = await this.#transport.request('GET', `/collections/${this.#generation}`, AbortSignal.timeout(5000));
    if (!actual || JSON.parse(actual).num_documents !== documents.length) throw new EvaluationError('RESEARCH_COUNT_MISMATCH');
    this.#ready = true;
  }
  async search(query: string, excludeId: string): Promise<string[]> {
    if (!this.#ready) throw new EvaluationError('RESEARCH_NOT_READY');
    const params = new URLSearchParams({ ...researchSearchRecipe, q: query });
    const raw = await this.#transport.request('GET', `/collections/${this.#generation}/documents/search?${params}`, AbortSignal.timeout(5000));
    const value = JSON.parse(raw!);
    if (!Array.isArray(value.hits) || value.hits.length > 101 || value.search_cutoff === true || value.hits.some((hit: any) => typeof hit.document?.id !== 'string')) throw new EvaluationError('INVALID_RESEARCH_RESULTS');
    return value.hits.map((hit: any) => hit.document.id as string).filter((id: string) => id !== excludeId).slice(0, 100);
  }
  async close(): Promise<void> {
    if (!this.#owned) return;
    const actual = await this.#transport.request('GET', `/collections/${this.#generation}`, AbortSignal.timeout(5000));
    if (!actual || JSON.parse(actual).name !== this.#generation) throw new EvaluationError('UNSAFE_RESEARCH_CLEANUP');
    this.#ready = false;
    await this.#transport.request('DELETE', `/collections/${this.#generation}`, AbortSignal.timeout(5000)); this.#owned = false;
  }
  fingerprint(): string { return createHash('sha256').update(JSON.stringify(researchSearchRecipe)).digest('hex'); }
}
