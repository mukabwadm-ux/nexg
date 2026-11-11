import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Schemas } from '../contracts/index.js';
import { parseSchema } from '../contracts/validate.js';
import { ReadServiceError, unsupported } from '../contracts/readErrors.js';
import { canonicalJson, deepFreeze, sha256 } from '../shared/immutable.js';
import { uuid7 } from '../shared/uuid.js';
import type { ReadBudget } from '../orchestrator/readBudget.js';
import type { ConsentDecision, EventConfiguration, Observation } from './ports.js';

interface Delivery { id: string; caller: string; scope: string; consent: string; issued: number; expires: number;
  refs: Schemas['EngineRef'][]; versions: Schemas['Versions'] }
interface Receipt { hash: string; observation: Readonly<Observation>; key: string; accepted: boolean; expires: number }
const refKey = (ref: Schemas['EngineRef']) => canonicalJson(ref);
const validLabel = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_:/.-]{1,128}$/.test(value);

/** Bounded, first-party-only observation path, independent of ranking and outcomes.
 * No token/state is created until trusted consent, audience and sink checks pass.
 * Receipt state survives an ambiguous sink timeout for the remaining token lifetime.
 */
export class InteractionPipeline {
  readonly #secret = randomBytes(32);
  readonly #deliveries = new Map<string, Delivery>();
  readonly #receipts = new Map<string, Receipt>();
  readonly #exposures = new Map<string, { receipt: Receipt; expires: number }>();
  #busy = false; #epoch = 0; #accepted = 0; #duplicates = 0; #rejected = 0;
  readonly config: Readonly<EventConfiguration>;
  constructor(configuration: EventConfiguration, private readonly now = () => Date.now()) {
    const policy = configuration.policy; const guarantees = configuration.sink.guarantees;
    if (!(configuration.scopeKey instanceof Uint8Array) || configuration.scopeKey.length < 32 || configuration.scopeKey.length > 64
      || !validLabel(policy.id) || !validLabel(policy.revision) || !validLabel(policy.sinkId)
      || policy.purpose !== 'discovery_improvement' || policy.sharing !== 'nexg_only'
      || !Number.isSafeInteger(policy.retentionSeconds) || policy.retentionSeconds < 1 || policy.retentionSeconds > 2_592_000
      || configuration.sink.id !== policy.sinkId || guarantees.atomicIdempotency !== true || guarantees.scopeDeletion !== true
      || guarantees.retentionEnforced !== true || guarantees.sharing !== 'nexg_only') throw new Error('Invalid event configuration');
    this.config = { ...configuration, scopeKey: new Uint8Array(configuration.scopeKey), policy: deepFreeze(structuredClone(policy)) };
  }
  #hash(value: string): string { return createHmac('sha256', this.#secret).update(value).digest('hex'); }
  #scope(value: string): string { return createHmac('sha256', this.config.scopeKey).update(`${this.config.policy.id}:${value}`).digest('hex'); }
  #clean(): void {
    const now = this.now();
    for (const [key, value] of this.#deliveries) if (value.expires <= now) this.#deliveries.delete(key);
    for (const [key, value] of this.#receipts) if (value.expires <= now) this.#receipts.delete(key);
    for (const [key, value] of this.#exposures) if (value.expires <= now) this.#exposures.delete(key);
  }
  revoke(): void { this.#epoch++; this.#deliveries.clear(); this.#receipts.clear(); this.#exposures.clear(); }
  stats() { this.#clean(); return { deliveries: this.#deliveries.size, receipts: this.#receipts.size, accepted: this.#accepted, duplicates: this.#duplicates, rejected: this.#rejected }; }
  async #bounded<T>(budget: ReadBudget, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const signal = AbortSignal.any([budget.signal, controller.signal]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Observation deadline')); }, 200); });
    try { return await budget.waitFor(Promise.race([Promise.resolve().then(() => operation(signal)), timeout])); }
    finally { clearTimeout(timer); controller.abort(); }
  }
  async #consent(caller: string, refs: Schemas['EngineRef'][], budget: ReadBudget, contextRef?: string): Promise<ConsentDecision> {
    if (!validLabel(contextRef)) return { allowed: false, audience: 'unknown', scopeId: 'unknown', consentRevision: 'unknown' };
    return this.#bounded(budget, signal => this.config.admission.authorize({ caller, contextRef, refs: structuredClone(refs), policy: this.config.policy, signal }));
  }
  #allowed(value: ConsentDecision): boolean {
    return value.allowed === true && value.audience === 'production' && validLabel(value.scopeId) && validLabel(value.consentRevision);
  }
  async issue(page: Schemas['EnginePage'], caller: string, budget: ReadBudget, contextRef?: string): Promise<Schemas['EnginePage']> {
    const { exposureToken: _previous, ...clean } = page; page = clean;
    if (!page.refs.length) return page;
    this.#clean();
    if (this.#deliveries.size >= 256 || [...this.#deliveries.values()].filter(value => value.caller === caller).length >= 16) return page;
    const epoch = this.#epoch;
    try {
      const consent = await this.#consent(caller, page.refs, budget, contextRef);
      if (!this.#allowed(consent) || epoch !== this.#epoch) return page;
      // Recheck after await: concurrent deliveries cannot overrun either bound.
      if (this.#deliveries.size >= 256 || [...this.#deliveries.values()].filter(value => value.caller === caller).length >= 16) return page;
      const issued = this.now(); const id = uuid7(issued);
      const delivery: Delivery = { id, caller, scope: this.#scope(consent.scopeId), consent: consent.consentRevision, issued, expires: issued + 300_000,
        refs: structuredClone(page.refs), versions: structuredClone(page.versions) };
      this.#deliveries.set(id, delivery);
      return { ...page, exposureToken: `${id}.${this.#hash(`${id}:${caller}:${epoch}`)}` };
    } catch { budget.assertOpen(); return page; } // Measurement failure never fails a valid read.
  }
  #delivery(token: string, caller: string): Delivery | undefined {
    const match = /^([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(token); if (!match) return;
    const expected = Buffer.from(this.#hash(`${match[1]}:${caller}:${this.#epoch}`));
    if (!timingSafeEqual(expected, Buffer.from(match[2]!))) return;
    const delivery = this.#deliveries.get(match[1]!);
    return delivery?.caller === caller && delivery.expires > this.now() ? delivery : undefined;
  }
  async ingest(value: unknown, caller: string, budget: ReadBudget, enabled: () => boolean, contextRef?: string): Promise<Schemas['EventReceipt']> {
    const batch = parseSchema('ClientEvents', value);
    if (!enabled()) throw unsupported('/events');
    if (this.#busy) throw new ReadServiceError('RATE_LIMITED', 429, true, 'wait', [], 1);
    this.#busy = true; this.#clean();
    const receipt = { accepted: 0, duplicates: 0, rejected: 0 };
    const epoch = this.#epoch;
    try {
      for (const event of batch.events) {
        const delivery = this.#delivery(event.exposureToken, caller);
        if (!delivery || event.type === 'handoff_opened' || event.position === undefined
          || !delivery.refs[event.position] || refKey(delivery.refs[event.position]!) !== refKey(event.ref)
          || Date.parse(event.occurredAt) < delivery.issued || Date.parse(event.occurredAt) > this.now() + 5000
          || Date.parse(event.occurredAt) >= delivery.expires) { receipt.rejected++; continue; }
        try {
          const consent = await this.#consent(caller, delivery.refs, budget, contextRef);
          if (!this.#allowed(consent) || this.#scope(consent.scopeId) !== delivery.scope || consent.consentRevision !== delivery.consent
            || epoch !== this.#epoch || !enabled()) { receipt.rejected++; continue; }
          const key = createHmac('sha256', this.config.scopeKey).update(`${this.config.policy.id}:${delivery.scope}:${event.eventId}`).digest('hex');
          const hash = sha256(canonicalJson(event));
          const exposureKey = `${delivery.id}:${event.position}:${event.type}`;
          let prior = this.#receipts.get(key);
          if (prior && prior.hash !== hash) { receipt.rejected++; continue; }
          if (prior?.accepted) { receipt.duplicates++; continue; }
          const exposure = event.type === 'result_exposed' ? this.#exposures.get(exposureKey) : undefined;
          if (exposure) {
            if (!prior && this.#receipts.size >= 4096) { receipt.rejected++; continue; }
            this.#receipts.set(key, { ...exposure.receipt, hash, accepted: true }); receipt.duplicates++; continue;
          }
          if (!prior) {
            if (this.#receipts.size >= 4096 || this.#exposures.size >= 4096) { receipt.rejected++; continue; }
            const observation: Observation = { specversion: '1.0', id: uuid7(this.now()), source: 'urn:nexg:discovery',
              type: event.type === 'result_exposed' ? 'discovery.result.exposed.v1' : 'discovery.detail.opened.v1', time: event.occurredAt, datacontenttype: 'application/json',
              data: { scope: delivery.scope, deliveryId: delivery.id, ref: structuredClone(event.ref), position: event.position,
                policyId: this.config.policy.id, policyRevision: this.config.policy.revision, consentRevision: delivery.consent,
                versions: structuredClone(delivery.versions), measurement: 'client_reported', expiresAt: new Date(this.now() + this.config.policy.retentionSeconds * 1000).toISOString(),
                ...(event.type === 'result_exposed' && event.exposure ? { exposure: structuredClone(event.exposure) } : {}) } };
            prior = { hash, observation: deepFreeze(observation), key, accepted: false, expires: delivery.expires }; this.#receipts.set(key, prior);
          }
          const state = await this.#bounded(budget, signal => this.config.sink.append(prior!.key, prior!.observation, signal));
          if (!['accepted', 'duplicate'].includes(state)) throw new Error('Invalid sink receipt');
          prior.accepted = true;
          if (event.type === 'result_exposed') this.#exposures.set(exposureKey, { receipt: prior, expires: delivery.expires });
          if (state === 'accepted') receipt.accepted++; else receipt.duplicates++;
        } catch { budget.assertOpen(); receipt.rejected++; }
      }
      this.#accepted += receipt.accepted; this.#duplicates += receipt.duplicates; this.#rejected += receipt.rejected;
      return parseSchema('EventReceipt', receipt);
    } finally { this.#busy = false; }
  }
  /** Called by a trusted privacy adapter, never a public client-supplied scope. */
  async deleteScope(ownerScope: string, budget: ReadBudget): Promise<void> {
    if (this.#busy) throw new ReadServiceError('RATE_LIMITED', 429, true, 'wait', [], 1);
    // Prevent a pending admission call from issuing a token after deletion begins.
    this.#epoch++;
    this.#deliveries.clear();
    const scope = this.#scope(ownerScope);
    for (const [key, value] of this.#deliveries) if (value.scope === scope) this.#deliveries.delete(key);
    for (const [key, value] of this.#receipts) if (value.observation.data.scope === scope) this.#receipts.delete(key);
    for (const [key, value] of this.#exposures) if (value.receipt.observation.data.scope === scope) this.#exposures.delete(key);
    await this.#bounded(budget, signal => this.config.sink.deleteScope(scope, signal));
  }
}
