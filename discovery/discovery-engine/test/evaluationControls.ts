import type { EvaluationBundle, JudgedQuery, ReleaseEvidence } from '../engines/evaluation-learning/src/contracts.js';
import { inputDigest } from '../engines/evaluation-learning/src/validate.js';
import { evaluate } from '../engines/evaluation-learning/src/metrics.js';
import { release } from './helpers.js';

/** Isolated metric/approval controls. Never real inventory, judgments or owner approvals. */
export function queryControl(id = 'q1'): JudgedQuery {
  return { id, familyId: id, language: 'en', selection: { categoryId: 'restaurants-food', subcategoryId: 'restaurants-food:restaurant' }, crossCategory: false,
    expectedEmpty: 'unknown', caseKind: 'relevance', review: 'judged', judgments: [{ ref: 'a', grade: 3, eligible: 'yes' }, { ref: 'b', grade: 1, eligible: 'yes' }] };
}
export function bundleControl(): EvaluationBundle {
  const queries = [queryControl()]; const universe = ['a', 'b', 'c'];
  return { manifest: { schemaVersion: '1', runId: 'control', createdAt: '2026-10-19T17:00:00.000Z', discoveryReleaseId: release.releaseId, track: 'protocol_control',
    source: { origin: 'protocol_control', corpusSha256: '1'.repeat(64), license: 'protocol-only' },
    split: { kind: 'development', familyIsolation: false, independentReview: false },
    protocol: { gain: 'exponential', unjudged: 'zero_gain_unjudged_reported', selfMatch: 'exclude', seed: 20261019, bootstrapSamples: 100 },
    resources: { identity: 'protocol-host', allocationVerified: false, cpuCount: 4, memoryGiB: 8, runtime: 'node-control' },
    system: { id: 'candidate', codeSha256: '2'.repeat(64), configSha256: '3'.repeat(64), tuningTrials: 0, validationOnly: true }, inputSha256: inputDigest({ queries, universe }) },
    universe, queries, runs: [{ queryId: 'q1', status: 'ok', refs: ['b', 'a'], constraintViolations: 0 }] };
}
export function sealInput(bundle: EvaluationBundle): EvaluationBundle { bundle.manifest.inputSha256 = inputDigest(bundle); return bundle; }
export function fullReleaseControl(): EvaluationBundle {
  const bundle = bundleControl(); bundle.queries = [];
  for (const node of release.nodes.filter(row => row.kind === 'subcategory')) for (let index = 0; index < 20; index++) bundle.queries.push({ ...queryControl(`${node.id}/${index}`), selection: { categoryId: node.parentId!, subcategoryId: node.id } });
  for (let index = 0; index < 400; index++) bundle.queries.push({ ...queryControl(`cross/${index}`), selection: {}, crossCategory: true });
  bundle.queries.forEach((query, index) => { query.language = ['en', 'en', 'sw', 'mixed'][index % 4] as JudgedQuery['language']; });
  bundle.runs = bundle.queries.map(query => ({ queryId: query.id, status: 'ok', refs: ['a', 'b'], constraintViolations: 0 }));
  bundle.manifest.track = 'nexg_release'; bundle.manifest.source.origin = 'production_verified'; bundle.manifest.source.snapshotRef = 'owner-control-snapshot'; bundle.manifest.source.approvalRef = 'owner-control-approval';
  bundle.manifest.split = { kind: 'held_out', familyIsolation: true, independentReview: true, reviewerRef: 'reviewer-control' };
  bundle.manifest.resources.allocationVerified = true; return sealInput(bundle);
}
export function evidenceControl(bundle: EvaluationBundle): ReleaseEvidence {
  const reference = structuredClone(bundle); reference.manifest.system.id = `${bundle.manifest.system.id}-reference-control`;
  return { routing: { testedNodes: release.nodes.length, releasedNodes: release.nodes.length, violations: 0 },
    performance: { attempts: 600, failures: 0, p95Ms: 100, p99Ms: 200, sustained: true, allocationVerified: true,
      resourceIdentity: bundle.manifest.resources.identity, rps: 10, measuredSeconds: 60 },
    cost: { currency: 'KES', perThousandSuccessful: 1, quoteRef: 'quote-control' },
    reference: { bundle: reference, report: evaluate(reference, release), strongestReviewed: true, reviewRef: 'strongest-reference-review-control' },
    reviewerRef: 'release-review-control', rollbackRef: 'rollback-control' };
}
