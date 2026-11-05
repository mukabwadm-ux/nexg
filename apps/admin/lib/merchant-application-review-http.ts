import { randomUUID } from 'node:crypto';
import {
  ApplicationReviewCommand,
  ApplicationReviewRecord,
  ReviewMerchantId,
  ReviewSourceError,
  reviewRpcError,
  validateReviewCapture,
  type ReviewRpcResult,
} from './merchant-application-review-contracts';

export interface ReviewTransportPorts {
  authenticate: (signal: AbortSignal) => Promise<string | null>;
  rpc: (
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ) => Promise<ReviewRpcResult>;
}
const BODY_LIMIT = 12 * 1024;
const DEADLINE_MS = 10000;

export function merchantApplicationReviewHandler(ports: ReviewTransportPorts) {
  return async function handle(request: Request) {
    const requestId = ReviewMerchantId.safeParse(request.headers.get('x-request-id')).success
      ? request.headers.get('x-request-id')!
      : randomUUID();
    const headers: Record<string, string> = {
      'cache-control': 'private, no-store',
      'x-request-id': requestId,
      'x-content-type-options': 'nosniff',
      vary: 'Cookie, Origin',
    };
    const problem = (error: ReviewSourceError, extra: Record<string, string> = {}) =>
      Response.json(
        {
          type: `urn:nexg:application-review:${error.code}`,
          title: 'Application review could not be completed',
          status: error.status,
          detail: error.message,
          request_id: requestId,
        },
        {
          status: error.status,
          headers: { ...headers, ...extra, 'content-type': 'application/problem+json' },
        },
      );
    const controller = new AbortController();
    const timeout = new ReviewSourceError(
      504,
      'deadline_exceeded',
      'The decision outcome is unknown. Reload or explicitly retry with the same operation ID.',
    );
    const cancelled = new ReviewSourceError(
      408,
      'request_cancelled',
      'The review request was cancelled. Its outcome is unknown. Reload before deciding again.',
    );
    const timer = setTimeout(() => controller.abort(timeout), DEADLINE_MS);
    const cancel = () => controller.abort(cancelled);
    request.signal.addEventListener('abort', cancel, { once: true });
    if (request.signal.aborted) cancel();
    const bounded = async <T>(work: () => Promise<T>): Promise<T> => {
      controller.signal.throwIfAborted();
      let abort: () => void = () => {};
      const aborted = new Promise<never>((_, reject) => {
        abort = () => reject(controller.signal.reason);
        controller.signal.addEventListener('abort', abort, { once: true });
      });
      try {
        return await Promise.race([work(), aborted]);
      } finally {
        controller.signal.removeEventListener('abort', abort);
      }
    };
    try {
      if (request.method !== 'POST')
        return problem(
          new ReviewSourceError(405, 'method_not_allowed', 'Use POST for an application review.'),
          { allow: 'POST' },
        );
      if (request.headers.get('origin') !== new URL(request.url).origin)
        return problem(
          new ReviewSourceError(
            403,
            'origin_rejected',
            'Open this decision from the admin console.',
          ),
        );
      if (
        request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
        'application/json'
      )
        return problem(
          new ReviewSourceError(
            415,
            'unsupported_media_type',
            'Use application/json for this decision.',
          ),
        );
      if (request.headers.has('content-encoding'))
        return problem(
          new ReviewSourceError(
            415,
            'unsupported_encoding',
            'Compressed review requests are not supported.',
          ),
        );
      const length = request.headers.get('content-length');
      if (length && (!/^\d+$/.test(length) || Number(length) > BODY_LIMIT))
        return problem(
          new ReviewSourceError(413, 'payload_too_large', 'The review request is too large.'),
        );
      const actorId = await bounded(() => ports.authenticate(controller.signal));
      if (!actorId)
        return problem(
          new ReviewSourceError(
            401,
            'sign_in_required',
            'Sign in with your current staff account.',
          ),
        );
      const expectedActor = request.headers.get('x-review-actor-id');
      if (!ReviewMerchantId.safeParse(expectedActor).success || expectedActor !== actorId)
        return problem(
          new ReviewSourceError(
            403,
            'actor_changed',
            'The signed-in account changed. Reload the application before making a decision.',
          ),
        );

      const input = await bounded(async () => {
        const reader = request.body?.getReader();
        if (!reader)
          throw new ReviewSourceError(400, 'invalid_request', 'A JSON decision is required.');
        const chunks: Uint8Array[] = [];
        let size = 0;
        const stop = () => {
          void reader.cancel().catch(() => {});
        };
        controller.signal.addEventListener('abort', stop, { once: true });
        try {
          for (;;) {
            const next = await reader.read();
            controller.signal.throwIfAborted();
            if (next.done) break;
            size += next.value.byteLength;
            if (size > BODY_LIMIT) {
              await reader.cancel();
              throw new ReviewSourceError(
                413,
                'payload_too_large',
                'The review request is too large.',
              );
            }
            chunks.push(next.value);
          }
          let value: unknown;
          try {
            value = JSON.parse(
              new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
            );
          } catch {
            throw new ReviewSourceError(
              400,
              'invalid_json',
              'The review request is not valid JSON.',
            );
          }
          const parsed = ApplicationReviewCommand.safeParse(value);
          if (!parsed.success)
            throw new ReviewSourceError(
              422,
              'invalid_request',
              'Check the application, submitted revision, decision and reason.',
            );
          return parsed.data;
        } finally {
          controller.signal.removeEventListener('abort', stop);
          reader.releaseLock();
        }
      });
      const result = await bounded(() =>
        ports.rpc(
          'rpc_merchant_application_review',
          {
            p_merchant_id: input.merchantId,
            p_expected_revision: input.expectedRevision,
            p_operation_id: input.operationId,
            p_decision: input.decision,
            p_reason: input.reason || null,
          },
          controller.signal,
        ),
      );
      controller.signal.throwIfAborted();
      if (result.error) {
        const error = reviewRpcError(result.error);
        const seconds = /^\d+$/.test(result.error.hint ?? '') ? Number(result.error.hint) : 0;
        return problem(
          error,
          error.status === 429 && Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 86400
            ? { 'retry-after': String(seconds) }
            : {},
        );
      }
      const record = ApplicationReviewRecord.parse(result.data);
      validateReviewCapture(record.payload);
      if (
        record.merchant_id !== input.merchantId ||
        record.revision !== input.expectedRevision ||
        record.review.submitted_revision !== input.expectedRevision ||
        record.review.state !== input.decision ||
        record.operation_id !== input.operationId
      )
        throw new Error('Invalid review response.');
      return Response.json(record, { headers });
    } catch (error) {
      return problem(
        error instanceof ReviewSourceError
          ? error
          : new ReviewSourceError(
              503,
              'review_unavailable',
              'No decision has been confirmed. Reload or explicitly retry with the same operation ID.',
            ),
      );
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener('abort', cancel);
    }
  };
}
