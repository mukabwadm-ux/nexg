import type { ReleaseArtifact } from '../../../src/releases/artifact.js';
import { EvaluationError, type EvaluationBundle, type EvaluationReport, type Gate, type ReleaseEvidence } from './contracts.js';
import { canonicalJson } from '../../../src/shared/immutable.js';
import { evaluate } from './metrics.js';
import { compare } from './comparison.js';

/** Decision support only. No runtime control, index, Studio or deployment import. */
export function releaseDecision(report: EvaluationReport | undefined, bundle: EvaluationBundle | undefined, release: Readonly<ReleaseArtifact>, evidence: ReleaseEvidence) {
  if (![evidence.routing.testedNodes, evidence.routing.releasedNodes, evidence.routing.violations].every(value => Number.isSafeInteger(value) && value >= 0)
    || (evidence.performance && (![evidence.performance.attempts, evidence.performance.failures].every(value => Number.isSafeInteger(value) && value >= 0)
      || evidence.performance.failures > evidence.performance.attempts || ![evidence.performance.p95Ms, evidence.performance.p99Ms].every(value => Number.isFinite(value) && value >= 0)
      || [evidence.performance.rps, evidence.performance.measuredSeconds].some(value => value !== undefined && (!Number.isSafeInteger(value) || value <= 0))))) throw new EvaluationError('INVALID_RELEASE_EVIDENCE');
  const gates: Gate[] = []; const add = (id: string, state: Gate['state'], reason: string) => gates.push({ id, state, reason });
  if (report && (!bundle || canonicalJson(evaluate(bundle, release)) !== canonicalJson(report))) throw new EvaluationError('REPORT_EVIDENCE_MISMATCH');
  const ref = evidence.reference;
  const referenceReport = ref?.bundle && ref.report ? evaluate(ref.bundle, release) : undefined;
  if (referenceReport && canonicalJson(referenceReport) !== canonicalJson(ref!.report)) throw new EvaluationError('REFERENCE_EVIDENCE_MISMATCH');
  if (report && referenceReport) compare(report, referenceReport);
  add('taxonomy_routing', evidence.routing.testedNodes === release.nodes.length && evidence.routing.releasedNodes === release.nodes.length && evidence.routing.violations === 0 ? 'pass' : 'fail', `${evidence.routing.testedNodes}/${release.nodes.length} released nodes; ${evidence.routing.violations} violations`);
  const valid = report && bundle && report.manifest.track === 'nexg_release' && report.manifest.inputSha256 === bundle.manifest.inputSha256;
  add('source_approval', valid && report.manifest.source.origin === 'production_verified' && !!report.manifest.source.snapshotRef && !!report.manifest.source.approvalRef ? 'pass' : 'not_evaluated', 'Requires a source-owner-approved snapshot; demo/research observations cannot certify product release.');
  const reviewed = valid && report.manifest.split.kind === 'held_out' && report.manifest.split.independentReview && !!report.manifest.split.reviewerRef && report.manifest.split.familyIsolation;
  const subs = release.nodes.filter(node => node.kind === 'subcategory');
  const enough = reviewed && subs.every(node => bundle.queries.filter(query => query.selection.subcategoryId === node.id && query.review === 'judged').length >= 20)
    && bundle.queries.filter(query => query.crossCategory && query.review === 'judged').length >= 400
    && bundle.queries.filter(query => query.review === 'judged').length >= subs.length * 20 + 400;
  add('judgment_coverage', enough ? 'pass' : 'not_evaluated', `Requires 20 reviewed held-out requests per ${subs.length} subcategories and 400 cross-category/ambiguous cases; publish missing-positive slices.`);
  add('language_coverage', reviewed && ['en', 'sw', 'mixed'].every(language => bundle.queries.some(query => query.language === language && query.review === 'judged')) ? 'pass' : 'not_evaluated', 'Publish reviewed English, Kiswahili and mixed-language slices and their actual counts; the proposed mix is 50/25/25, not a traffic claim.');
  add('hard_constraints', valid && report.overall.queries ? report.overall.violations === 0 ? 'pass' : 'fail' : 'not_evaluated', 'Zero known violations on the evaluated suite, with its denominator; unknown source facts remain unknown.');
  add('candidate_recall100', reviewed && report.overall.recall100 !== null ? report.overall.recall100 >= 0.9 ? 'pass' : 'fail' : 'not_evaluated', 'Requires judged eligible NEXG recall >=0.90, not ANN or public-dataset recall.');
  const referenceNdcg10 = referenceReport?.overall.ndcg10;
  add('matched_reference_ndcg10', reviewed && report.overall.ndcg10 !== null && ref?.strongestReviewed && typeof ref.reviewRef === 'string' && !!ref.reviewRef.trim()
    && referenceNdcg10 !== undefined && referenceNdcg10 !== null && referenceNdcg10 > 1e-12
    ? report.overall.ndcg10 >= 0.95 * referenceNdcg10 ? 'pass' : 'fail' : 'not_evaluated', 'Requires >=95% of a validated matched NEXG reference with strongest-reference review evidence; a near-zero reference cannot prove this gate.');
  const performance = evidence.performance;
  add('low_cost_latency_errors', performance?.attempts ? performance.failures / performance.attempts <= 0.01 && performance.p95Ms <= 250 && performance.p99Ms <= 750 ? 'pass' : 'fail' : 'not_evaluated', 'Full-attempt p95<=250ms, p99<=750ms and errors<=1%; source timeouts count.');
  add('resource_and_sustained_load', valid && report.manifest.resources.allocationVerified && report.manifest.resources.cpuCount === 4 && report.manifest.resources.memoryGiB === 8
    && performance?.allocationVerified && performance.sustained && performance.resourceIdentity === report.manifest.resources.identity && performance.rps === 10
    && performance.measuredSeconds !== undefined && performance.measuredSeconds >= 60 && performance.attempts === performance.rps * performance.measuredSeconds
    ? 'pass' : 'not_evaluated', 'Requires complete scheduled attempts for >=60 measured seconds at 10 RPS on the evaluated verified 4-vCPU/8-GiB API+index allocation.');
  add('total_cost', evidence.cost && Number.isFinite(evidence.cost.perThousandSuccessful) && evidence.cost.perThousandSuccessful >= 0 && /^[A-Z]{3}$/.test(evidence.cost.currency) && !!evidence.cost.quoteRef ? 'pass' : 'not_evaluated', 'Include compute, index, source reads, storage/network, refresh and amortization; missing prices are not zero.');
  add('review_and_rollback', evidence.reviewerRef && evidence.rollbackRef ? 'pass' : 'not_evaluated', 'An independent release reviewer and verified rollback reference are required; code cannot self-approve.');
  return { schemaVersion: '1' as const, discoveryReleaseId: release.releaseId,
    recommendation: gates.some(gate => gate.state === 'fail') ? 'reject' as const : gates.some(gate => gate.state !== 'pass') ? 'hold' as const : 'review_candidate' as const,
    activated: false as const, gates, blockers: gates.filter(gate => gate.state !== 'pass').map(gate => gate.id),
    deferred: ['live interaction consent/storage connections by owner instruction', 'Q13/Q14 quality models', 'public superiority claims and official submissions'] };
}
