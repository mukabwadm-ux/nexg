import { randomBytes } from 'node:crypto';
import { sha256 } from '../shared/immutable.js';

export type Stage = 'query.understand' | 'retrieval' | 'ranking' | 'collections.compose' | 'source.read' | 'events.ingest';
export type Route = 'results' | 'collections' | 'merchant' | 'areas' | 'health' | 'release' | 'capabilities' | 'events' | 'other';
interface Span { traceId: string; spanId: string; parentSpanId?: string; name: string; kind: number;
  startTimeUnixNano: string; endTimeUnixNano: string; attributes: { key: string; value: { stringValue: string } }[]; status: { code: number } }
export interface SpanExporter { export(spans: readonly Span[], signal: AbortSignal): Promise<number> }
export function routeName(path: string): Route {
  const clean = path.split('?')[0];
  if (clean?.startsWith('/api/discovery/merchants/')) return 'merchant';
  const tail = clean?.slice('/api/discovery/'.length);
  return ['results', 'collections', 'areas', 'health', 'release', 'capabilities', 'events'].includes(tail ?? '') ? tail as Route : 'other';
}
const buckets = [5, 20, 50, 100, 250, 500, 1000, Infinity];
const stages: readonly Stage[] = ['query.understand', 'retrieval', 'ranking', 'collections.compose', 'source.read', 'events.ingest'];

/** One bounded aggregate per fixed route, never per caller/category/query/URL. */
export class SafeTelemetry {
  readonly #metrics = new Map<Route, { count: number; errors: number; milliseconds: number; histogram: number[]; sourceCalls: number; underfilled: number; results: number; candidates: number }>();
  readonly #queue: Span[] = [];
  #running: Promise<void> | undefined; #closed = false;
  #exported = 0; #dropped = 0; #failures = 0;
  constructor(private readonly exporter?: SpanExporter) {}
  start(route: Route, enabled = true): TraceScope { return new TraceScope(this, routeName(`/api/discovery/${route === 'merchant' ? 'merchants/_' : route}`), enabled); }
  record(route: Route, ms: number, status: number, calls: number, underfilled: boolean, results: number, candidates: number): void {
    let metric = this.#metrics.get(route);
    if (!metric) { metric = { count: 0, errors: 0, milliseconds: 0, histogram: buckets.map(() => 0), sourceCalls: 0, underfilled: 0, results: 0, candidates: 0 }; this.#metrics.set(route, metric); }
    metric.count++; metric.errors += Number(status >= 400); metric.milliseconds += ms; metric.sourceCalls += calls; metric.underfilled += Number(underfilled);
    metric.results += results; metric.candidates += candidates;
    metric.histogram[buckets.findIndex(value => ms <= value)]!++;
  }
  enqueue(spans: readonly Span[]): void {
    if (!this.exporter || this.#closed) return;
    for (const span of spans) { if (this.#queue.length < 256) this.#queue.push(span); else this.#dropped++; }
    if (!this.#running) this.#running = this.#drain().finally(() => { this.#running = undefined; });
  }
  async #drain(): Promise<void> {
    while (this.#queue.length) {
      const batch = this.#queue.splice(0, 32); const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Export deadline')); }, 200); });
        const accepted = await Promise.race([this.exporter!.export(batch, controller.signal), timeout]);
        if (!Number.isSafeInteger(accepted) || accepted < 0 || accepted > batch.length) throw new Error('Invalid export receipt');
        this.#exported += accepted; this.#dropped += batch.length - accepted;
      } catch { this.#failures++; this.#dropped += batch.length; }
      finally { clearTimeout(timer); controller.abort(); }
    }
  }
  snapshot() { return { routes: Object.fromEntries([...this.#metrics].map(([key, value]) => [key, structuredClone(value)])),
    export: { queued: this.#queue.length, exported: this.#exported, dropped: this.#dropped, failures: this.#failures } }; }
  async flush(): Promise<void> { await this.#running; }
  async close(): Promise<void> { this.#closed = true; this.#dropped += this.#queue.length; this.#queue.length = 0; await this.#running; }
}

export class TraceScope {
  readonly traceId = randomBytes(16).toString('hex'); readonly #root = randomBytes(8).toString('hex');
  readonly #started = performance.now(); readonly #epoch = BigInt(Date.now()) * 1_000_000n;
  readonly #spans: Span[] = []; #finished = false; #underfilled = false; #version: string | undefined; #results = 0; #candidates = 0;
  constructor(private readonly telemetry: SafeTelemetry, private readonly route: Route, private readonly enabled: boolean) {}
  #time(at: number): string { return (this.#epoch + BigInt(Math.max(0, Math.round((at - this.#started) * 1_000_000)))).toString(); }
  /** Hash even approved version labels: arbitrary runtime strings never become telemetry. */
  version(value: string): void { this.#version = sha256(value); }
  underfilled(value: boolean): void { this.#underfilled ||= value; }
  resultCounts(results: number, candidates: number): void {
    if (Number.isSafeInteger(results) && results >= 0 && results <= 48) this.#results += results;
    if (Number.isSafeInteger(candidates) && candidates >= 0 && candidates <= 48) this.#candidates += candidates;
  }
  begin(stage: Stage): (failed?: boolean) => void {
    const start = performance.now(); let done = false;
    return (failed = false) => {
      if (done || this.#finished || !this.enabled || !stages.includes(stage) || this.#spans.length >= 48) return; done = true;
      this.#spans.push({ traceId: this.traceId, spanId: randomBytes(8).toString('hex'), parentSpanId: this.#root, name: stage, kind: 1,
        startTimeUnixNano: this.#time(start), endTimeUnixNano: this.#time(performance.now()), attributes: [], status: { code: failed ? 2 : 1 } });
    };
  }
  sync<T>(stage: Stage, operation: () => T): T { const end = this.begin(stage); try { const value = operation(); end(); return value; } catch (error) { end(true); throw error; } }
  async run<T>(stage: Stage, operation: () => Promise<T>): Promise<T> { const end = this.begin(stage); try { const value = await operation(); end(); return value; } catch (error) { end(true); throw error; } }
  finish(status: number, calls: number): void {
    if (this.#finished) return; this.#finished = true; const end = performance.now();
    this.telemetry.record(this.route, end - this.#started, status, calls, this.#underfilled, this.#results, this.#candidates);
    if (!this.enabled) return;
    this.#spans.push({ traceId: this.traceId, spanId: this.#root, name: `discovery.${this.route}`, kind: 2,
      startTimeUnixNano: this.#time(this.#started), endTimeUnixNano: this.#time(end),
      attributes: this.#version ? [{ key: 'nexg.version.digest', value: { stringValue: this.#version } }] : [], status: { code: status >= 400 ? 2 : 1 } });
    this.telemetry.enqueue(this.#spans);
  }
}
