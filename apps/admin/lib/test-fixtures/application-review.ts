import type { MerchantApplicationCapture } from '@nexg/contracts/merchant-application';
import type { ApplicationReviewRecord } from '../merchant-application-review-contracts';

export const merchantId = '0194b62d-4ff0-7b09-8519-d7597b8312bf';
export const actorId = '0194b62d-4ff0-7b09-8519-d7597b8312be';
export const operationId = '0194b62d-4ff0-7b09-8519-d7597b8312b1';
export const instant = '2026-11-02T09:00:00+00:00';
export function reviewCapture(name = 'Maua Cafe', email = 'amina@example.test'): MerchantApplicationCapture {
  return {
    registryRevision: 'nexg-booking-2026-10-31.1',
    business: { name, firstName: 'Amina', lastName: 'Owino', email, phone: '+254712345678',
      branchCount: 1, registered: true, sameBusinessPhone: true, businessPhone: '', marketing: false },
    categoryId: 'restaurants_food', subcategories: ['cafe'], answersBySubcategory: {}, policies: { terms: true },
  };
}
export function reviewRecord(decision: ApplicationReviewRecord['review']['state'] = 'pending'): ApplicationReviewRecord {
  return {
    merchant_id: merchantId, revision: 1, payload: reviewCapture(),
    review: { state: decision, submitted_revision: 1, submitted_at: instant, needs_resubmission: false, reason: null },
    access: { state: decision, setup: false, operations: decision === 'approved' },
    publication: { status: 'applied', accepting_work: false },
  };
}
export function reviewDetail() {
  return { record: reviewRecord(), submitted: { merchant_id: merchantId, revision: 1, payload: reviewCapture(),
    submitted_at: instant, submitted_by: actorId }, can_review: true };
}
export function queueItem() {
  return { merchant_id: merchantId, business_name: 'Maua Cafe', category_id: 'restaurants_food', subcategories: ['cafe'],
    revision: 1, submitted_revision: 1, review_state: 'pending', needs_resubmission: false,
    submitted_at: instant, updated_at: instant };
}
export function reviewRequest(value: unknown, headers: Record<string, string> = {}, signal?: AbortSignal) {
  return new Request('https://console.test/api/merchant-applications/review', {
    method: 'POST', headers: { origin: 'https://console.test', 'content-type': 'application/json',
      'x-review-actor-id': actorId, ...headers }, body: JSON.stringify(value), signal,
  });
}
export const reviewCommand = () => ({ merchantId, expectedRevision: 1, operationId, decision: 'approved', reason: '' });
