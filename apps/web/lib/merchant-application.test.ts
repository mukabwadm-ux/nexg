import { describe, it, expect, vi, afterEach } from 'vitest';
import { MERCHANT_TAXONOMY } from '../../../packages/contracts/src/taxonomy';
import {
  MerchantApplicationCapture,
  MerchantPayoutDeclaration,
} from '@nexg/contracts/merchant-application';
import { applicationHandler, type ApplicationPorts } from './merchant-application-http';
import { applicationCapture, payoutDeclaration, payoutForm } from './merchant-application-client';

const merchantId = '0194b62d-4ff0-7b09-8519-d7597b8312bf';
const operationId = '0194b62d-4ff0-7b09-8519-d7597b8312b1';
const category = MERCHANT_TAXONOMY.find((item) => item.id === 'food') ?? MERCHANT_TAXONOMY[0]!;
const capture = () => ({
  registryRevision: 'nexg-booking-2026-10-31.1',
  business: {
    name: 'Amani',
    firstName: 'Amina',
    lastName: 'Otieno',
    email: 'amina@example.test',
    phone: '+254712345678',
    branchCount: 1,
    registered: false,
    sameBusinessPhone: true,
    businessPhone: '+254712345678',
    marketing: false,
  },
  categoryId: category.id,
  subcategories: [category.subcategories[0]!.id],
  answersBySubcategory: {},
  policies: { terms: true },
});
const request = (value: unknown) =>
  new Request('https://merchant.example/api/merchant/application', {
    method: 'POST',
    headers: { origin: 'https://merchant.example', 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
function ports(overrides: Partial<ApplicationPorts> = {}) {
  return {
    enabled: true,
    authenticate: vi.fn(async () => true),
    rpc: vi.fn(async () => ({ data: { merchant_id: merchantId }, error: null })),
    ...overrides,
  };
}
afterEach(() => vi.useRealTimers());

describe('merchant application transport', () => {
  it('keeps disabled and unauthenticated requests away from persistence', async () => {
    const disabled = ports({ enabled: false });
    expect((await applicationHandler(disabled)(request({}))).status).toBe(404);
    expect(disabled.rpc).not.toHaveBeenCalled();
    const anonymous = ports({ authenticate: async () => false });
    expect((await applicationHandler(anonymous)(request({}))).status).toBe(401);
    expect(anonymous.rpc).not.toHaveBeenCalled();
  });
  it('rejects cookie write cross-origin and forged protected fields', async () => {
    const p = ports();
    const foreign = new Request('https://merchant.example/api/merchant/application', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: '{}',
    });
    expect((await applicationHandler(p)(foreign)).status).toBe(403);
    expect(
      (
        await applicationHandler(p)(
          request({ command: 'start', operationId, capture: { ...capture(), approved: true } }),
        )
      ).status,
    ).toBe(422);
    expect(p.rpc).not.toHaveBeenCalled();
  });
  it('uses the browser Host when Next reconstructs an internal localhost URL', async () => {
    const p = ports();
    const response = await applicationHandler(p)(
      new Request('http://localhost:3000/api/merchant/application', {
        method: 'POST',
        headers: {
          host: '127.0.0.1:3000',
          origin: 'http://127.0.0.1:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ command: 'start', operationId, capture: capture() }),
      }),
    );
    expect(response.status).toBe(200);
    expect(p.rpc).toHaveBeenCalledTimes(1);

    const foreign = new Request('http://localhost:3000/api/merchant/application', {
      method: 'POST',
      headers: {
        host: '127.0.0.1:3000',
        origin: 'http://attacker.test',
        'content-type': 'application/json',
      },
      body: '{}',
    });
    expect((await applicationHandler(p)(foreign)).status).toBe(403);
  });
  it('forwards only parsed start fields and private response metadata', async () => {
    const p = ports();
    const response = await applicationHandler(p)(
      request({ command: 'start', operationId, capture: capture() }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-request-id')).toMatch(/^[\da-f-]{36}$/);
    expect(p.rpc).toHaveBeenCalledWith(
      'rpc_merchant_application_start',
      { p_operation_id: operationId, p_payload: capture(), p_merchant_id: null },
      expect.any(AbortSignal),
    );
  });
  it('passes exact expected revision and stable operation key without retrying writes', async () => {
    const p = ports({
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: '40001', message: 'private backend detail' },
      })),
    });
    const response = await applicationHandler(p)(
      request({
        command: 'save',
        merchantId,
        expectedRevision: 2,
        operationId,
        capture: capture(),
      }),
    );
    expect(response.status).toBe(409);
    expect(p.rpc).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await response.json())).not.toContain('private backend detail');
  });
  it('supports owner-authorized operation lookup without touching activity', async () => {
    const p = ports();
    const response = await applicationHandler(p)(
      new Request(`https://merchant.example/api/merchant/application?operationId=${operationId}`),
    );
    expect(response.status).toBe(200);
    expect(p.rpc).toHaveBeenCalledWith(
      'rpc_merchant_application_operation_read',
      { p_operation_id: operationId },
      expect.any(AbortSignal),
    );
  });
  it('lets an anonymous form session submit while keeping payout and session activity account-only', async () => {
    const p = ports({ authenticate: async () => ({ authenticated: true, anonymous: true }) });
    const submit = await applicationHandler(p)(
      request({ command: 'start', operationId, capture: capture() }),
    );
    expect(submit.status).toBe(200);
    const payout = await applicationHandler(p)(
      new Request(
        `https://merchant.example/api/merchant/application?merchantId=${merchantId}&view=payout`,
      ),
    );
    expect(payout.status).toBe(403);
    const activity = await applicationHandler(p)(request({ command: 'activity', merchantId }));
    expect(activity.status).toBe(403);
    expect(p.rpc).toHaveBeenCalledTimes(1);
    expect(p.rpc).toHaveBeenCalledWith(
      'rpc_merchant_application_start',
      { p_operation_id: operationId, p_payload: capture(), p_merchant_id: null },
      expect.any(AbortSignal),
    );
  });
  it('rejects anonymous and unverified application submissions when verification is enabled', async () => {
    const anonymous = ports({
      emailVerificationRequired: true,
      authenticate: async () => ({ authenticated: true, anonymous: true }),
    });
    const anonymousResponse = await applicationHandler(anonymous)(
      request({ command: 'submit', merchantId, expectedRevision: 1, operationId }),
    );
    expect(anonymousResponse.status).toBe(403);
    expect((await anonymousResponse.json()).title).toBe('email_verification_required');
    expect(anonymous.rpc).not.toHaveBeenCalled();

    const unverified = ports({
      emailVerificationRequired: true,
      authenticate: async () => ({
        authenticated: true,
        anonymous: false,
        email: 'amina@example.test',
        emailConfirmed: false,
      }),
    });
    expect(
      (
        await applicationHandler(unverified)(
          request({ command: 'submit', merchantId, expectedRevision: 1, operationId }),
        )
      ).status,
    ).toBe(403);
    expect(unverified.rpc).not.toHaveBeenCalled();
  });
  it('requires the saved application email to match the confirmed account before submission', async () => {
    const p = ports({
      emailVerificationRequired: true,
      authenticate: async () => ({
        authenticated: true,
        anonymous: false,
        email: 'amina@example.test',
        emailConfirmed: true,
      }),
      verifyApplicationEmail: vi.fn(async () => false),
    });
    const response = await applicationHandler(p)(
      request({ command: 'submit', merchantId, expectedRevision: 1, operationId }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).title).toBe('email_verification_required');
    expect(p.verifyApplicationEmail).toHaveBeenCalledWith(
      merchantId,
      'amina@example.test',
      expect.any(AbortSignal),
    );
    expect(p.rpc).not.toHaveBeenCalled();
  });
  it('submits only after the confirmed account email matches the saved application', async () => {
    const p = ports({
      emailVerificationRequired: true,
      authenticate: async () => ({
        authenticated: true,
        anonymous: false,
        email: 'amina@example.test',
        emailConfirmed: true,
      }),
      verifyApplicationEmail: vi.fn(async () => true),
    });
    const response = await applicationHandler(p)(
      request({ command: 'submit', merchantId, expectedRevision: 1, operationId }),
    );
    expect(response.status).toBe(200);
    expect(p.rpc).toHaveBeenCalledWith(
      'rpc_merchant_application_submit',
      { p_merchant_id: merchantId, p_expected_revision: 1, p_operation_id: operationId },
      expect.any(AbortSignal),
    );
  });
  it('bounds bytes before parsing and rejects malformed data', async () => {
    const p = ports();
    expect((await applicationHandler(p)(request('x'.repeat(100000)))).status).toBe(413);
    const malformed = new Request('https://merchant.example/api/merchant/application', {
      method: 'POST',
      headers: { origin: 'https://merchant.example', 'content-type': 'application/json' },
      body: '{',
    });
    expect((await applicationHandler(p)(malformed)).status).toBe(400);
    expect(p.rpc).not.toHaveBeenCalled();
  });
  it('expires a stalled authentication request without persistence', async () => {
    vi.useFakeTimers();
    const p = ports({ authenticate: () => new Promise(() => {}) });
    const pending = applicationHandler(p)(request({}));
    await vi.advanceTimersByTimeAsync(10000);
    expect((await pending).status).toBe(504);
    expect(p.rpc).not.toHaveBeenCalled();
  });
  it('maps the shared application quota to a safe rejection', async () => {
    const p = ports({ rpc: async () => ({ data: null, error: { code: 'P4290', hint: '40' } }) });
    const response = await applicationHandler(p)(
      request({ command: 'submit', merchantId, expectedRevision: 1, operationId }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('40');
  });
});
describe('capture and payout compatibility', () => {
  it('preserves false and retained answers, excludes files/finance and normalizes phones', () => {
    const input = {
      ...capture(),
      business: { ...capture().business, phone: '0712 345 678' },
      documents: { passport: { secret: 'never-store' } },
      payout: { bankAccount: 'private' },
    };
    expect(applicationCapture(input)).toEqual(capture());
    expect(
      MerchantApplicationCapture.safeParse({
        ...capture(),
        business: { ...capture().business, status: 'live' },
      }).success,
    ).toBe(false);
  });
  it('rejects unrelated specialties and unknown retained scopes', () => {
    expect(
      MerchantApplicationCapture.safeParse({ ...capture(), subcategories: ['unknown_specialty'] })
        .success,
    ).toBe(false);
    expect(
      MerchantApplicationCapture.safeParse({
        ...capture(),
        answersBySubcategory: { arbitrary: { enabled: false } },
      }).success,
    ).toBe(false);
  });
  it('keeps Till and PayBill identifiers as strings with alphanumeric references', () => {
    expect(payoutDeclaration({ method: 'mpesa_till', tillNumber: '001234' })).toEqual({
      rail: 'mpesa_till',
      tillNumber: '001234',
    });
    const declared = { rail: 'mpesa_paybill', paybillNumber: '123456', accountReference: 'jkl03' };
    expect(MerchantPayoutDeclaration.parse(declared)).toEqual(declared);
    expect(payoutForm(declared)?.accountReference).toBe('jkl03');
  });
  it('refuses to turn legacy phone or verified claims into a payout declaration', () => {
    expect(() =>
      payoutDeclaration({ method: 'mobile_money', mobileNumber: '+254712345678' }),
    ).toThrow('previous phone');
    expect(
      MerchantPayoutDeclaration.safeParse({
        rail: 'mpesa_till',
        tillNumber: '1234',
        verified: true,
      }).success,
    ).toBe(false);
  });
});
