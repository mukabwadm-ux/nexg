import type { ReleaseArtifact } from '../../../src/releases/artifact.js';
import type { AggregateScore, EvaluationBundle, EvaluationReport, JudgedQuery, QueryRun, QueryScore, SliceScore } from './contracts.js';
import { parseEvaluation } from './validate.js';

const mean = (values: readonly (number | null)[]): number | null => { const known = values.filter((value): value is number => value !== null); return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null; };
const dcg = (values: readonly number[], k: number) => values.slice(0, k).reduce((sum, value, index) => sum + value / Math.log2(index + 2), 0);
export function scoreQuery(query: JudgedQuery, run: QueryRun, gain: 'linear' | 'exponential', universe: ReadonlySet<string>): QueryScore {
  const judgments = new Map(query.judgments.map(row => [row.ref, row]));
  const positives = query.review === 'judged' ? query.judgments.filter(row => row.eligible === 'yes' && row.grade > 0) : [];
  const value = (grade: number) => gain === 'linear' ? grade : 2 ** grade - 1;
  const ideal = positives.map(row => value(row.grade)).sort((a, b) => b - a);
  const gains = run.status === 'failed' ? [] : run.refs.map(ref => { const row = judgments.get(ref); return row?.eligible === 'yes' ? value(row.grade) : 0; });
  const at = (k: number) => ideal.length ? dcg(gains, k) / dcg(ideal, k) : null;
  const positiveIds = new Set(positives.map(row => row.ref));
  return { queryId: query.id, familyId: query.familyId, status: run.status, ndcg10: at(10), ndcg20: at(20),
    recall100: positives.length ? run.refs.slice(0, 100).filter(ref => positiveIds.has(ref)).length / positives.length : null,
    positiveJudgments: positives.length, outOfCorpusJudgments: query.judgments.filter(row => !universe.has(row.ref)).length,
    unjudgedReturned: run.refs.filter(ref => query.review !== 'judged' || !judgments.has(ref) || judgments.get(ref)!.eligible === 'unknown').length,
    emptyCorrect: query.review === 'judged' && query.expectedEmpty === 'known_empty' ? run.status === 'ok' && run.refs.length === 0 : null,
    violations: run.constraintViolations + run.refs.filter(ref => judgments.get(ref)?.eligible === 'no').length };
}
export function aggregate(rows: readonly QueryScore[]): AggregateScore {
  const empty = rows.flatMap(row => row.emptyCorrect === null ? [] : [Number(row.emptyCorrect)]);
  return { queries: rows.length, scored: rows.filter(row => row.ndcg10 !== null).length, failures: rows.filter(row => row.status === 'failed').length,
    violations: rows.reduce((sum, row) => sum + row.violations, 0), outOfCorpusJudgments: rows.reduce((sum, row) => sum + row.outOfCorpusJudgments, 0), unjudgedReturned: rows.reduce((sum, row) => sum + row.unjudgedReturned, 0),
    ndcg10: mean(rows.map(row => row.ndcg10)), ndcg20: mean(rows.map(row => row.ndcg20)), recall100: mean(rows.map(row => row.recall100)),
    emptyCases: empty.length, emptyAccuracy: mean(empty) };
}
export function evaluate(value: unknown, release: Readonly<ReleaseArtifact>): EvaluationReport {
  const bundle: EvaluationBundle = parseEvaluation(value, release); const runs = new Map(bundle.runs.map(row => [row.queryId, row]));
  const universe = new Set(bundle.universe);
  const perQuery = bundle.queries.map(query => scoreQuery(query, runs.get(query.id)!, bundle.manifest.protocol.gain, universe));
  const select = (indices: number[]) => aggregate(indices.map(index => perQuery[index]!));
  const slices: SliceScore[] = release.nodes.map(node => ({ id: node.id, kind: node.kind, mapping: release.mappings.find(mapping => mapping.nodeId === node.id)?.status ?? 'context',
    ...select(bundle.queries.flatMap((query, index) => Object.values(query.selection).includes(node.id) ? [index] : [])) }));
  for (const language of ['en', 'sw', 'mixed'] as const) slices.push({ id: language, kind: 'language', mapping: 'not_applicable', ...select(bundle.queries.flatMap((query, index) => query.language === language ? [index] : [])) });
  const categories = slices.filter(row => row.kind === 'category'); const subs = slices.filter(row => row.kind === 'subcategory');
  return { schemaVersion: '1', manifest: bundle.manifest, perQuery, overall: aggregate(perQuery), slices,
    macro: { categoriesScored: categories.filter(row => row.scored).length, categoriesTotal: categories.length, subcategoriesScored: subs.filter(row => row.scored).length,
      subcategoriesTotal: subs.length, categoryNdcg10: mean(categories.map(row => row.ndcg10)), subcategoryNdcg10: mean(subs.map(row => row.ndcg10)) },
    limitations: ['Recall denominator is the declared judged eligible pool, not unjudged catalog inventory.', 'Unjudged results have zero metric gain and are reported; they are not negative learning labels.',
      ...(bundle.manifest.track === 'public_research' ? ['Public lexical research is not NEXG serving-pipeline or marketplace relevance evidence.'] : []),
      ...(bundle.manifest.split.kind === 'development' ? ['Development cases are not held-out release judgments.'] : []),
      ...(!bundle.manifest.resources.allocationVerified ? ['Resource allocation is observational/shared, not a verified matched operating envelope.'] : [])] };
}
