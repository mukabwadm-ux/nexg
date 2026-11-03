import { createClient } from './supabase/server';
import {
  ReviewSourceError, ReviewQueueQuery, ReviewQueueWire, ReviewCursor, ReviewDetailWire,
  ReviewMerchantId, reviewRpcError, validateReviewCapture,
  type ApplicationReviewQueueQuery, type ApplicationReviewQueue, type MerchantApplicationReview,
  type ReviewRpcResult,
} from './merchant-application-review-contracts';
export { ReviewSourceError } from './merchant-application-review-contracts';

type ReadPorts = {
  authenticate: (signal: AbortSignal) => Promise<string | null>;
  rpc: (name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<ReviewRpcResult>;
};

/** An abort also fences late results; no source failure becomes an empty queue. */
async function read<T>(ports: ReadPorts, work: (actorId: string, signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ReviewSourceError(504, 'deadline_exceeded', 'The application read timed out. Refresh to try again.'));
    }, 10000);
  });
  try {
    return await Promise.race([(async () => {
      const actorId = await ports.authenticate(controller.signal);
      controller.signal.throwIfAborted();
      if (!actorId) throw new ReviewSourceError(401, 'sign_in_required', 'Sign in with your current staff account.');
      return work(actorId, controller.signal);
    })(), expired]);
  } catch (error) {
    if (error instanceof ReviewSourceError) throw error;
    throw new ReviewSourceError(503, 'review_unavailable', 'The saved application could not be loaded. Refresh or contact support.');
  } finally { clearTimeout(timer!); }
}

export function merchantApplicationReviewReader(ports: ReadPorts) {
  return {
    async queue(input: ApplicationReviewQueueQuery = {}): Promise<ApplicationReviewQueue> {
      let query: ReturnType<typeof ReviewQueueQuery.parse>, cursor: ReturnType<typeof ReviewCursor.parse> | null;
      try {
        query = ReviewQueueQuery.parse(input);
        cursor = query.cursor ? ReviewCursor.parse(JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'))) : null;
      } catch { throw new ReviewSourceError(422, 'invalid_queue', 'The application queue link is invalid. Open Applications again.'); }
      return read(ports, async (actorId, signal) => {
        const result = await ports.rpc('rpc_merchant_application_review_queue', {
          p_state: query.state, p_limit: query.limit,
          p_after_updated_at: cursor?.updated_at ?? null, p_after_merchant_id: cursor?.merchant_id ?? null,
        }, signal);
        signal.throwIfAborted();
        if (result.error) throw reviewRpcError(result.error);
        const wire = ReviewQueueWire.parse(result.data);
        if (wire.items.length > query.limit) throw new Error('Invalid queue bounds.');
        if (wire.next_cursor) {
          const last = wire.items[wire.items.length - 1];
          if (!last || last.updated_at !== wire.next_cursor.updated_at || last.merchant_id !== wire.next_cursor.merchant_id)
            throw new Error('Invalid queue cursor.');
        }
        return {
          actorId,
          items: wire.items.map(item => ({
            merchantId: item.merchant_id, businessName: item.business_name, categoryId: item.category_id,
            subcategories: item.subcategories, revision: item.revision, submittedRevision: item.submitted_revision,
            reviewState: item.review_state, needsResubmission: item.needs_resubmission,
            submittedAt: item.submitted_at, updatedAt: item.updated_at,
          })),
          nextCursor: wire.next_cursor ? Buffer.from(JSON.stringify(wire.next_cursor)).toString('base64url') : null,
        };
      });
    },
    async detail(merchantId: string): Promise<MerchantApplicationReview> {
      if (!ReviewMerchantId.safeParse(merchantId).success) throw new ReviewSourceError(404, 'not_found', 'This application link is invalid.');
      return read(ports, async (actorId, signal) => {
        const result = await ports.rpc('rpc_merchant_application_review_detail', { p_merchant_id: merchantId }, signal);
        signal.throwIfAborted();
        if (result.error) throw reviewRpcError(result.error);
        const wire = ReviewDetailWire.parse(result.data);
        validateReviewCapture(wire.record.payload);
        if (wire.record.merchant_id !== merchantId) throw new Error('Invalid application identity.');
        if (wire.submitted) {
          validateReviewCapture(wire.submitted.payload);
          if (wire.submitted.merchant_id !== merchantId || wire.submitted.revision !== wire.record.review.submitted_revision)
            throw new Error('Invalid submitted snapshot.');
        } else if (wire.record.review.submitted_revision !== null) throw new Error('Missing submitted snapshot.');
        const canReview = wire.record.review.state === 'pending' && wire.submitted?.revision === wire.record.revision
          && !wire.record.review.needs_resubmission;
        if (wire.can_review !== canReview) throw new Error('Invalid decision capability.');
        return { actorId, record: wire.record, submitted: wire.submitted, canReview };
      });
    },
    async managed(merchantId: string) {
      if (!ReviewMerchantId.safeParse(merchantId).success) throw new ReviewSourceError(404, 'not_found', 'This merchant link is invalid.');
      return read(ports, async (_actorId, signal) => {
        const result = await ports.rpc('rpc_merchant_application_review_lookup', { p_merchant_id: merchantId }, signal);
        signal.throwIfAborted();
        if (result.error) throw reviewRpcError(result.error);
        if (typeof result.data !== 'boolean') throw new Error('Invalid application lookup.');
        return result.data;
      });
    },
  };
}

function serverReader() {
  let client: ReturnType<typeof createClient>;
  try { client = createClient(); }
  catch { throw new ReviewSourceError(503, 'review_unavailable', 'Application review is not configured.'); }
  return merchantApplicationReviewReader({
    authenticate: async () => {
      const { data, error } = await client.auth.getUser();
      return !error && data.user && !data.user.is_anonymous ? data.user.id : null;
    },
    rpc: async (name, args, signal) => {
      const rpc = client.rpc as unknown as (name: string, args: Record<string, unknown>) => {
        abortSignal(signal: AbortSignal): PromiseLike<ReviewRpcResult>;
      };
      return await rpc.call(client, name, args).abortSignal(signal);
    },
  });
}
export async function loadMerchantApplicationQueue(query: ApplicationReviewQueueQuery = {}) {
  return serverReader().queue(query);
}
export async function loadMerchantApplicationReview(merchantId: string) {
  return serverReader().detail(merchantId);
}
export async function isManagedMerchantApplication(merchantId: string) {
  return serverReader().managed(merchantId);
}
