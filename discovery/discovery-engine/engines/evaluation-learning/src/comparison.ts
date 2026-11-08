import { canonicalJson } from '../../../src/shared/immutable.js';
import { EvaluationError, type EvaluationReport } from './contracts.js';

/** Pair complete query families; do not bootstrap correlated variants as independent requests. */
export function compare(candidate: EvaluationReport, reference: EvaluationReport) {
  const key = (report: EvaluationReport) => {
    const m = report.manifest;
    return canonicalJson({ track: m.track, release: m.discoveryReleaseId, source: m.source, split: m.split, protocol: m.protocol, resources: m.resources,
      input: m.inputSha256, tuningTrials: m.system.tuningTrials, validationOnly: m.system.validationOnly });
  };
  if (key(candidate) !== key(reference) || candidate.manifest.system.id === reference.manifest.system.id) throw new EvaluationError('UNMATCHED_COMPARISON');
  const baseline = new Map(reference.perQuery.map(row => [row.queryId, row]));
  if (baseline.size !== candidate.perQuery.length) throw new EvaluationError('UNMATCHED_QUERY_SET');
  const clusters = new Map<string, { candidate: number; reference: number }[]>();
  for (const row of candidate.perQuery) {
    const prior = baseline.get(row.queryId);
    if (!prior || prior.familyId !== row.familyId || (prior.ndcg10 === null) !== (row.ndcg10 === null)) throw new EvaluationError('UNMATCHED_QUERY_SET');
    if (row.ndcg10 === null || prior.ndcg10 === null) continue;
    const values = clusters.get(row.familyId) ?? []; values.push({ candidate: row.ndcg10, reference: prior.ndcg10 }); clusters.set(row.familyId, values);
  }
  const values = [...clusters.values()]; let seed = candidate.manifest.protocol.seed >>> 0;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const difference = (rows: { candidate: number; reference: number }[]) => {
    const sum = rows.reduce((state, row) => ({ candidate: state.candidate + row.candidate, reference: state.reference + row.reference }), { candidate: 0, reference: 0 });
    return { absolute: (sum.candidate - sum.reference) / rows.length, relative: sum.reference > 1e-12 ? (sum.candidate - sum.reference) / sum.reference : null };
  };
  if (!values.length) return { pairedQueries: 0, clusters: 0, absoluteDifference: null, relativeDifference: null, absoluteCi95: null, relativeCi95: null };
  const draws: ReturnType<typeof difference>[] = [];
  for (let sample = 0; sample < candidate.manifest.protocol.bootstrapSamples; sample++) {
    const rows = Array.from({ length: values.length }, () => values[Math.floor(random() * values.length)]!).flat(); draws.push(difference(rows));
  }
  const interval = (rows: number[]): [number, number] | null => { rows.sort((a, b) => a - b); return rows.length ? [rows[Math.floor(rows.length * 0.025)]!, rows[Math.min(rows.length - 1, Math.floor(rows.length * 0.975))]!] : null; };
  const point = difference(values.flat());
  return { pairedQueries: values.flat().length, clusters: values.length, absoluteDifference: point.absolute, relativeDifference: point.relative,
    absoluteCi95: interval(draws.map(row => row.absolute)), relativeCi95: draws.every(row => row.relative !== null) ? interval(draws.map(row => row.relative!)) : null };
}
