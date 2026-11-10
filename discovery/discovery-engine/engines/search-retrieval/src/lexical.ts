import type { QueryPlan, QueryTerm } from '../../query-understanding/src/index.js';
import { textTokens } from '../../query-understanding/src/index.js';

function matches(term: QueryTerm, fields: readonly string[][]): boolean {
  if (!term.phrase) return fields.some(tokens => tokens.includes(term.value));
  const phrase = term.value.split(' ');
  return fields.some(tokens => tokens.some((_token, start) => phrase.every((part, offset) => tokens[start + offset] === part)));
}
export interface LexicalMatch { tier: number; nameMatches: number }
/** AND matching and exclusions run again on current source fields after retrieval.
 * Context text is discovery metadata, never item classification or operating facts.
 */
export function lexicalMatch(plan: QueryPlan, name: string, contexts: readonly string[]): LexicalMatch | undefined {
  const title = textTokens(name); const fields = [title, ...contexts.map(textTokens)];
  if (!plan.terms.length || plan.issues.length || plan.terms.some(term => matches(term, fields) === term.exclude)) return undefined;
  const positive = plan.terms.filter(term => !term.exclude);
  const exact = positive.map(term => term.value).join(' ') === title.join(' ');
  return { tier: exact ? 0 : positive.every(term => matches(term, [title])) ? 1 : 2,
    nameMatches: positive.filter(term => matches(term, [title])).length };
}
