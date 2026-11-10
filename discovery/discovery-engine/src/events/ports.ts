import type { Schemas } from '../contracts/index.js';

export interface EventPolicy {
  id: string; revision: string; purpose: 'discovery_improvement'; retentionSeconds: number;
  /** The reviewed NexG-owned sink must implement atomic idempotency and scope deletion. */
  sinkId: string; sharing: 'nexg_only';
}
export interface ConsentDecision {
  allowed: boolean; audience: 'production' | 'internal' | 'bot' | 'unknown';
  /** Opaque owner-issued scope, never an email, phone number or browser identifier. */
  scopeId: string; consentRevision: string;
}
/** Adapter to existing authenticated consent/source-classification authority.
 * The anonymous paging cookie is not evidence of consent. Recheck on ingestion,
 * so withdrawal after delivery prevents acceptance of the old token.
 */
export interface InteractionAdmission {
  authorize(input: { caller: string; contextRef: string; refs: readonly Schemas['EngineRef'][]; policy: Readonly<EventPolicy>; signal: AbortSignal }): Promise<ConsentDecision>;
}
export interface Observation {
  specversion: '1.0'; id: string; source: 'urn:nexg:discovery';
  type: 'discovery.result.exposed.v1' | 'discovery.detail.opened.v1'; time: string;
  datacontenttype: 'application/json';
  data: { scope: string; deliveryId: string; ref: Schemas['EngineRef']; position: number;
    policyId: string; policyRevision: string; consentRevision: string;
    versions: Schemas['Versions']; measurement: 'client_reported'; expiresAt: string; exposure?: Schemas['ClientEvent']['exposure'] };
}
export interface ObservationSink {
  readonly id: string;
  readonly guarantees: { atomicIdempotency: true; scopeDeletion: true; retentionEnforced: true; sharing: 'nexg_only' };
  /** Same key and bytes must never append twice, including after timeout/restart. */
  append(key: string, event: Readonly<Observation>, signal: AbortSignal): Promise<'accepted' | 'duplicate'>;
  deleteScope(scope: string, signal: AbortSignal): Promise<void>;
}
export interface EventConfiguration {
  policy: EventPolicy; admission: InteractionAdmission; sink: ObservationSink;
  /** Stable server secret (at least 32 bytes), supplied by the approved storage
   * adapter so scope deletion still works after an engine restart. Never logged. */
  scopeKey: Uint8Array;
}
