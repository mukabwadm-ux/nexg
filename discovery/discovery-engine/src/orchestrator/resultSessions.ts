import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { EngineRequest, Schemas } from '../contracts/index.js';
import { ReadServiceError } from '../contracts/readErrors.js';
import { canonicalJson, sha256 } from '../shared/immutable.js';

type Session = Readonly<{
  id: string; caller: string; binding: string; created: number; refs: readonly string[];
  versions: Schemas['Versions']; candidateCount: number; unmapped: boolean; bytes: number; retrievalSnapshot?: string;
}>;
export interface SessionLimits { maxSessions?: number; maxPerCaller?: number; maxBytes?: number; now?: () => number }
export const restartPaging = (code: 'CURSOR_EXPIRED' | 'CURSOR_RESTART_REQUIRED' = 'CURSOR_RESTART_REQUIRED') =>
  new ReadServiceError(code, 409, false, 'restart_preserving_constraints', ['/cursor', '/offset']);

/** Process-local order bookkeeping, never an inventory cache. Every page needs a
 * fresh source read. Tokens contain only a random ID, position and signature.
 */
export class ResultSessions {
  readonly #secret = randomBytes(32);
  readonly #sessions = new Map<string, Session>();
  readonly #now: () => number;
  readonly #limits: { maxSessions: number; maxPerCaller: number; maxBytes: number };
  #bytes = 0; #evictions = 0;
  constructor(options: SessionLimits = {}) {
    this.#now = options.now ?? (() => performance.now());
    this.#limits = { maxSessions: options.maxSessions ?? 128, maxPerCaller: options.maxPerCaller ?? 8, maxBytes: options.maxBytes ?? 8 * 1024 * 1024 };
    if (Object.values(this.#limits).some(value => !Number.isSafeInteger(value) || value < 1)
      || this.#limits.maxSessions > 128 || this.#limits.maxPerCaller > 8 || this.#limits.maxBytes > 8 * 1024 * 1024) throw new Error('Invalid session limits');
  }
  binding(request: EngineRequest, normalizedQuery?: string): string {
    const { requestId: _id, cursor: _cursor, offset: _offset, ...semantic } = request;
    return sha256(canonicalJson({ ...semantic, ...(normalizedQuery === undefined ? {} : { query: normalizedQuery }) }));
  }
  #remove(id: string, evicted = false): void {
    const value = this.#sessions.get(id); if (!value) return;
    this.#sessions.delete(id); this.#bytes -= value.bytes; if (evicted) this.#evictions++;
  }
  #prune(): void {
    for (const value of this.#sessions.values()) if (this.#now() - value.created >= 300_000) this.#remove(value.id);
  }
  #signature(value: string): string { return createHmac('sha256', this.#secret).update(value).digest('base64url'); }
  cursor(session: Session, offset: number): string {
    const value = `${session.id}.${offset}`; return `${value}.${this.#signature(value)}`;
  }
  resolve(request: EngineRequest, caller: string, binding: string): { session: Session; offset: number } | undefined {
    if (request.cursor) {
      const match = /^([a-f0-9-]{36})\.(0|[1-9][0-9]?)\.([A-Za-z0-9_-]{43})$/.exec(request.cursor);
      if (!match) throw restartPaging();
      const value = `${match[1]}.${match[2]}`; const expected = Buffer.from(this.#signature(value)); const actual = Buffer.from(match[3]!);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw restartPaging();
      const session = this.#sessions.get(match[1]!); const offset = Number(match[2]);
      if (!session || session.caller !== caller || session.binding !== binding) throw restartPaging();
      if (this.#now() - session.created >= 300_000) { this.#remove(session.id); throw restartPaging('CURSOR_EXPIRED'); }
      if (offset >= Math.max(1, session.refs.length) || offset % request.limit !== 0) throw restartPaging();
      return { session, offset };
    }
    this.#prune();
    // Offset compatibility reconstructs only an already observed caller window.
    if (request.offset !== undefined) {
      const session = [...this.#sessions.values()].reverse().find(value => value.caller === caller && value.binding === binding);
      if (session) {
        if (request.offset >= Math.max(1, session.refs.length) || request.offset % request.limit !== 0) throw restartPaging();
        return { session, offset: request.offset };
      }
      if (request.offset > 0) throw restartPaging();
    }
    return undefined;
  }
  create(caller: string, binding: string, refs: readonly string[], versions: Schemas['Versions'], candidateCount: number, unmapped: boolean, retrievalSnapshot?: string): Session {
    this.#prune();
    if (refs.length > 48 || new Set(refs).size !== refs.length) throw restartPaging();
    const state = { id: randomUUID(), caller, binding, refs: [...refs], versions: structuredClone(versions), candidateCount, unmapped, created: this.#now(), ...(retrievalSnapshot ? { retrievalSnapshot } : {}) };
    const session: Session = { ...state, bytes: Buffer.byteLength(JSON.stringify(state)) };
    if (session.bytes > this.#limits.maxBytes) throw new ReadServiceError('LIMIT_EXCEEDED', 422, false, 'correct_request');
    for (const existing of this.#sessions.values()) {
      if ([...this.#sessions.values()].filter(value => value.caller === caller).length < this.#limits.maxPerCaller) break;
      if (existing.caller === caller) this.#remove(existing.id, true);
    }
    while (this.#sessions.size >= this.#limits.maxSessions || this.#bytes + session.bytes > this.#limits.maxBytes) this.#remove(this.#sessions.keys().next().value!, true);
    this.#sessions.set(session.id, session); this.#bytes += session.bytes; return session;
  }
  assertVersions(session: Session, versions: Schemas['Versions'], retrievalSnapshot?: string): void {
    if (canonicalJson(session.versions) !== canonicalJson(versions) || session.retrievalSnapshot !== retrievalSnapshot) throw restartPaging();
  }
  clear(): void { this.#sessions.clear(); this.#bytes = 0; }
  stats() { this.#prune(); return { sessions: this.#sessions.size, bytes: this.#bytes, evictions: this.#evictions }; }
}
