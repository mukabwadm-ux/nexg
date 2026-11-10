import { EvaluationError } from './contracts.js';

export interface ResearchDocument { id: string; title: string; text: string }
export const bm25Recipe = Object.freeze({ id: 'native_untuned_bm25_v1', k1: 1.2, b: 0.75, tokenizer: 'NFKC_lowercase_Unicode_letters_numbers', queryTermFrequency: 'binary', stemming: false, stopwords: false });
const tokens = (text: string): string[] => text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** Reproducible untuned lexical smoke reference, not the strongest research baseline.
 * Positive Robertson/Lucene-style IDF: log(1+(N-df+0.5)/(df+0.5)).
 */
export class Bm25Reference {
  readonly #postings = new Map<string, { index: number; tf: number }[]>();
  readonly #lengths: number[] = []; readonly #ids: string[] = []; readonly #average: number;
  constructor(documents: readonly ResearchDocument[]) {
    if (!documents.length || documents.length > 100000) throw new EvaluationError('INVALID_RESEARCH_CORPUS');
    const seen = new Set<string>();
    for (const [index, document] of documents.entries()) {
      if (!document.id || document.id.length > 256 || seen.has(document.id) || typeof document.title !== 'string' || typeof document.text !== 'string') throw new EvaluationError('INVALID_RESEARCH_CORPUS');
      seen.add(document.id); this.#ids.push(document.id);
      const terms = tokens(`${document.title} ${document.text}`); this.#lengths.push(terms.length);
      const frequencies = new Map<string, number>(); for (const term of terms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
      for (const [term, tf] of frequencies) { const rows = this.#postings.get(term) ?? []; rows.push({ index, tf }); this.#postings.set(term, rows); }
    }
    this.#average = this.#lengths.reduce((a, b) => a + b, 0) / documents.length || 1;
  }
  search(query: string, excludeId?: string, limit = 100): string[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000 || typeof query !== 'string' || query.length > 100000) throw new EvaluationError('INVALID_RESEARCH_QUERY');
    const scores = new Map<number, number>(); const { k1, b } = bm25Recipe;
    for (const term of new Set(tokens(query))) {
      const posting = this.#postings.get(term); if (!posting) continue;
      const idf = Math.log(1 + (this.#ids.length - posting.length + 0.5) / (posting.length + 0.5));
      for (const row of posting) {
        if (this.#ids[row.index] === excludeId) continue;
        const score = idf * row.tf * (k1 + 1) / (row.tf + k1 * (1 - b + b * this.#lengths[row.index]! / this.#average));
        scores.set(row.index, (scores.get(row.index) ?? 0) + score);
      }
    }
    return [...scores].sort(([a, left], [b, right]) => right - left || (this.#ids[a]! < this.#ids[b]! ? -1 : this.#ids[a] === this.#ids[b] ? 0 : 1)).slice(0, limit).map(([index]) => this.#ids[index]!);
  }
}
