import { ContractError, type EngineError } from './index.js';

/** Safe transport error. Never put upstream messages, URLs or payloads in it. */
export class ReadServiceError extends Error {
  constructor(
    public readonly code: EngineError['code'],
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly recovery: EngineError['recovery'],
    public readonly fieldPaths: readonly string[] = [],
    public readonly retryAfter?: number,
    public readonly clarification?: EngineError['clarification'],
  ) { super(code); this.name = 'ReadServiceError'; }
}

export const sourceUnavailable = (retryable = true): ReadServiceError => new ReadServiceError('CATALOG_UNAVAILABLE', 503, retryable, retryable ? 'retry_read' : 'owner_support');
export const unsupported = (path: string): ReadServiceError => new ReadServiceError('UNSUPPORTED_CAPABILITY', 422, false, 'correct_request', [path]);

export function safeError(error: unknown, requestId: string): { status: number; body: EngineError; retryAfter?: number } {
  let failure: ReadServiceError;
  if (error instanceof ReadServiceError) failure = error;
  else if (error instanceof ContractError) {
    const conflict = ['RELEASE_INCOMPATIBLE', 'CURSOR_EXPIRED', 'CURSOR_RESTART_REQUIRED'].includes(error.code);
    failure = new ReadServiceError(error.code, conflict ? 409 : error.code === 'CONSTRAINT_CONFLICT' ? 422 : 400, false,
      conflict ? 'restart_preserving_constraints' : 'correct_request', error.fieldPaths);
  } else {
    const code = (error && typeof error === 'object' && 'code' in error) ? error.code : undefined;
    const status = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
    failure = code === 'FST_ERR_CTP_BODY_TOO_LARGE' || status === 413 ? new ReadServiceError('LIMIT_EXCEEDED', 422, false, 'correct_request', ['/'])
      : status === 400 || ['FST_ERR_CTP_INVALID_JSON_BODY', 'FST_ERR_CTP_EMPTY_JSON_BODY', 'FST_ERR_CTP_INVALID_MEDIA_TYPE', 'FST_ERR_BAD_URL'].includes(String(code))
        ? new ReadServiceError('INVALID_REQUEST', 400, false, 'correct_request', ['/'])
        : new ReadServiceError('OWNER_UNAVAILABLE', 503, false, 'owner_support');
  }
  return { status: failure.status, body: { contractVersion: '1', requestId, code: failure.code, retryable: failure.retryable,
    recovery: failure.recovery, fieldPaths: [...failure.fieldPaths].slice(0, 30),
    ...(failure.clarification ? { clarification: failure.clarification } : {}) }, ...(failure.retryAfter === undefined ? {} : { retryAfter: failure.retryAfter }) };
}
