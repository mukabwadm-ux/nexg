import { afterEach, describe, expect, it, vi } from 'vitest';
import { merchantApplicationReviewHandler, type ReviewTransportPorts } from './merchant-application-review-http';
import { actorId, merchantId, operationId, reviewCommand, reviewRecord, reviewRequest } from './test-fixtures/application-review';

function ports(overrides: Partial<ReviewTransportPorts> = {}) {
  return { authenticate: vi.fn(async () => actorId),
    rpc: vi.fn(async () => ({ data: { ...reviewRecord('approved'), operation_id: operationId }, error: null })), ...overrides };
}
afterEach(() => vi.useRealTimers());

describe('staff application review transport', () => {
  it('returns the confirmed revision and unchanged publication through the existing review command', async () => {
    const p = ports();
    const response = await merchantApplicationReviewHandler(p)(reviewRequest(reviewCommand(), { 'x-request-id': operationId }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ merchant_id: merchantId, revision: 1, operation_id: operationId,
      review: { state: 'approved', submitted_revision: 1 }, access: { operations: true },
      publication: { status: 'applied', accepting_work: false } });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Cookie, Origin');
    expect(response.headers.get('x-request-id')).toBe(operationId);
    expect(p.rpc).toHaveBeenCalledWith('rpc_merchant_application_review', { p_merchant_id: merchantId,
      p_expected_revision: 1, p_operation_id: operationId, p_decision: 'approved', p_reason: null }, expect.any(AbortSignal));
  });

  it.each([
    ['missing authentication', null, actorId, 401, 'sign_in_required'],
    ['changed account', merchantId, actorId, 403, 'actor_changed'],
    ['missing page actor', actorId, '', 403, 'actor_changed'],
  ])('denies %s before persistence', async (_label, signedIn, pageActor, status, code) => {
    const p = ports({ authenticate: async () => signedIn as string | null });
    const response = await merchantApplicationReviewHandler(p)(reviewRequest(reviewCommand(), { 'x-review-actor-id': pageActor as string }));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ type: `urn:nexg:application-review:${code}`, status });
    expect(p.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ origin: 'https://foreign.test' }, 403, 'origin_rejected'],
    [{ origin: '' }, 403, 'origin_rejected'],
    [{ 'content-type': 'text/plain' }, 415, 'unsupported_media_type'],
    [{ 'content-encoding': 'gzip' }, 415, 'unsupported_encoding'],
    [{ 'content-length': '12289' }, 413, 'payload_too_large'],
  ])('rejects unsafe request headers %j', async (headers, status, code) => {
    const p = ports();
    const response = await merchantApplicationReviewHandler(p)(reviewRequest(reviewCommand(), headers));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ type: `urn:nexg:application-review:${code}` });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(p.rpc).not.toHaveBeenCalled();
  });

  it('bounds actual streamed bytes and reports malformed JSON without leaking parser details', async () => {
    const p = ports();
    const large = await merchantApplicationReviewHandler(p)(reviewRequest('x'.repeat(13000)));
    expect(large.status).toBe(413);
    const response = await merchantApplicationReviewHandler(p)(new Request('https://console.test/api/merchant-applications/review', {
      method: 'POST', headers: { origin: 'https://console.test', 'content-type': 'application/json', 'x-review-actor-id': actorId }, body: '{',
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ type: 'urn:nexg:application-review:invalid_json' });
    expect(p.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { ...reviewCommand(), decision: 'changes_requested', reason: '  ' },
    { ...reviewCommand(), decision: 'rejected', reason: 'x'.repeat(2001) },
    { ...reviewCommand(), expectedRevision: 0 },
    { ...reviewCommand(), publication: { status: 'live' } },
  ])('rejects an invalid or overposting decision', async command => {
    const p = ports();
    const response = await merchantApplicationReviewHandler(p)(reviewRequest(command));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ type: 'urn:nexg:application-review:invalid_request' });
    expect(p.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['42501', 403, 'access_denied'], ['P0002', 404, 'not_found'], ['40001', 409, 'revision_conflict'],
    ['23505', 409, 'revision_conflict'], ['22023', 422, 'invalid_review'], ['55000', 503, 'review_unavailable'],
  ])('maps database code %s to a safe private problem', async (code, status, problemCode) => {
    const p = ports({ rpc: vi.fn(async () => ({ data: null, error: { code, message: 'PRIVATE applicant and SQL exception' } })) });
    const response = await merchantApplicationReviewHandler(p)(reviewRequest(reviewCommand()));
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body).toMatchObject({ type: `urn:nexg:application-review:${problemCode}`, status });
    expect(JSON.stringify(body)).not.toContain('PRIVATE');
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(p.rpc).toHaveBeenCalledTimes(1);
  });

  it('reports a bounded retry delay without automatically retrying a decision', async () => {
    const p = ports({ rpc: vi.fn(async () => ({ data: null, error: { code: 'P4290', hint: '40' } })) });
    const response = await merchantApplicationReviewHandler(p)(reviewRequest(reviewCommand()));
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('40');
    expect(p.rpc).toHaveBeenCalledTimes(1);
  });

  it('fences a stalled authentication and a late committed decision as unknown outcomes', async () => {
    vi.useFakeTimers();
    const stalled = ports({ authenticate: () => new Promise(() => {}) });
    const authResponse = merchantApplicationReviewHandler(stalled)(reviewRequest(reviewCommand()));
    await vi.advanceTimersByTimeAsync(10000);
    expect((await authResponse).status).toBe(504);
    expect(stalled.rpc).not.toHaveBeenCalled();

    let release: ((value: Awaited<ReturnType<ReviewTransportPorts['rpc']>>) => void) | undefined;
    const p = ports({ rpc: vi.fn(() => new Promise<Awaited<ReturnType<ReviewTransportPorts['rpc']>>>(resolve => { release = resolve; })) });
    const pending = merchantApplicationReviewHandler(p)(reviewRequest(reviewCommand()));
    await vi.advanceTimersByTimeAsync(10000);
    const response = await pending;
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ type: 'urn:nexg:application-review:deadline_exceeded',
      detail: 'The decision outcome is unknown. Reload or explicitly retry with the same operation ID.' });
    release!({ data: { ...reviewRecord('approved'), operation_id: operationId }, error: null });
    expect(p.rpc).toHaveBeenCalledTimes(1);
  });

  it('cancels an in-flight request without presenting a late decision as confirmed', async () => {
    const controller = new AbortController();
    const p = ports({ rpc: () => new Promise(() => {}) });
    const pending = merchantApplicationReviewHandler(p)(reviewRequest(reviewCommand(), {}, controller.signal));
    await Promise.resolve();
    controller.abort();
    const response = await pending;
    expect(response.status).toBe(408);
    expect(await response.json()).toMatchObject({ type: 'urn:nexg:application-review:request_cancelled' });
  });

  it.each([
    { ...reviewRecord('approved'), operation_id: merchantId },
    { ...reviewRecord('approved'), operation_id: operationId, merchant_id: operationId },
    { ...reviewRecord('approved'), operation_id: operationId, revision: 2 },
    { ...reviewRecord('pending'), operation_id: operationId },
    { ...reviewRecord('approved'), operation_id: operationId, payload: { ...reviewRecord().payload, registryRevision: 'unknown' } },
  ])('does not confirm a mismatched backend result', async data => {
    const response = await merchantApplicationReviewHandler(ports({ rpc: async () => ({ data, error: null }) }))(reviewRequest(reviewCommand()));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ type: 'urn:nexg:application-review:review_unavailable' });
  });
});
