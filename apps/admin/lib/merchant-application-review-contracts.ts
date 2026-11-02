import { z } from 'zod';
import { BOOKING_REGISTRY_REVISION, validateBookingAnswer } from '@nexg/booking-config';
import { listOnboardingCategories, resolveOnboardingSelection } from '@nexg/booking-config/onboarding';
import { MerchantApplicationCapture, MerchantApplicationRecord } from '@nexg/contracts/merchant-application';

const Id = z.string().uuid();
const Revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const Instant = z.string().datetime({ offset: true });
export const ReviewState = z.enum(['draft', 'pending', 'changes_requested', 'approved', 'rejected']);
export type ReviewState = z.infer<typeof ReviewState>;
export const ApplicationReviewCommand = z.object({
  merchantId: Id, expectedRevision: Revision, operationId: Id,
  decision: z.enum(['approved', 'changes_requested', 'rejected']),
  reason: z.string().trim().max(2000).default(''),
}).strict().superRefine((command, context) => {
  if (command.decision !== 'approved' && !command.reason)
    context.addIssue({ code: 'custom', path: ['reason'], message: 'Explain the requested changes or rejection.' });
});
export type ApplicationReviewCommand = z.infer<typeof ApplicationReviewCommand>;
export const ApplicationReviewRecord = MerchantApplicationRecord.extend({
  review: MerchantApplicationRecord.shape.review.extend({ reason: z.string().max(2000).nullable() }),
});
export type ApplicationReviewRecord = z.infer<typeof ApplicationReviewRecord>;
export const SubmittedApplicationSnapshot = z.object({
  merchant_id: Id, revision: Revision, payload: MerchantApplicationCapture,
  submitted_at: Instant, submitted_by: Id,
}).strict();
export type SubmittedApplicationSnapshot = z.infer<typeof SubmittedApplicationSnapshot>;
export interface ApplicationReviewSummary {
  merchantId: string; businessName: string; categoryId: string | null; subcategories: string[];
  revision: number; submittedRevision: number | null; reviewState: ReviewState;
  needsResubmission: boolean; submittedAt: string | null; updatedAt: string;
}
export type ApplicationReviewQueueQuery = { cursor?: string; state?: ReviewState | 'all'; limit?: number };
export type ApplicationReviewQueue = { actorId: string; items: ApplicationReviewSummary[]; nextCursor: string | null };
export type MerchantApplicationReview = { actorId: string; record: ApplicationReviewRecord; submitted: SubmittedApplicationSnapshot | null; canReview: boolean };

export const ReviewQueueWire = z.object({
  items: z.array(z.object({
    merchant_id: Id, business_name: z.string().max(200), category_id: z.string().nullable(),
    subcategories: z.array(z.string()).max(128), revision: Revision, submitted_revision: Revision.nullable(),
    review_state: ReviewState, needs_resubmission: z.boolean(), submitted_at: Instant.nullable(), updated_at: Instant,
  }).strict()).max(50),
  next_cursor: z.object({ updated_at: Instant, merchant_id: Id }).strict().nullable(),
}).strict();
export const ReviewDetailWire = z.object({
  record: ApplicationReviewRecord, submitted: SubmittedApplicationSnapshot.nullable(), can_review: z.boolean(),
}).strict();
export const ReviewCursor = z.object({ updated_at: Instant, merchant_id: Id }).strict();
export const ReviewQueueQuery = z.object({
  cursor: z.string().min(1).max(1024).regex(/^[A-Za-z0-9_-]+$/).optional(),
  state: z.union([ReviewState, z.literal('all')]).default('pending'),
  limit: z.number().int().min(1).max(50).default(25),
}).strict();
export const ReviewMerchantId = Id;

const scopeParents = new Map(listOnboardingCategories().flatMap(category =>
  category.subcategories.map(subcategory => [subcategory.id, category.id] as const)));
/** Validate retained scopes against the shared registry without inventing missing setup. */
export function validateReviewCapture(capture: MerchantApplicationCapture) {
  if (capture.registryRevision !== BOOKING_REGISTRY_REVISION) throw new Error('Unsupported application registry.');
  for (const [subcategory, answers] of Object.entries(capture.answersBySubcategory)) {
    const category = scopeParents.get(subcategory);
    if (!category) throw new Error('Unknown application scope.');
    const selection = resolveOnboardingSelection(category, [subcategory]);
    const questions = selection.profiles[0]?.sourceQuestionIds ?? [];
    if (selection.issues.length || Object.entries(answers).some(([id, value]) =>
      !questions.includes(id) || (value !== null && !validateBookingAnswer(id, value).valid)))
      throw new Error('Invalid application answers.');
  }
}

export class ReviewSourceError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message); this.name = 'ReviewSourceError';
  }
}
export type ReviewRpcResult = { data: unknown; error: null | { code?: string; message?: string; hint?: string } };
export function reviewRpcError(error: NonNullable<ReviewRpcResult['error']>) {
  if (['42501', '28000'].includes(error.code ?? '')) return new ReviewSourceError(403, 'access_denied', 'Your current session or staff grant cannot review this application. Sign in again or contact your administrator.');
  if (error.code === 'P0002') return new ReviewSourceError(404, 'not_found', 'This application is unavailable or no longer exists.');
  if (['40001', '23505'].includes(error.code ?? '')) return new ReviewSourceError(409, 'revision_conflict', 'The application changed or this operation ID was used differently. Reload before making a decision.');
  if (['22023', '23514'].includes(error.code ?? '')) return new ReviewSourceError(422, 'invalid_review', 'This revision cannot receive that decision. Reload and check the submitted application.');
  if (error.code === 'P4290') return new ReviewSourceError(429, 'rate_limited', 'Too many review requests. Wait before explicitly retrying the same operation.');
  return new ReviewSourceError(503, 'review_unavailable', 'Application review is temporarily unavailable. No decision has been confirmed.');
}
