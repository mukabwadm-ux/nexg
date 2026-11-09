import { ReadServiceError, sourceUnavailable } from '../contracts/readErrors.js';
import type { TraceScope } from '../observability/telemetry.js';

export interface ReadBudgetOptions { timeoutMs?: number; maxCalls?: number; maxDetails?: number; concurrency?: number; signal?: AbortSignal; trace?: TraceScope }
export interface ReadBudgetSnapshot { calls: number; uniqueDetails: number; maxObservedConcurrency: number }

/** One instance per engine request, shared by every nested provider read. */
export class ReadBudget {
  readonly #controller = new AbortController();
  readonly #aborted: Promise<never>;
  readonly #timer: ReturnType<typeof setTimeout>;
  readonly #waiting: (() => void)[] = [];
  readonly #memo = new Map<string, Promise<unknown>>();
  readonly #details = new Set<string>();
  readonly #maxCalls: number; readonly #maxDetails: number; readonly #concurrency: number;
  readonly #deadline: number;
  #reserved = 0; #calls = 0; #active = 0; #peak = 0;
  readonly #externalAbort: () => void;
  constructor(private readonly options: ReadBudgetOptions = {}) {
    const timeout = options.timeoutMs ?? 1000;
    this.#maxCalls = options.maxCalls ?? 16; this.#maxDetails = options.maxDetails ?? 8; this.#concurrency = options.concurrency ?? 4;
    for (const [value, maximum] of [[timeout, 1000], [this.#maxCalls, 16], [this.#maxDetails, 8], [this.#concurrency, 4]]) {
      if (!Number.isSafeInteger(value) || value! < 1 || value! > maximum!) throw new Error('Invalid read budget');
    }
    this.#deadline = performance.now() + timeout;
    this.#aborted = new Promise<never>((_resolve, reject) => this.signal.addEventListener('abort', () => { this.#waiting.length = 0; reject(this.signal.reason); }, { once: true }));
    void this.#aborted.catch(() => {});
    this.#externalAbort = () => this.cancel();
    options.signal?.addEventListener('abort', this.#externalAbort, { once: true });
    this.#timer = setTimeout(() => this.cancel(), timeout);
    if (options.signal?.aborted) this.cancel();
  }
  get signal(): AbortSignal { return this.#controller.signal; }
  get trace(): TraceScope | undefined { return this.options.trace; }
  get snapshot(): ReadBudgetSnapshot { return { calls: this.#calls, uniqueDetails: this.#details.size, maxObservedConcurrency: this.#peak }; }
  /** Also check monotonic time after synchronous parsing/validation work. */
  assertOpen(): void {
    if (performance.now() >= this.#deadline) this.cancel();
    if (this.signal.aborted) throw this.signal.reason;
  }
  cancel(reason: ReadServiceError = sourceUnavailable()): void { this.#controller.abort(reason); }
  dispose(): void { clearTimeout(this.#timer); this.options.signal?.removeEventListener('abort', this.#externalAbort); this.cancel(); this.#memo.clear(); }
  memo<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const prior = this.#memo.get(key); if (prior) return prior as Promise<T>;
    const value = operation(); this.#memo.set(key, value); return value;
  }
  /** Bound application-port work without charging another source-call slot. */
  async waitFor<T>(operation: Promise<T>): Promise<T> {
    // A deadline may already have elapsed when an async port returns a rejected
    // promise. Observe it even when the precheck wins, avoiding an orphan rejection.
    void operation.catch(() => {});
    this.assertOpen(); const value = await Promise.race([operation, this.#aborted]); this.assertOpen(); return value;
  }
  async #takeSlot(): Promise<void> {
    this.assertOpen();
    if (this.#active < this.#concurrency) { this.#active++; this.#peak = Math.max(this.#peak, this.#active); return; }
    await Promise.race([new Promise<void>(resolve => this.#waiting.push(() => { this.#active++; this.#peak = Math.max(this.#peak, this.#active); resolve(); })), this.#aborted]);
  }
  async run<T>(operation: (signal: AbortSignal) => Promise<T>, detailId?: string): Promise<T> {
    this.assertOpen();
    if (this.#reserved >= this.#maxCalls || (detailId && !this.#details.has(detailId) && this.#details.size >= this.#maxDetails)) {
      throw new ReadServiceError('LIMIT_EXCEEDED', 422, false, 'none');
    }
    this.#reserved++; if (detailId) this.#details.add(detailId);
    await this.#takeSlot();
    try {
      this.assertOpen();
      this.#calls++;
      const execute = () => Promise.race([Promise.resolve().then(() => operation(this.signal)), this.#aborted]);
      const value = await (this.trace ? this.trace.run('source.read', execute) : execute());
      this.assertOpen(); return value;
    } finally { this.#active--; if (!this.signal.aborted) this.#waiting.shift()?.(); }
  }
}
