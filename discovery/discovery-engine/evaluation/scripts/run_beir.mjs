import { readFile, writeFile, readdir, mkdir, lstat, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve, relative } from 'node:path';
import { cpus, totalmem, platform, release as osRelease } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { BaselineReleaseReader } from '../../dist/src/releases/baselineReleaseReader.js';
import { uuid7 } from '../../dist/src/shared/uuid.js';
import { canonicalJson } from '../../dist/src/shared/immutable.js';
import { ResearchTypesense, researchSearchRecipe } from '../../dist/src/evaluation/researchTypesense.js';
import { Bm25Reference, bm25Recipe, inputDigest, parseEvaluation, evaluate, compare } from '../../dist/engines/evaluation-learning/src/index.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workspace = fileURLToPath(new URL('../../../', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const supplied = process.argv[2]; if (!supplied) throw new Error('Use prepared.json path');
const path = resolve(supplied); const directory = resolve(path, '..');
if (!relative(join(root, 'artifacts/evaluation'), path) || relative(join(root, 'artifacts/evaluation'), path).startsWith('..') || (await lstat(path)).isSymbolicLink() || resolve(await realpath(path)) !== path) throw new Error('Unsafe prepared input');
const preparation = JSON.parse(await readFile(path, 'utf8'));
if (preparation.schemaVersion !== '1' || preparation.datasets.map(row => row.name).join(',') !== 'scifact,nfcorpus,arguana') throw new Error('Unregistered public datasets');
const release = await new BaselineReleaseReader(workspace).resolvePublishedRelease();
const runId = uuid7(); const output = join(root, 'artifacts/evaluation', `beir-run-${runId}`); await mkdir(output);
const key = (await readFile(join(root, 'artifacts/local/typesense.key'), 'utf8')).trim();
const image = spawnSync('docker', ['inspect', 'nexg-discovery-search-typesense-1', '--format', '{{.Image}}'], { encoding: 'utf8', windowsHide: true });
if (image.status !== 0 || !/^sha256:[a-f0-9]{64}$/.test(image.stdout.trim())) throw new Error('Unpinned Typesense image');
const resources = { identity: sha(canonicalJson({ cpu: cpus()[0]?.model, cpus: cpus().length, ram: totalmem(), os: osRelease(), typesenseImage: image.stdout.trim() })), allocationVerified: false,
  cpuCount: cpus().length, memoryGiB: totalmem() / 2 ** 30, runtime: `${process.version}/${platform()}` };
const compiled = [];
async function fingerprint(path) { for (const item of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
  const file = join(path, item.name); if (item.isDirectory()) await fingerprint(file); else if (item.name.endsWith('.js')) compiled.push([file.slice(root.length).replaceAll('\\', '/'), sha(await readFile(file))]);
} }
await fingerprint(join(root, 'dist')); compiled.push(['evaluation/scripts/run_beir.mjs', sha(await readFile(fileURLToPath(import.meta.url)))]);
const codeSha256 = sha(canonicalJson(compiled));
const preregistration = { schemaVersion: '1', runId, createdAt: new Date().toISOString(), preparationSha256: sha(await readFile(path)), codeSha256,
  compiledCode: compiled,
  resources, typesenseImage: image.stdout.trim(), recipes: { bm25: bm25Recipe, typesense: researchSearchRecipe }, seed: 20261019, bootstrapSamples: 1000,
  outOfCorpusJudgments: 'retain_unretrievable_public',
  scope: 'Three English official-test lexical smoke comparisons. No tuning, models, NEXG relevance or superiority claim.' };
await writeFile(join(output, 'manifest.json'), JSON.stringify(preregistration, null, 2) + '\n', { flag: 'wx' });
const summaries = [];
for (const entry of preparation.datasets) {
  const loaded = {};
  for (const name of ['corpus.jsonl', 'queries.jsonl', 'qrels/test.tsv']) {
    const file = join(directory, entry.name, name); const bytes = await readFile(file);
    if (sha(bytes) !== entry.files[name].sha256) throw new Error('Public input hash mismatch'); loaded[name] = bytes.toString('utf8');
  }
  const documents = loaded['corpus.jsonl'].trim().split('\n').map(line => { const row = JSON.parse(line); return { id: row._id, title: row.title ?? '', text: row.text }; });
  const queryText = new Map(loaded['queries.jsonl'].trim().split('\n').map(line => { const row = JSON.parse(line); return [row._id, row.text]; }));
  const qrels = new Map();
  for (const row of loaded['qrels/test.tsv'].trim().split('\n').slice(1)) {
    const [queryId, docId, grade] = row.trim().split('\t'); if (queryId === docId) continue;
    const values = qrels.get(queryId) ?? []; values.push({ ref: docId, grade: Number(grade), eligible: 'yes' }); qrels.set(queryId, values);
  }
  const queries = [...qrels].map(([id, judgments]) => ({ id, familyId: id, language: 'en', selection: {}, crossCategory: false, expectedEmpty: 'unknown', caseKind: 'relevance', review: 'judged', judgments }));
  if (queries.some(query => !queryText.has(query.id))) throw new Error('Official test query missing');
  const universe = documents.map(row => row.id);
  const shared = { schemaVersion: '1', runId, createdAt: preregistration.createdAt, discoveryReleaseId: release.releaseId, track: 'public_research',
    source: { origin: 'public_research', corpusSha256: entry.files['corpus.jsonl'].sha256, license: entry.license },
    split: { kind: 'official_test', familyIsolation: false, independentReview: true, reviewerRef: `official_beir_qrels:${entry.files['qrels/test.tsv'].sha256}` },
    protocol: { gain: 'linear', unjudged: 'zero_gain_unjudged_reported', selfMatch: 'exclude', seed: 20261019, bootstrapSamples: 1000, outOfCorpusJudgments: 'retain_unretrievable_public' },
    resources, inputSha256: inputDigest({ universe, queries }) };
  parseEvaluation({ manifest: { ...shared, system: { id: 'preflight', codeSha256, configSha256: sha(canonicalJson(bm25Recipe)), tuningTrials: 0, validationOnly: true } },
    universe, queries, runs: queries.map(query => ({ queryId: query.id, status: 'failed', refs: [], constraintViolations: 0 })) }, release);
  const nativeStart = performance.now(); const reference = new Bm25Reference(documents); const nativeBuildMs = performance.now() - nativeStart;
  const research = new ResearchTypesense('http://127.0.0.1:8108', key);
  const rows = {}; const times = {}; let importMs = 0;
  try {
    const imported = performance.now(); await research.prepare(documents); importMs = performance.now() - imported;
    for (const system of ['native_untuned_bm25_v1', 'typesense_30_2_lexical']) {
      const results = []; const observations = [];
      for (const [index, query] of queries.entries()) {
        const start = performance.now(); let refs = []; let status = 'ok'; let code = 'OK';
        try { refs = system.startsWith('native') ? reference.search(queryText.get(query.id), query.id) : await research.search(queryText.get(query.id), query.id); }
        catch { status = 'failed'; code = 'RETRIEVAL_FAILURE'; }
        results.push({ queryId: query.id, status, refs, constraintViolations: 0 }); observations.push({ queryId: query.id, milliseconds: performance.now() - start, code });
        if ((index + 1) % 100 === 0) console.log(JSON.stringify({ dataset: entry.name, system, completed: index + 1, total: queries.length }));
      }
      rows[system] = results; times[system] = observations;
      await writeFile(join(output, `${entry.name}-${system}-ranked-runs.json`), JSON.stringify({ results, observations }) + '\n', { flag: 'wx' });
    }
  } finally { await research.close(); }
  const reports = {}; const artifactHashes = {};
  for (const system of Object.keys(rows)) {
    const manifest = { ...shared, system: { id: system, codeSha256, configSha256: sha(canonicalJson(system.startsWith('native') ? bm25Recipe : researchSearchRecipe)), tuningTrials: 0, validationOnly: true } };
    const bundle = { manifest, universe, queries, runs: rows[system] };
    reports[system] = evaluate(bundle, release);
    const bundleBytes = JSON.stringify(bundle) + '\n'; const reportBytes = JSON.stringify(reports[system], null, 2) + '\n';
    await writeFile(join(output, `${entry.name}-${system}-bundle.json`), bundleBytes, { flag: 'wx' });
    await writeFile(join(output, `${entry.name}-${system}-report.json`), reportBytes, { flag: 'wx' });
    artifactHashes[system] = { bundleSha256: sha(bundleBytes), reportSha256: sha(reportBytes) };
  }
  const paired = compare(reports.typesense_30_2_lexical, reports.native_untuned_bm25_v1);
  const summary = { dataset: entry.name, corpus: documents.length, queries: queries.length, source: entry, nativeBuildMs, typesenseImportMs: importMs,
    systems: Object.fromEntries(Object.entries(reports).map(([name, report]) => [name, report.overall])), paired, artifactHashes,
    limitations: ['Untuned lexical references; strongest tuned baseline and hybrid models not reproduced.', 'Public research retrieval, not the NEXG serving pipeline or marketplace relevance.', 'Shared host; not a certified matched operating allocation or official submission.'] };
  await writeFile(join(output, `${entry.name}-observations.json`), JSON.stringify(times, null, 2) + '\n', { flag: 'wx' });
  summaries.push(summary); console.log(JSON.stringify({ result: 'SCORED', dataset: entry.name, corpus: documents.length, queries: queries.length, systems: summary.systems }));
}
const report = { result: 'SCORED', preregistration, preparation, datasets: summaries, artifact: relative(root, output).replaceAll('\\', '/'), activated: false };
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
await writeFile(join(root, 'docs/verification/v1-evaluation-public.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ result: 'SCORED', report: join(output, 'report.json'), datasets: summaries.length }));
