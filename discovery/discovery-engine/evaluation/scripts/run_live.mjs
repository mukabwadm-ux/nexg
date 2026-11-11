import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { cpus, totalmem, availableParallelism, platform, release as osRelease } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { BaselineReleaseReader } from '../../dist/src/releases/baselineReleaseReader.js';
import { runWorkload, latencySummary, requestCost, releaseDecision } from '../../dist/engines/evaluation-learning/src/index.js';
import { uuid7 } from '../../dist/src/shared/uuid.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workspace = fileURLToPath(new URL('../../../', import.meta.url));
const output = join(root, 'artifacts/evaluation', `live-${uuid7()}`); await mkdir(output, { recursive: true });
const baseline = await new BaselineReleaseReader(workspace).resolvePublishedRelease();
const hash = value => createHash('sha256').update(value).digest('hex');
async function codeDigest(directory) {
  const rows = [];
  async function walk(path) { for (const item of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const child = join(path, item.name); if (item.isDirectory()) await walk(child); else if (item.name.endsWith('.js')) rows.push([child.slice(root.length).replaceAll('\\', '/'), hash(await readFile(child))]);
  } }
  await walk(directory); rows.push(['evaluation/scripts/run_live.mjs', hash(await readFile(fileURLToPath(import.meta.url)))]);
  return { codeSha256: hash(JSON.stringify(rows)), compiledCode: rows };
}
const hardware = { cpu: cpus()[0]?.model, logicalCpu: cpus().length, availableParallelism: availableParallelism(), hostMemoryGiB: totalmem() / 2 ** 30, platform: platform(), os: osRelease(), runtime: process.version,
  allocationVerified: false, limitations: ['Shared Windows/WSL laptop; no isolated 4-vCPU/8-GiB API+index allocation.', 'API child RSS/CPU sampled; existing source/index resources and monetary cost are not included in those process measurements.'] };
const recipe = { rps: 10, warmupSeconds: 3, measuredSeconds: 10, maxInflight: 16, deadlineMs: 1000, clientDeadlineMs: 2500,
  order: ['restaurant_narrow', 'restaurant_broad', 'areas'], search: false, events: false, retries: 0,
  gate: { maximumErrorRate: 0.01, p95Ms: 250, p99Ms: 750 }, cache: 'no source/result cache; new first-page request IDs' };
const manifest = { schemaVersion: '1', runId: uuid7(), createdAt: new Date().toISOString(), discoveryReleaseId: baseline.releaseId,
  ...await codeDigest(join(root, 'dist')), recipe, hardware, pricing: requestCost(undefined), source: 'actual loopback read API; unversioned/unverified demo projection' };
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
const child = fork(join(root, 'dist/src/evaluation/liveWorker.js'), [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true });
let pending = [];
child.on('message', value => { const waiter = pending.find(item => item.kind === value.kind); if (waiter) { pending = pending.filter(item => item !== waiter); waiter.resolve(value); } });
function waitFor(kind, timeoutMs = 30000) { return new Promise((resolve, reject) => {
  const item = { kind, resolve: value => { clearTimeout(timer); resolve(value); } }; const timer = setTimeout(() => { pending = pending.filter(value => value !== item); reject(new Error('Worker deadline')); }, timeoutMs); pending.push(item);
}); }
let workerFailure = false; child.stderr.on('data', () => { workerFailure = true; });
let report;
try {
  const ready = await waitFor('ready'); const origin = ready.origin;
  async function send(path, body, signal) {
    const response = await fetch(new URL(path, origin), { method: body ? 'POST' : 'GET', signal: AbortSignal.any([AbortSignal.timeout(2500), ...(signal ? [signal] : [])]),
      headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json(); return { response, data };
  }
  const baseRequest = selection => ({ contractVersion: '1', requestId: randomUUID(), discoveryReleaseId: baseline.releaseId, mode: 'merchant', selection, filters: [], sort: 'recommended', limit: 4 });
  const routing = [];
  for (const node of baseline.nodes) {
    const sub = node.kind === 'subcategory' ? node : node.kind === 'option' ? baseline.nodes.find(row => row.id === node.parentId) : undefined;
    const selection = { categoryId: node.kind === 'category' ? node.id : sub.parentId, ...(sub ? { subcategoryId: sub.id } : {}), ...(node.kind === 'option' ? { optionId: node.id } : {}) };
    const { response, data } = await send('/api/discovery/results', { ...baseRequest(selection), filters: [{ kind: 'merchant_open', value: true }] });
    routing.push({ id: node.id, kind: node.kind, mapping: baseline.mappings.find(row => row.nodeId === node.id)?.status ?? 'context', code: data.code, pass: response.status === 422 && data.code === 'UNSUPPORTED_CAPABILITY' });
  }
  const unknown = await send('/api/discovery/results', baseRequest({ categoryId: 'f12-unknown-node' }));
  const clarification = await send('/api/discovery/results', { ...baseRequest({ categoryId: 'restaurants-food' }), query: 'available tonight' });
  child.send('snapshot'); const routingResources = (await waitFor('snapshot')).snapshot;
  const contractGuards = { unknownIdRejected: unknown.response.status === 400 && unknown.data.code === 'INVALID_REQUEST',
    unresolvedConstraintClarifies: clarification.response.status === 422 && clarification.data.code === 'CLARIFICATION_REQUIRED', sourceCalls: routingResources.sourceCalls };
  const workloads = [];
  for (const name of recipe.order) {
    const selection = name === 'restaurant_narrow' ? { categoryId: 'restaurants-food', subcategoryId: 'restaurants-food:restaurant' } : { categoryId: 'restaurants-food' };
    const request = async (_index, signal) => {
      const { response, data } = await send(name === 'areas' ? '/api/discovery/areas' : '/api/discovery/results', name === 'areas' ? undefined : baseRequest(selection), signal);
      const valid = response.ok && (name === 'areas' ? Array.isArray(data.areas) : data.contractVersion === '1' && data.versions?.discoveryRelease === baseline.releaseId && data.refs?.every(ref => ref.kind === 'merchant' && ref.id === ref.merchantId) && data.exposureToken === undefined);
      return { ok: Boolean(valid), code: response.ok ? valid ? 'OK' : 'INVALID_RESPONSE' : typeof data.code === 'string' ? data.code : 'INVALID_ERROR' };
    };
    const warmup = await runWorkload({ rps: recipe.rps, seconds: recipe.warmupSeconds, maxInflight: recipe.maxInflight, request });
    const observations = await runWorkload({ rps: recipe.rps, seconds: recipe.measuredSeconds, maxInflight: recipe.maxInflight, request });
    const summary = latencySummary(observations, recipe.measuredSeconds * 1000);
    workloads.push({ name, selection: name === 'areas' ? null : selection, warmup: latencySummary(warmup, recipe.warmupSeconds * 1000), summary, observations });
    console.log(JSON.stringify({ workload: name, ...summary }));
  }
  child.send('snapshot'); const resources = (await waitFor('snapshot')).snapshot;
  const attempts = workloads.flatMap(row => row.observations); const summary = latencySummary(attempts, recipe.measuredSeconds * recipe.order.length * 1000);
  const evidence = { routing: { testedNodes: routing.filter(row => row.pass).length, releasedNodes: baseline.nodes.length,
    violations: routing.filter(row => !row.pass).length + Number(!contractGuards.unknownIdRejected) + Number(!contractGuards.unresolvedConstraintClarifies) + Number(contractGuards.sourceCalls !== 0) },
    performance: { attempts: summary.attempts, failures: summary.failures, p95Ms: summary.p95Ms, p99Ms: summary.p99Ms, sustained: false, allocationVerified: false } };
  report = { manifest, routing, contractGuards, workloads, summary, resources, releaseDecision: releaseDecision(undefined, undefined, baseline, evidence),
    workerFailure, limitations: ['Short shared-host feasibility, not sustained envelope/capacity certification.', 'No independent NEXG relevance judgments; public research cannot supply them.', 'No customer collection or external sharing enabled.'], result: 'MEASURED' };
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  const committed = { ...report, workloads: workloads.map(({ observations, ...row }) => row), artifact: relative(root, output).replaceAll('\\', '/') };
  await writeFile(join(root, 'docs/verification/v1-evaluation-live.json'), JSON.stringify(committed, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'MEASURED', report: join(output, 'report.json'), recommendation: report.releaseDecision.recommendation, blockers: report.releaseDecision.blockers }));
} finally {
  const closed = waitFor('closed', 5000); child.send('close');
  await closed.catch(() => { child.kill(); });
}
