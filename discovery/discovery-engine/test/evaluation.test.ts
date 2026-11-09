import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluate, compare, releaseDecision, Bm25Reference, runWorkload, latencySummary, requestCost } from '../engines/evaluation-learning/src/index.js';
import { readEvaluationFile, writeEvaluationReport } from '../src/evaluation/artifacts.js';
import { release } from './helpers.js';
import { bundleControl, queryControl, sealInput, fullReleaseControl, evidenceControl } from './evaluationControls.js';

const near = (actual: number | null, expected: number) => { assert.equal(typeof actual, 'number'); assert.ok(Math.abs(actual! - expected) < 1e-12, `${actual} != ${expected}`); };

test('graded NEXG gain differs from public linear gain and stable ranking positions determine nDCG', () => {
  const bundle = bundleControl(); const report = evaluate(bundle, release);
  near(report.overall.ndcg10, 0.7098097413968655); near(report.overall.recall100, 1);
  bundle.manifest.track = 'public_research'; bundle.manifest.source.origin = 'public_research'; bundle.manifest.protocol.gain = 'linear';
  near(evaluate(bundle, release).overall.ndcg10, 0.7967075809905066);
});
test('failed judged requests remain zero-score observations; unknown judgments and known empty cases remain distinct', () => {
  const bundle = bundleControl(); bundle.runs[0]!.refs = ['a', 'b'];
  const failed = queryControl('failed'); const unknown = { ...queryControl('unknown'), judgments: [] }; const empty = { ...queryControl('empty'), judgments: [], expectedEmpty: 'known_empty' as const };
  bundle.queries.push(failed, unknown, empty);
  bundle.runs.push({ queryId: 'failed', status: 'failed', refs: [], constraintViolations: 0 }, { queryId: 'unknown', status: 'ok', refs: [], constraintViolations: 0 }, { queryId: 'empty', status: 'ok', refs: [], constraintViolations: 0 });
  const report = evaluate(sealInput(bundle), release);
  near(report.overall.ndcg10, 0.5); assert.equal(report.overall.scored, 2); assert.equal(report.overall.queries, 4); assert.equal(report.overall.failures, 1);
  assert.equal(report.perQuery[2]!.ndcg10, null); assert.equal(report.perQuery[2]!.emptyCorrect, null); assert.equal(report.overall.emptyAccuracy, 1);
});

test('public missing-corpus qrels remain unretrievable positives only under an explicit protocol; NEXG and returned IDs stay strict', () => {
  const bundle = bundleControl(); bundle.manifest.track = 'public_research'; bundle.manifest.source.origin = 'public_research'; bundle.manifest.protocol.gain = 'linear';
  bundle.queries[0]!.judgments.push({ ref: 'official-but-missing', grade: 3, eligible: 'yes' }); bundle.runs[0]!.refs = ['a']; sealInput(bundle);
  assert.throws(() => evaluate(bundle, release), /INVALID_JUDGMENT_REFERENCE/);
  bundle.manifest.protocol.outOfCorpusJudgments = 'retain_unretrievable_public';
  const report = evaluate(bundle, release); near(report.overall.recall100, 1 / 3); assert.equal(report.perQuery[0]!.positiveJudgments, 3); assert.equal(report.overall.outOfCorpusJudgments, 1);
  bundle.runs[0]!.refs = ['official-but-missing']; assert.throws(() => evaluate(bundle, release), /INVALID_QUERY_RUN/);
  bundle.runs[0]!.refs = ['a']; bundle.manifest.track = 'nexg_release'; bundle.manifest.protocol.gain = 'exponential';
  assert.throws(() => evaluate(bundle, release), /INVALID_METRIC_PROTOCOL/);
});
test('ineligible and unknown facts never earn relevance credit; unjudged refs and unreviewed cases are explicit', () => {
  const bundle = bundleControl(); bundle.queries[0]!.judgments[0]!.eligible = 'no'; bundle.runs[0]!.refs = ['a', 'b', 'c'];
  const report = evaluate(sealInput(bundle), release); near(report.overall.ndcg10, 0.6309297535714575);
  assert.equal(report.overall.violations, 1); assert.equal(report.overall.unjudgedReturned, 1);
  bundle.queries[0]!.review = 'unreviewed'; const unreviewed = evaluate(sealInput(bundle), release);
  assert.equal(unreviewed.overall.ndcg10, null); assert.equal(unreviewed.overall.unjudgedReturned, 3);
});
test('every released category/subcategory/option and language remains present even without positive judgments', () => {
  const report = evaluate(bundleControl(), release);
  assert.equal(report.macro.categoriesTotal, 18); assert.equal(report.macro.subcategoriesTotal, 115); assert.equal(report.macro.subcategoriesScored, 1);
  assert.equal(report.slices.length, release.nodes.length + 3);
  const missing = report.slices.find(row => row.id === 'health-pharmacy:hospitals-clinics')!;
  assert.equal(missing.queries, 0); assert.equal(missing.ndcg10, null); assert.equal(report.slices.find(row => row.id === 'sw')!.scored, 0);
});
test('corrupted manifests, duplicate/foreign refs, missing results, impossible empty labels and conflicting selections fail closed', () => {
  assert.equal(evaluate(bundleControl(), release).overall.queries, 1);
  const changes: ((bundle: ReturnType<typeof bundleControl>) => void)[] = [
    bundle => { bundle.manifest.inputSha256 = '0'.repeat(64); }, bundle => { bundle.runs[0]!.refs = ['a', 'a']; },
    bundle => { bundle.runs[0]!.refs = ['foreign']; }, bundle => { bundle.runs = []; },
    bundle => { bundle.queries[0]!.expectedEmpty = 'known_empty'; }, bundle => { bundle.queries[0]!.selection.categoryId = 'beauty-wellness'; },
    bundle => { bundle.queries.push(bundle.queries[0]!); }, bundle => { bundle.runs[0]!.status = 'failed'; },
  ];
  for (const change of changes) { const bundle = bundleControl(); change(bundle); assert.throws(() => evaluate(bundle, release)); }
  const sensitive = { ...bundleControl(), rawQuery: 'private-secret' }; assert.throws(() => evaluate(sensitive, release), /INVALID_EVALUATION/);
});
test('paired cluster bootstrap is deterministic and comparisons reject changed corpus/resource/split/query evidence', () => {
  const candidate = bundleControl(); candidate.runs[0]!.refs = ['a', 'b'];
  const reference = structuredClone(candidate); reference.manifest.system.id = 'reference'; reference.runs[0]!.refs = ['c'];
  const paired = compare(evaluate(candidate, release), evaluate(reference, release));
  assert.deepEqual(paired, { pairedQueries: 1, clusters: 1, absoluteDifference: 1, relativeDifference: null, absoluteCi95: [1, 1], relativeCi95: null });
  reference.manifest.resources.identity = 'different-host'; assert.throws(() => compare(evaluate(candidate, release), evaluate(reference, release)), /UNMATCHED_COMPARISON/);
  reference.manifest.resources.identity = candidate.manifest.resources.identity; reference.manifest.split.kind = 'held_out';
  assert.throws(() => compare(evaluate(candidate, release), evaluate(reference, release)), /UNMATCHED_COMPARISON/);
});
test('absent NEXG judgments/source/prices cannot be promoted by passing routing or public research results', () => {
  const result = releaseDecision(undefined, undefined, release, { routing: evidenceControl(bundleControl()).routing });
  assert.equal(result.recommendation, 'hold'); assert.equal(result.activated, false); assert.equal(result.gates.find(row => row.id === 'source_approval')!.state, 'not_evaluated');
  const bundle = bundleControl(); bundle.manifest.track = 'public_research'; bundle.manifest.source.origin = 'public_research'; bundle.manifest.protocol.gain = 'linear';
  assert.equal(releaseDecision(evaluate(bundle, release), bundle, release, evidenceControl(bundle)).recommendation, 'hold');
});
test('a fully attested control can only recommend review, never activate; failed latency or under-reviewed coverage blocks it', () => {
  const bundle = fullReleaseControl(); const report = evaluate(bundle, release); const evidence = evidenceControl(bundle);
  const result = releaseDecision(report, bundle, release, evidence);
  assert.equal(result.recommendation, 'review_candidate'); assert.equal(result.activated, false); assert.deepEqual(result.blockers, []);
  evidence.performance!.failures = 11; assert.equal(releaseDecision(report, bundle, release, evidence).recommendation, 'reject');
  evidence.performance!.failures = 0; evidence.performance!.p95Ms = 251; assert.equal(releaseDecision(report, bundle, release, evidence).recommendation, 'reject');
  evidence.performance!.p95Ms = 100; bundle.queries[0]!.review = 'unreviewed';
  sealInput(bundle); const missing = releaseDecision(evaluate(bundle, release), bundle, release, evidenceControl(bundle));
  assert.equal(missing.recommendation, 'hold'); assert.equal(missing.gates.find(row => row.id === 'judgment_coverage')!.state, 'not_evaluated');
});
test('tampered reports and negative failure counts cannot bypass release gates', () => {
  const bundle = bundleControl(); const report = evaluate(bundle, release); report.overall.ndcg10 = 1;
  assert.throws(() => releaseDecision(report, bundle, release, evidenceControl(bundle)), /REPORT_EVIDENCE_MISMATCH/);
  const evidence = evidenceControl(bundle); evidence.performance!.failures = -1;
  assert.throws(() => releaseDecision(undefined, undefined, release, evidence), /INVALID_RELEASE_EVIDENCE/);
  assert.equal(releaseDecision(undefined, undefined, release, { routing: evidenceControl(bundle).routing }).activated, false);
});
test('resource and reference release gates require complete pinned evidence rather than positive attestations alone', () => {
  const bundle = fullReleaseControl(); const report = evaluate(bundle, release); const evidence = evidenceControl(bundle);
  const state = (input: typeof evidence, id: string) => releaseDecision(report, bundle, release, input).gates.find(row => row.id === id)!.state;
  assert.equal(state(evidence, 'resource_and_sustained_load'), 'pass'); assert.equal(state(evidence, 'matched_reference_ndcg10'), 'pass');
  const incomplete = structuredClone(evidence); delete incomplete.performance!.resourceIdentity;
  assert.equal(state(incomplete, 'resource_and_sustained_load'), 'not_evaluated');
  const otherHost = structuredClone(evidence); otherHost.performance!.resourceIdentity = 'different-host';
  assert.equal(state(otherHost, 'resource_and_sustained_load'), 'not_evaluated');
  const shortRun = structuredClone(evidence); shortRun.performance!.measuredSeconds = 10; shortRun.performance!.attempts = 100;
  assert.equal(state(shortRun, 'resource_and_sustained_load'), 'not_evaluated');
  const lowerRate = structuredClone(evidence); lowerRate.performance!.rps = 5; lowerRate.performance!.attempts = 300;
  assert.equal(state(lowerRate, 'resource_and_sustained_load'), 'not_evaluated');
  const missingAttempt = structuredClone(evidence); missingAttempt.performance!.attempts = 599;
  assert.equal(state(missingAttempt, 'resource_and_sustained_load'), 'not_evaluated');
  for (const resources of [{ allocationVerified: false }, { cpuCount: 1 }, { memoryGiB: 1 }]) {
    const unsupported = structuredClone(bundle); Object.assign(unsupported.manifest.resources, resources);
    assert.equal(releaseDecision(evaluate(unsupported, release), unsupported, release, evidenceControl(unsupported)).gates.find(row => row.id === 'resource_and_sustained_load')!.state, 'not_evaluated');
  }
  const invalid = structuredClone(evidence); invalid.performance!.measuredSeconds = Number.NaN;
  assert.throws(() => state(invalid, 'resource_and_sustained_load'), /INVALID_RELEASE_EVIDENCE/);
  const missingReference = structuredClone(evidence); delete missingReference.reference!.report;
  assert.equal(state(missingReference, 'matched_reference_ndcg10'), 'not_evaluated');
  const unreviewedReference = structuredClone(evidence); unreviewedReference.reference!.reviewRef = ' ';
  assert.equal(state(unreviewedReference, 'matched_reference_ndcg10'), 'not_evaluated');
  const tamperedReference = structuredClone(evidence); tamperedReference.reference!.report!.overall.ndcg10 = 0.1;
  assert.throws(() => state(tamperedReference, 'matched_reference_ndcg10'), /REFERENCE_EVIDENCE_MISMATCH/);
  const foreignReference = structuredClone(evidence); foreignReference.reference!.bundle!.manifest.resources.identity = 'different-host';
  foreignReference.reference!.report = evaluate(foreignReference.reference!.bundle!, release);
  assert.throws(() => state(foreignReference, 'matched_reference_ndcg10'), /UNMATCHED_COMPARISON/);
});
test('native untuned BM25 preserves source IDs, stable ties and excludes the query itself', () => {
  const reference = new Bm25Reference([{ id: 'a', title: '', text: 'alpha alpha' }, { id: 'b', title: '', text: 'alpha beta' }, { id: 'c', title: '', text: 'gamma' }]);
  assert.deepEqual(reference.search('ＡＬＰＨＡ'), ['a', 'b']); assert.deepEqual(reference.search('alpha', 'a'), ['b']); assert.deepEqual(reference.search('delta'), []);
  assert.throws(() => new Bm25Reference([{ id: 'a', title: '', text: 'alpha' }, { id: 'a', title: '', text: 'beta' }]), /INVALID_RESEARCH_CORPUS/);
});
test('full-attempt latency includes failure tails and cost stays unavailable without actual prices', () => {
  const rows = [10, 20, 1000].map((latencyMs, index) => ({ scheduledMs: index * 100, completedMs: index * 100 + latencyMs, latencyMs, status: index === 2 ? 'failed' as const : 'ok' as const, code: index === 2 ? 'CATALOG_UNAVAILABLE' : 'OK' }));
  const summary = latencySummary(rows, 1000); assert.equal(summary.p95Ms, 1000); assert.equal(summary.p99Ms, 1000); assert.equal(summary.failures, 1); assert.equal(summary.successfulRps, 2);
  assert.equal(requestCost(undefined).state, 'unavailable');
  const cost = requestCost({ seconds: 540, successes: 1200, currency: 'KES', hourlyTotal: 1.2, backgroundTotal: 0.06, quoteRef: 'quote-control' });
  if (cost.state !== 'known') assert.fail(); near(cost.perThousandSuccessful, 0.2);
});
test('open-loop pressure records capacity drops without retrying or hiding scheduled attempts', async () => {
  const rows = await runWorkload({ rps: 2, seconds: 1, maxInflight: 1, request: async () => { await new Promise(resolve => setTimeout(resolve, 650)); return { ok: true, code: 'OK' }; } });
  assert.equal(rows.length, 2); assert.deepEqual(rows.map(row => row.status), ['ok', 'capacity_drop']);
  assert.equal(latencySummary(rows, 1000).failures, 1);
  await assert.rejects(runWorkload({ rps: 11, seconds: 1, maxInflight: 1, request: async () => ({ ok: true, code: 'OK' }) }), /INVALID_WORKLOAD/);
});
test('real local artifact I/O creates new immutable report directories and redacts malformed input', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'nexg-f12-artifacts-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const first = await writeEvaluationReport(directory, { score: 0.5 }); const second = await writeEvaluationReport(directory, { score: 0.25 });
  assert.deepEqual(await readEvaluationFile(first), { score: 0.5 }); assert.deepEqual(await readEvaluationFile(second), { score: 0.25 }); assert.notEqual(first, second);
  const bad = join(directory, 'bad.json'); await writeFile(bad, 'PRIVATE_INPUT_SECRET');
  await assert.rejects(readEvaluationFile(bad), error => error instanceof Error && error.message === 'INVALID_EVALUATION_JSON');
  await mkdir(join(directory, 'not-a-file')); await assert.rejects(readEvaluationFile(join(directory, 'not-a-file')), /UNSAFE_EVALUATION_INPUT/);
});

test('a stalled load port is bounded and reports a client deadline rather than losing an attempt', async () => {
  const rows = await runWorkload({ rps: 1, seconds: 1, maxInflight: 1, request: async () => new Promise<never>(() => {}) });
  assert.equal(rows.length, 1); assert.equal(rows[0]!.status, 'failed'); assert.equal(rows[0]!.code, 'CLIENT_DEADLINE');
});
