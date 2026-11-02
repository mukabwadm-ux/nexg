import { afterEach, describe, expect, it, vi } from 'vitest';
import { merchantApplicationReviewReader } from './merchant-application-review';
import { actorId, instant, merchantId, operationId, queueItem, reviewDetail } from './test-fixtures/application-review';

vi.mock('./supabase/server', () => ({ createClient: vi.fn() }));
afterEach(() => vi.useRealTimers());
const reader = (data: unknown, overrides: Record<string, unknown> = {}) => merchantApplicationReviewReader({
  authenticate: async () => actorId, rpc: async () => ({ data, error: null }), ...overrides,
});

describe('staff application review reads', () => {
  it('returns bounded queue rows and carries the exact last-row cursor into the next read', async () => {
    const rpc = vi.fn(async () => ({ data: { items: [queueItem()], next_cursor: { updated_at: instant, merchant_id: merchantId } }, error: null }));
    const source = reader(null, { rpc });
    const page = await source.queue({ limit: 1 });
    expect(page).toMatchObject({ actorId, items: [{ merchantId, businessName: 'Maua Cafe', categoryId: 'restaurants_food',
      subcategories: ['cafe'], revision: 1, submittedRevision: 1, reviewState: 'pending', needsResubmission: false }] });
    await source.queue({ limit: 1, cursor: page.nextCursor! });
    expect(rpc).toHaveBeenLastCalledWith('rpc_merchant_application_review_queue', { p_state: 'pending', p_limit: 1,
      p_after_updated_at: instant, p_after_merchant_id: merchantId }, expect.any(AbortSignal));
  });

  it('returns separate current facts and the exact immutable submitted revision', async () => {
    const data = reviewDetail();
    data.record.payload.business.name = 'Current updated name';
    data.record.revision = 2;
    data.record.review.needs_resubmission = true;
    data.can_review = false;
    const result = await reader(data).detail(merchantId);
    expect(result.record.payload.business.name).toBe('Current updated name');
    expect(result.submitted?.payload.business.name).toBe('Maua Cafe');
    expect(result.submitted?.revision).toBe(1);
    expect(result.canReview).toBe(false);
  });

  it.each([
    { limit: 51 }, { state: 'live' }, { cursor: 'bad+cursor' },
    { cursor: Buffer.from(JSON.stringify({ updated_at: instant })).toString('base64url') },
  ])('denies an invalid queue request %j', async query => {
    const rpc = vi.fn();
    await expect(reader(null, { rpc }).queue(query as never)).rejects.toMatchObject({ status: 422, code: 'invalid_queue' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    { items: [queueItem(), queueItem()], next_cursor: null },
    { items: [queueItem()], next_cursor: { updated_at: instant, merchant_id: operationId } },
    { items: [{ ...queueItem(), payout: 'private' }], next_cursor: null },
  ])('fails closed when queue data violates its bounds or cursor identity', async data => {
    await expect(reader(data).queue({ limit: 1 })).rejects.toMatchObject({ status: 503, code: 'review_unavailable' });
  });

  it.each([
    () => ({ ...reviewDetail(), submitted: null }),
    () => ({ ...reviewDetail(), submitted: { ...reviewDetail().submitted, revision: 2 } }),
    () => ({ ...reviewDetail(), submitted: { ...reviewDetail().submitted, merchant_id: operationId } }),
    () => ({ ...reviewDetail(), record: { ...reviewDetail().record, merchant_id: operationId } }),
    () => ({ ...reviewDetail(), can_review: false }),
    () => ({ ...reviewDetail(), submitted: { ...reviewDetail().submitted,
      payload: { ...reviewDetail().submitted.payload, answersBySubcategory: { cafe: { invented_question: true } } } } }),
  ])('does not display an incomplete, foreign or invalid submitted snapshot', async makeData => {
    await expect(reader(makeData()).detail(merchantId)).rejects.toMatchObject({ status: 503, code: 'review_unavailable' });
  });

  it('distinguishes a valid legacy lookup from malformed or unavailable data', async () => {
    expect(await reader(false).managed(merchantId)).toBe(false);
    expect(await reader(true).managed(merchantId)).toBe(true);
    await expect(reader(null).managed(merchantId)).rejects.toMatchObject({ status: 503 });
  });

  it('denies unauthenticated and revoked staff reads without an empty-success fallback', async () => {
    await expect(reader(null, { authenticate: async () => null }).queue()).rejects.toMatchObject({ status: 401, code: 'sign_in_required' });
    await expect(reader(null, { rpc: async () => ({ data: null, error: { code: '42501', message: 'Private SQL detail' } }) }).detail(merchantId))
      .rejects.toMatchObject({ status: 403, code: 'access_denied' });
  });

  it('fences a stalled read at the finite deadline', async () => {
    vi.useFakeTimers();
    const pending = reader(null, { rpc: () => new Promise(() => {}) }).queue();
    const observed = expect(pending).rejects.toMatchObject({ status: 504, code: 'deadline_exceeded' });
    await vi.advanceTimersByTimeAsync(10000);
    await observed;
  });
});
