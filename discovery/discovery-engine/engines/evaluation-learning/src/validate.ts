import { Ajv2020 } from 'ajv/dist/2020.js';
import { canonicalJson, sha256 } from '../../../src/shared/immutable.js';
import type { ReleaseArtifact } from '../../../src/releases/artifact.js';
import { EvaluationError, type EvaluationBundle } from './contracts.js';

const text = { type: 'string', minLength: 1, maxLength: 256 };
const digest = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const enumeration = (...values: string[]) => ({ enum: values });
const object = (properties: Record<string, unknown>, optional: string[] = []) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties).filter(key => !optional.includes(key)) });
const integer = (minimum: number, maximum: number) => ({ type: 'integer', minimum, maximum });
const boolean = { type: 'boolean' };
const schema = object({
  manifest: object({ schemaVersion: { const: '1' }, runId: text, createdAt: text, discoveryReleaseId: text,
    track: enumeration('nexg_release', 'public_research', 'protocol_control'),
    source: object({ origin: enumeration('production_verified', 'observed_unverified', 'public_research', 'protocol_control'), corpusSha256: digest,
      license: text, snapshotRef: text, approvalRef: text }, ['snapshotRef', 'approvalRef']),
    split: object({ kind: enumeration('development', 'held_out', 'official_test'), familyIsolation: boolean, independentReview: boolean, reviewerRef: text }, ['reviewerRef']),
    protocol: object({ gain: enumeration('exponential', 'linear'), unjudged: { const: 'zero_gain_unjudged_reported' }, selfMatch: { const: 'exclude' },
      seed: integer(1, 4294967295), bootstrapSamples: integer(100, 10000), outOfCorpusJudgments: { const: 'retain_unretrievable_public' } }, ['outOfCorpusJudgments']),
    resources: object({ identity: text, allocationVerified: boolean, cpuCount: integer(1, 1024), memoryGiB: { type: 'number', exclusiveMinimum: 0, maximum: 65536 }, runtime: text }),
    system: object({ id: text, codeSha256: digest, configSha256: digest, tuningTrials: integer(0, 100000), validationOnly: boolean }), inputSha256: digest }),
  universe: { type: 'array', minItems: 1, maxItems: 100000, items: text, uniqueItems: true },
  queries: { type: 'array', minItems: 1, maxItems: 20000, items: object({ id: text, familyId: text, language: enumeration('en', 'sw', 'mixed'),
    selection: object({ categoryId: text, subcategoryId: text, optionId: text }, ['categoryId', 'subcategoryId', 'optionId']), crossCategory: boolean,
    caseKind: enumeration('relevance', 'routing', 'unknown_fact'), review: enumeration('judged', 'unreviewed'),
    expectedEmpty: enumeration('known_empty', 'unknown'), judgments: { type: 'array', maxItems: 100000, items: object({ ref: text, grade: integer(0, 3), eligible: enumeration('yes', 'no', 'unknown') }) } }) },
  runs: { type: 'array', minItems: 1, maxItems: 20000, items: object({ queryId: text, status: enumeration('ok', 'failed'),
    refs: { type: 'array', maxItems: 1000, items: text, uniqueItems: true }, constraintViolations: integer(0, 1000) }) },
});
const validate = new Ajv2020({ strict: true, allErrors: false }).compile<EvaluationBundle>(schema);
export function inputDigest(value: Pick<EvaluationBundle, 'queries' | 'universe'>): string { return sha256(canonicalJson({ queries: value.queries, universe: value.universe })); }

/** Strict artifact validation, not a source approval or an identity issuer. */
export function parseEvaluation(value: unknown, release: Readonly<ReleaseArtifact>): EvaluationBundle {
  if (!validate(value)) throw new EvaluationError('INVALID_EVALUATION');
  const bundle = value; const manifest = bundle.manifest;
  if (!Number.isFinite(Date.parse(manifest.createdAt)) || manifest.discoveryReleaseId !== release.releaseId || inputDigest(bundle) !== manifest.inputSha256) throw new EvaluationError('EVALUATION_INPUT_MISMATCH');
  if (manifest.track === 'public_research' ? manifest.source.origin !== 'public_research' || manifest.protocol.gain !== 'linear'
    : manifest.protocol.gain !== 'exponential') throw new EvaluationError('INVALID_METRIC_PROTOCOL');
  if (manifest.protocol.outOfCorpusJudgments && manifest.track !== 'public_research') throw new EvaluationError('INVALID_METRIC_PROTOCOL');
  const retainMissing = manifest.protocol.outOfCorpusJudgments === 'retain_unretrievable_public';
  const ids = new Set(bundle.universe); const queries = new Set<string>(); const runs = new Set<string>();
  const nodes = new Map(release.nodes.map(node => [node.id, node]));
  for (const query of bundle.queries) {
    if (queries.has(query.id)) throw new EvaluationError('DUPLICATE_QUERY'); queries.add(query.id);
    const selection = query.selection;
    for (const [key, kind] of [['categoryId', 'category'], ['subcategoryId', 'subcategory'], ['optionId', 'option']] as const) {
      if (selection[key] && nodes.get(selection[key]!)?.kind !== kind) throw new EvaluationError('UNKNOWN_EVALUATION_SELECTION');
    }
    if ((selection.subcategoryId && nodes.get(selection.subcategoryId)?.parentId !== selection.categoryId)
      || (selection.optionId && nodes.get(selection.optionId)?.parentId !== selection.subcategoryId)) throw new EvaluationError('CONFLICTING_EVALUATION_SELECTION');
    const judged = new Set<string>();
    for (const row of query.judgments) {
      if ((!ids.has(row.ref) && !retainMissing) || judged.has(row.ref) || row.ref === query.id) throw new EvaluationError('INVALID_JUDGMENT_REFERENCE'); judged.add(row.ref);
    }
    if (query.expectedEmpty === 'known_empty' && query.judgments.some(row => row.grade > 0 && row.eligible === 'yes')) throw new EvaluationError('CONFLICTING_EMPTY_JUDGMENT');
  }
  for (const run of bundle.runs) {
    if (!queries.has(run.queryId) || runs.has(run.queryId) || (run.status === 'failed' && run.refs.length)
      || run.refs.some(ref => !ids.has(ref) || ref === run.queryId)) throw new EvaluationError('INVALID_QUERY_RUN'); runs.add(run.queryId);
  }
  if (runs.size !== queries.size) throw new EvaluationError('MISSING_QUERY_RUN');
  return structuredClone(bundle);
}
