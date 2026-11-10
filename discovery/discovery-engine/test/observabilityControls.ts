import type { EventConfiguration, Observation, ObservationSink } from '../src/events/ports.js';
import { canonicalJson } from '../src/shared/immutable.js';

/** Protocol-only storage/consent controls. Never imported by a serving module. */
export class ObservationControlSink implements ObservationSink {
  readonly id = 'test:nexg-owned';
  readonly guarantees = { atomicIdempotency: true, scopeDeletion: true, retentionEnforced: true, sharing: 'nexg_only' } as const;
  readonly rows = new Map<string, Observation>();
  constructor(private readonly now = () => Date.now()) {}
  #expire() { for (const [key, row] of this.rows) if (Date.parse(row.data.expiresAt) <= this.now()) this.rows.delete(key); }
  async append(key: string, row: Readonly<Observation>, signal: AbortSignal): Promise<'accepted' | 'duplicate'> {
    signal.throwIfAborted(); this.#expire();
    const prior = this.rows.get(key);
    if (prior) { if (canonicalJson(prior) !== canonicalJson(row)) throw new Error('Idempotency conflict'); return 'duplicate'; }
    this.rows.set(key, structuredClone(row)); return 'accepted';
  }
  async deleteScope(scope: string, signal: AbortSignal): Promise<void> { signal.throwIfAborted(); this.#expire(); for (const [key, row] of this.rows) if (row.data.scope === scope) this.rows.delete(key); }
}
export function eventControl(sink = new ObservationControlSink()) {
  const decision = { allowed: true, audience: 'production' as 'production' | 'internal' | 'bot' | 'unknown', scopeId: 'owner:opaque-control', consentRevision: 'consent:1' };
  const config: EventConfiguration = { policy: { id: 'policy:control', revision: '1', purpose: 'discovery_improvement', retentionSeconds: 60,
    sinkId: sink.id, sharing: 'nexg_only' }, admission: { async authorize(input) { return { ...decision, allowed: decision.allowed && input.contextRef === 'verified:control' }; } }, sink, scopeKey: new Uint8Array(32).fill(42) };
  const context = { async resolve() { return 'verified:control'; } };
  return { config, sink, decision, context };
}
