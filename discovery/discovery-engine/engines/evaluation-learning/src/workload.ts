import { EvaluationError } from './contracts.js';

export interface Attempt { scheduledMs: number; completedMs: number; latencyMs: number; status: 'ok' | 'failed' | 'capacity_drop'; code: string }
export function latencySummary(rows: readonly Attempt[], durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0 || rows.some(row => !Number.isFinite(row.latencyMs) || row.latencyMs < 0)) throw new EvaluationError('INVALID_WORKLOAD');
  const sorted = rows.map(row => row.latencyMs).sort((a, b) => a - b);
  const quantile = (p: number) => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]! : null;
  const successes = rows.filter(row => row.status === 'ok').length;
  return { attempts: rows.length, successes, failures: rows.length - successes, errorRate: rows.length ? (rows.length - successes) / rows.length : null,
    p50Ms: quantile(0.5), p95Ms: quantile(0.95), p99Ms: quantile(0.99), successfulRps: successes / (durationMs / 1000),
    codes: Object.fromEntries([...new Set(rows.map(row => row.code))].map(code => [code, rows.filter(row => row.code === code).length])) };
}
/** Open-loop arrivals include scheduling lag and client-capacity drops. No retry. */
export async function runWorkload(options: { rps: number; seconds: number; maxInflight: number; request(index: number, signal: AbortSignal): Promise<{ ok: boolean; code: string }> }): Promise<Attempt[]> {
  if (!Number.isSafeInteger(options.rps) || options.rps < 1 || options.rps > 10 || !Number.isSafeInteger(options.seconds) || options.seconds < 1 || options.seconds > 60
    || !Number.isSafeInteger(options.maxInflight) || options.maxInflight < 1 || options.maxInflight > 16) throw new EvaluationError('INVALID_WORKLOAD');
  const start = performance.now(); const rows: Attempt[] = []; const jobs: Promise<void>[] = []; let active = 0;
  for (let index = 0; index < options.rps * options.seconds; index++) {
    const scheduledMs = index * 1000 / options.rps;
    await new Promise(resolve => setTimeout(resolve, Math.max(0, start + scheduledMs - performance.now())));
    // A timer can fire a fraction of a millisecond before performance.now() reaches its due time. An arrival is
    // never recorded before it was scheduled; otherwise its latency comes out negative and the summary rejects it.
    while (performance.now() - start < scheduledMs) await new Promise(resolve => setTimeout(resolve, 1));
    if (active >= options.maxInflight) { const completedMs = performance.now() - start; rows.push({ scheduledMs, completedMs, latencyMs: completedMs - scheduledMs, status: 'capacity_drop', code: 'CLIENT_CAPACITY_DROP' }); continue; }
    active++;
    jobs.push((async () => {
      let result: { ok: boolean; code: string };
      const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<{ ok: boolean; code: string }>(resolve => { timer = setTimeout(() => { controller.abort(); resolve({ ok: false, code: 'CLIENT_DEADLINE' }); }, 2500); });
        result = await Promise.race([Promise.resolve().then(() => options.request(index, controller.signal)), timeout]);
        if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(result.code) || typeof result.ok !== 'boolean') result = { ok: false, code: 'INVALID_RESULT' };
      } catch { result = { ok: false, code: 'TRANSPORT_FAILURE' }; }
      finally { clearTimeout(timer); controller.abort(); active--; }
      const completedMs = performance.now() - start;
      rows.push({ scheduledMs, completedMs, latencyMs: completedMs - scheduledMs, status: result.ok ? 'ok' : 'failed', code: result.code });
    })());
  }
  await Promise.all(jobs); return rows.sort((a, b) => a.scheduledMs - b.scheduledMs);
}
export function requestCost(input: { seconds: number; successes: number; currency: string; hourlyTotal: number; backgroundTotal: number; quoteRef: string } | undefined) {
  if (!input) return { state: 'unavailable' as const, reason: 'No complete priced allocation/source/storage/refresh manifest.' };
  if (!Number.isFinite(input.seconds) || input.seconds <= 0 || !Number.isSafeInteger(input.successes) || input.successes < 1 || !/^[A-Z]{3}$/.test(input.currency)
    || ![input.hourlyTotal, input.backgroundTotal].every(value => Number.isFinite(value) && value >= 0) || !input.quoteRef) throw new EvaluationError('INVALID_COST_INPUT');
  const total = input.hourlyTotal * input.seconds / 3600 + input.backgroundTotal;
  return { state: 'known' as const, currency: input.currency, total, perThousandSuccessful: total * 1000 / input.successes, quoteRef: input.quoteRef };
}
