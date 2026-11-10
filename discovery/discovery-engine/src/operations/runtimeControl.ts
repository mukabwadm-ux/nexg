import { canonicalJson, deepFreeze, sha256 } from '../shared/immutable.js';
import { uuid7 } from '../shared/uuid.js';
import { ReadServiceError } from '../contracts/readErrors.js';

export interface RuntimeFlags { serving: boolean; search: boolean; events: boolean; tracing: boolean; profile: 'low_cost' | 'quality' }
export const operatorReasons = ['initial', 'manual', 'privacy_incident', 'source_incident', 'index_incident', 'latency_regression', 'quality_regression', 'control_invalid'] as const;
export type OperatorReason = typeof operatorReasons[number];
export interface ControlRecord { schemaVersion: '1'; id: string; revision: number; flags: RuntimeFlags; reason: OperatorReason; createdAt: string; checksum: string; rollbackOf?: number }
export class OperatorError extends Error { constructor(readonly code: string) { super(code); } }
export function controlRecord(revision: number, flags: RuntimeFlags, reason: OperatorReason, rollbackOf?: number): ControlRecord {
  const value = { schemaVersion: '1' as const, id: uuid7(), revision, flags: structuredClone(flags), reason, createdAt: new Date().toISOString(), ...(rollbackOf === undefined ? {} : { rollbackOf }) };
  return validateControl({ ...value, checksum: sha256(canonicalJson(value)) });
}
export function validateControl(value: unknown): ControlRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OperatorError('INVALID_CONTROL');
  const item = value as ControlRecord;
  const { checksum, ...content } = item;
  if (Object.keys(item).some(key => !['schemaVersion', 'id', 'revision', 'flags', 'reason', 'createdAt', 'checksum', 'rollbackOf'].includes(key))
    || item.schemaVersion !== '1' || !/^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item.id)
    || !Number.isSafeInteger(item.revision) || item.revision < 0 || !operatorReasons.includes(item.reason)
    || !Number.isFinite(Date.parse(item.createdAt)) || !item.flags || Object.keys(item.flags).sort().join(',') !== 'events,profile,search,serving,tracing'
    || ['serving', 'search', 'events', 'tracing'].some(key => typeof item.flags[key as keyof RuntimeFlags] !== 'boolean')
    || !['low_cost', 'quality'].includes(item.flags.profile) || (item.rollbackOf !== undefined && (!Number.isSafeInteger(item.rollbackOf) || item.rollbackOf < 0 || item.rollbackOf >= item.revision))
    || checksum !== sha256(canonicalJson(content))) throw new OperatorError('INVALID_CONTROL');
  return structuredClone(item);
}

/** Local trusted control plane. No caller-supplied request can choose a profile. */
export class RuntimeController {
  #current: Readonly<ControlRecord>;
  readonly #listeners = new Set<() => void>();
  constructor(readonly ceiling: { search: boolean; events: boolean; quality: boolean }, initial?: ControlRecord) {
    this.#current = deepFreeze(initial ? validateControl(initial) : controlRecord(0, { serving: true, search: ceiling.search, events: ceiling.events, tracing: true, profile: 'low_cost' }, 'initial'));
    this.#validateFlags(this.#current.flags);
  }
  #validateFlags(flags: RuntimeFlags): void {
    if ((flags.search && !this.ceiling.search) || (flags.events && !this.ceiling.events) || (flags.profile === 'quality' && !this.ceiling.quality)) throw new OperatorError('CAPABILITY_NOT_CONFIGURED');
  }
  get snapshot(): Readonly<ControlRecord> { return this.#current; }
  get profileRevision(): string { return `runtime:${this.#current.checksum}`; }
  assertServing(): void { if (!this.#current.flags.serving) throw new ReadServiceError('OWNER_UNAVAILABLE', 503, false, 'owner_support'); }
  apply(value: unknown): boolean {
    const record = validateControl(value);
    if (record.checksum === this.#current.checksum) return false;
    this.#validateFlags(record.flags);
    if (record.revision <= this.#current.revision) throw new OperatorError('STALE_CONTROL');
    this.#current = deepFreeze(record); for (const listener of this.#listeners) listener(); return true;
  }
  trip(): void {
    if (this.#current.reason === 'control_invalid') return;
    this.#current = deepFreeze(controlRecord(this.#current.revision, { ...this.#current.flags, serving: false, events: false, search: false }, 'control_invalid'));
    for (const listener of this.#listeners) listener();
  }
  onChange(listener: () => void): () => void { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }
}
