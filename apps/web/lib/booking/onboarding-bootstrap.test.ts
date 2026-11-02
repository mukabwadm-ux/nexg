import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveOnboardingSelection } from '@nexg/booking-config/onboarding';
import { bootstrapMerchantBooking } from './bridge';
import { merchantBookingIdentity } from './identity';
import { merchantBookingBootstrapIdentity } from './onboarding-bootstrap';

const mock = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('../supabase/server', () => ({ createClient: mock.createClient }));
const merchantId = '0194b62d-4ff0-7b09-8519-d7597b8312bf';
const registryRevision = resolveOnboardingSelection('restaurants_food', ['restaurant']).revision;
const saved = () => ({
  merchant_id: merchantId,
  revision: 3,
  payload: {
    registryRevision,
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
    categoryId: 'restaurants_food',
    subcategories: ['restaurant', 'cafe'],
    answersBySubcategory: {
      restaurant: { Q_AVG_PREP_TIME: 0, Q_HAS_PHYSICAL_SEATING: false },
      cafe: { Q_AVG_PREP_TIME: 15 },
    },
    policies: { terms: true },
  },
  review: {
    state: 'approved',
    submitted_revision: 3,
    submitted_at: '2026-11-02T06:00:00Z',
    needs_resubmission: false,
  },
  access: { state: 'approved', setup: true, operations: true },
  publication: { status: 'under_review' },
});
let application: ReturnType<typeof saved>;
let rpc: ReturnType<typeof vi.fn>;
let selections: string[];
let role: 'owner' | 'manager';
let legacy: boolean;
let applicationError: unknown;
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-test-key');
  application = saved();
  applicationError = null;
  role = 'owner';
  legacy = false;
  selections = [];
  rpc = vi.fn(async (name: string) => {
    if (name === 'fn_partner_home')
      return { data: { kind: 'merchant', id: merchantId, name: 'Amani' }, error: null };
    if (name === 'rpc_merchant_workspace_access')
      return {
        data: legacy
          ? { state: 'legacy', setup: true, operations: true }
          : {
              state: 'approved',
              setup: true,
              operations: true,
              review_state: 'approved',
              revision: 3,
              needs_resubmission: false,
              expires_at: '2099-01-01T00:00:00Z',
            },
        error: null,
      };
    if (name === 'rpc_merchant_application_read')
      return { data: application, error: applicationError };
    throw new Error(`Unexpected RPC ${name}`);
  });
  mock.createClient.mockReturnValue({
    auth: { getUser: async () => ({ data: { user: { id: 'owner-1' } }, error: null }) },
    rpc,
    from(table: string) {
      const query = {
        select: (fields: string) => {
          selections.push(`${table}:${fields}`);
          return query;
        },
        eq: () => query,
        maybeSingle: async () => ({
          data:
            table === 'merchant_user'
              ? { merchant_id: merchantId, role, branches: null }
              : {
                  subcategory: 'restaurant',
                  answers: { legacy: 'retained' },
                  status: 'under_review',
                },
          error: null,
        }),
      };
      return query;
    },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('explicit saved application booking seed', () => {
  it('keeps application and legacy answers out of managed identity reads', async () => {
    const identity = await merchantBookingIdentity();
    expect(identity?.answers).toBeUndefined();
    expect(selections).toContain('merchant:subcategory,status');
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'fn_partner_home',
      'rpc_merchant_workspace_access',
    ]);
  });

  it('sends only the approved primary scope to the existing bootstrap body, preserving false and zero', async () => {
    const identity = (await merchantBookingIdentity())!;
    const retained = structuredClone(application);
    const seed = (await merchantBookingBootstrapIdentity(identity))!;
    expect(seed.answers).toEqual({ Q_AVG_PREP_TIME: 0, Q_HAS_PHYSICAL_SEATING: false });
    expect(application).toEqual(retained);
    expect(rpc).toHaveBeenCalledWith('rpc_merchant_application_read', {
      p_merchant_id: merchantId,
    });
    expect(rpc.mock.calls.some(([name]) => name === 'rpc_merchant_application_payout_read')).toBe(
      false,
    );

    vi.stubEnv('BOOKING_BRIDGE_SECRET', 's'.repeat(40));
    vi.stubEnv('BOOKING_ENGINE_URL', 'https://booking.test');
    const fetch = vi.fn().mockResolvedValue(Response.json({ configured: true }));
    vi.stubGlobal('fetch', fetch);
    await bootstrapMerchantBooking(seed);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url.href).toBe('https://booking.test/v1/bootstrap');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      businessName: 'Amani',
      subcategoryId: 'restaurant',
      answers: { Q_AVG_PREP_TIME: 0, Q_HAS_PHYSICAL_SEATING: false },
      businessStatus: 'under_review',
    });
    const claims = JSON.parse(
      Buffer.from(init.headers['x-nexg-booking-context'], 'base64url').toString(),
    );
    expect(claims.answers).toBeUndefined();
    expect(claims.revision).toBeUndefined();
  });

  it.each(['owner', 'manager'] as const)(
    'keeps legacy %s bootstrap on the existing seed without application reads',
    async (assignedRole) => {
      legacy = true;
      role = assignedRole;
      const identity = (await merchantBookingIdentity())!;
      await expect(merchantBookingBootstrapIdentity(identity)).resolves.toBe(identity);
      expect(identity.answers).toEqual({ legacy: 'retained' });
      expect(rpc.mock.calls.some(([name]) => name === 'rpc_merchant_application_read')).toBe(false);
    },
  );

  it('requires the managed owner for import without reading the application for a manager', async () => {
    role = 'manager';
    const identity = (await merchantBookingIdentity())!;
    await expect(merchantBookingBootstrapIdentity(identity)).resolves.toBeNull();
    expect(rpc.mock.calls.some(([name]) => name === 'rpc_merchant_application_read')).toBe(false);
  });

  it.each([
    [
      'another merchant',
      (record: ReturnType<typeof saved>) => {
        record.merchant_id = '0194b62d-4ff0-7b09-8519-d7597b8312b1';
      },
    ],
    [
      'changed revision',
      (record: ReturnType<typeof saved>) => {
        record.revision = 4;
      },
    ],
    [
      'pending review',
      (record: ReturnType<typeof saved>) => {
        record.review.state = 'pending';
      },
    ],
    [
      'stale submission',
      (record: ReturnType<typeof saved>) => {
        record.review.submitted_revision = 2;
      },
    ],
    [
      'resubmission required',
      (record: ReturnType<typeof saved>) => {
        record.review.needs_resubmission = true;
      },
    ],
    [
      'operations denied',
      (record: ReturnType<typeof saved>) => {
        record.access.operations = false;
      },
    ],
    [
      'unknown registry',
      (record: ReturnType<typeof saved>) => {
        record.payload.registryRevision = 'unknown';
      },
    ],
    [
      'changed primary scope',
      (record: ReturnType<typeof saved>) => {
        record.payload.subcategories.reverse();
      },
    ],
    [
      'invalid supplied answer',
      (record: ReturnType<typeof saved>) => {
        record.payload.answersBySubcategory.restaurant.Q_AVG_PREP_TIME = -1;
      },
    ],
    [
      'foreign question',
      (record: ReturnType<typeof saved>) => {
        Object.assign(record.payload.answersBySubcategory.restaurant, {
          Q_SIGNATURE_REQUIRED: false,
        });
      },
    ],
    [
      'malformed capture',
      (record: ReturnType<typeof saved>) => {
        record.payload.business.email = 'invalid';
      },
    ],
  ] as const)('rejects %s before producing a seed', async (_label, alter) => {
    alter(application);
    await expect(
      merchantBookingBootstrapIdentity((await merchantBookingIdentity())!),
    ).rejects.toThrow();
  });

  it('fails closed when the owner application cannot be read or internal authorization is absent', async () => {
    applicationError = { code: '42501' };
    await expect(
      merchantBookingBootstrapIdentity((await merchantBookingIdentity())!),
    ).rejects.toThrow();
    await expect(
      merchantBookingBootstrapIdentity({
        businessId: merchantId,
        userId: 'owner-1',
        role: 'owner',
      }),
    ).rejects.toThrow();
  });
});
