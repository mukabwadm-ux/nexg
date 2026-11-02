import { describe, expect, it, vi } from 'vitest';
import {
  MerchantApplicationRecord,
  MerchantPayoutRecord,
} from '@nexg/contracts/merchant-application';
import { loadApplicationView } from './merchant-application-load';
import { loadMerchantHomeSource, projectMerchantSavedHome } from './merchant-home-source';
import type {
  MerchantHomeBranch,
  MerchantHomeCatalogue,
  MerchantHomeDocument,
  MerchantHomeHours,
} from './merchant-home-source';
import type { MerchantWorkspaceAccess } from './merchant-access';

const merchantId = '0194b62d-4ff0-7b09-8519-d7597b8312bf';
const branchId = '0194b62d-4ff0-7b09-8519-d7597b831201';
const deletedBranchId = '0194b62d-4ff0-7b09-8519-d7597b831202';
const itemId = '0194b62d-4ff0-7b09-8519-d7597b831203';
const requirementId = '0194b62d-4ff0-7b09-8519-d7597b831204';
const expires_at = '2099-01-01T00:00:00Z';
const access = (): MerchantWorkspaceAccess => ({
  state: 'pending',
  setup: true,
  operations: false,
  review_state: 'pending',
  revision: 2,
  needs_resubmission: false,
  expires_at,
});
const record = () =>
  MerchantApplicationRecord.parse({
    merchant_id: merchantId,
    revision: 2,
    payload: {
      registryRevision: 'nexg-booking-2026-10-31.1',
      business: {
        name: 'Acacia',
        firstName: 'Amina',
        lastName: 'Otieno',
        email: 'amina@example.test',
        phone: '+254712345678',
        branchCount: 8,
        registered: false,
        sameBusinessPhone: true,
        businessPhone: '+254712345678',
        marketing: false,
      },
      categoryId: 'restaurants_food',
      subcategories: ['restaurant'],
      answersBySubcategory: {},
      policies: { terms: true },
    },
    review: {
      state: 'pending',
      submitted_revision: 2,
      submitted_at: '2026-11-01T10:00:00Z',
      needs_resubmission: false,
    },
    access: access(),
    publication: { status: 'applied', accepting_work: false },
  });
const payout = () =>
  MerchantPayoutRecord.parse({
    merchant_id: merchantId,
    version: 0,
    payout: null,
    verification: 'declared',
  });
const branch = (patch: Partial<MerchantHomeBranch> = {}): MerchantHomeBranch => ({
  id: branchId,
  merchant_id: merchantId,
  name: 'Central',
  address_text: 'Kenyatta Avenue',
  latitude: -1.28,
  longitude: 36.82,
  is_primary: true,
  deleted_at: null,
  closed_at: null,
  paused_at: null,
  ...patch,
});
const hours = (patch: Partial<MerchantHomeHours> = {}): MerchantHomeHours => ({
  id: itemId,
  merchant_id: merchantId,
  branch_id: null,
  day_of_week: 1,
  service: 'Dinner',
  opens: '18:00:00',
  closes: '01:00:00',
  closed: false,
  ...patch,
});
const document = (patch: Partial<MerchantHomeDocument> = {}): MerchantHomeDocument => ({
  id: itemId,
  owner_type: 'merchant',
  owner_id: merchantId,
  requirement_id: requirementId,
  side: 'front',
  status: 'uploaded',
  reviewed_at: null,
  expires_at: null,
  superseded_at: null,
  ...patch,
});
const known = <T>(records: T[]) => ({ state: 'known' as const, records });
const fixture = () => ({
  record: record(),
  payout: payout(),
  access: access(),
  catalogue: known<MerchantHomeCatalogue>([
    { id: itemId, merchant_id: merchantId, name: 'Lunch', price_kes: 500, available: true },
  ]),
  branches: known([branch(), branch({ id: deletedBranchId, deleted_at: '2026-11-01T10:00:00Z' })]),
  hours: known([
    hours(),
    hours({ service: 'All day', opens: '00:00:00.000000', closes: '24:00:00' }),
    hours({ branch_id: deletedBranchId }),
  ]),
  documents: known([
    document(),
    document({
      id: branchId,
      side: 'back',
      status: 'verified',
      reviewed_at: '2026-11-01T10:00:00Z',
    }),
  ]),
  now: new Date('2026-11-02T10:00:00Z'),
});
const row = (source: ReturnType<typeof projectMerchantSavedHome>, id: string) =>
  source.projection.rows.find((item) => item.id === id);

describe('saved merchant Home projection', () => {
  it('keeps nullable draft entry details missing while still showing separately saved catalogue facts', () => {
    const input = fixture();
    input.record.payload.business.branchCount = null;
    input.record.payload.categoryId = null;
    input.record.payload.subcategories = [];
    const result = projectMerchantSavedHome(input);
    expect(row(result, 'business')).toMatchObject({
      status: 'missing',
      statusLabel: 'Add details',
    });
    expect(row(result, 'activities')).toMatchObject({
      status: 'missing',
      statusLabel: 'Choose activities',
    });
    expect(result.summary.catalogue).toEqual({
      state: 'known',
      total: 1,
      available: 1,
      priced: 1,
      activityLinks: 'not_recorded',
    });
  });

  it('reports committed facts without turning catalogue entries into selected activities or declared branches into locations', () => {
    const result = projectMerchantSavedHome(fixture());
    expect(result.summary.catalogue).toEqual({
      state: 'known',
      total: 1,
      available: 1,
      priced: 1,
      activityLinks: 'not_recorded',
    });
    expect(result.summary.locations).toEqual({
      state: 'known',
      total: 1,
      addressed: 1,
      pinned: 1,
      closed: 0,
      paused: 0,
      primaryName: 'Central',
      primaryAddress: 'Kenyatta Avenue',
    });
    expect(result.projection.subcategoryIds).toEqual(['restaurant']);
    expect(row(result, 'specialty:restaurant')).toBeUndefined();
    expect(row(result, 'offerings')).toMatchObject({
      status: 'provided',
      statusLabel: 'Offerings saved',
    });
    expect(result.summary.hours).toEqual({
      state: 'known',
      total: 2,
      openWindows: 2,
      days: 1,
      bookableSchedules: 'not_checked',
    });
    expect(row(result, 'hours')).toMatchObject({ status: 'provided', statusLabel: 'Hours saved' });
  });

  it('distinguishes current uploaded sides from reviewed and expired records without claiming requirements are complete', () => {
    const input = fixture();
    input.documents = known([
      document(),
      document({
        id: branchId,
        side: 'back',
        status: 'verified',
        reviewed_at: '2026-10-01T10:00:00Z',
        expires_at: '2026-11-01',
      }),
      document({
        id: deletedBranchId,
        requirement_id: deletedBranchId,
        status: 'verified',
        reviewed_at: '2026-11-01T10:00:00Z',
      }),
      document({
        id: requirementId,
        status: 'rejected',
        reviewed_at: '2026-11-01T10:00:00Z',
        superseded_at: '2026-11-01T11:00:00Z',
      }),
    ]);
    const result = projectMerchantSavedHome(input);
    expect(result.summary.documents).toEqual({
      state: 'known',
      total: 3,
      uploaded: 1,
      verified: 1,
      rejected: 0,
      expired: 1,
      requirements: 'not_assessed',
    });
    expect(row(result, 'documents')).toMatchObject({
      status: 'invalid',
      statusLabel: 'Evidence needs attention',
    });
    expect(result.review).toEqual({
      reason: null,
      state: 'pending',
      currentRevision: true,
      submittedRevision: 2,
      needsResubmission: false,
    });
    expect(row(result, 'launch')).toMatchObject({
      status: 'waiting',
      statusLabel: 'Waiting for review',
    });
  });

  it('keeps unavailable facts distinct from confirmed empty sections', () => {
    const input = fixture();
    const unavailable = projectMerchantSavedHome({
      ...input,
      catalogue: { state: 'unavailable' },
      branches: { state: 'unavailable' },
      documents: { state: 'unavailable' },
    });
    expect(unavailable.summary.catalogue).toEqual({ state: 'unavailable' });
    expect(unavailable.summary.locations).toEqual({ state: 'unavailable' });
    expect(row(unavailable, 'documents')).toMatchObject({
      status: 'waiting',
      statusLabel: 'Unavailable',
    });
    const empty = projectMerchantSavedHome({
      ...input,
      catalogue: known([]),
      branches: known([]),
      hours: known([]),
      documents: known([]),
    });
    expect(empty.summary.catalogue).toEqual({
      state: 'known',
      total: 0,
      available: 0,
      priced: 0,
      activityLinks: 'not_recorded',
    });
    expect(row(empty, 'offerings')).toMatchObject({
      status: 'missing',
      statusLabel: 'Add offerings',
    });
  });

  it('keeps current approval separate from activation and stale approval separate from current changes', () => {
    const input = fixture();
    input.record.review.state = 'approved';
    input.access = { ...access(), state: 'approved', review_state: 'approved', operations: true };
    const approved = projectMerchantSavedHome(input);
    expect(row(approved, 'launch')).toMatchObject({
      status: 'waiting',
      statusLabel: 'Approved, activation pending',
    });
    expect(approved.publication).toEqual({ status: 'applied', acceptingWork: false });
    input.access.operations = false;
    input.record.publication.status = 'suspended';
    const restricted = projectMerchantSavedHome(input);
    expect(row(restricted, 'launch')).toMatchObject({
      status: 'waiting',
      statusLabel: 'Approved, account restricted',
    });
    input.record.review.needs_resubmission = true;
    input.record.review.submitted_revision = 1;
    const stale = projectMerchantSavedHome(input);
    expect(stale.review).toEqual({
      reason: null,
      state: 'approved',
      currentRevision: false,
      submittedRevision: 1,
      needsResubmission: true,
    });
    expect(row(stale, 'launch')).toMatchObject({
      status: 'waiting',
      statusLabel: 'Resubmission needed',
    });
  });

  it('returns only declared payout metadata in Home while preserving private identifiers in the separate owner record', () => {
    const input = fixture();
    input.payout = MerchantPayoutRecord.parse({
      merchant_id: merchantId,
      version: 3,
      payout: {
        rail: 'mpesa_paybill',
        paybillNumber: '0099123456',
        accountReference: 'PRIVATE-000123',
      },
      verification: 'declared',
    });
    const result = projectMerchantSavedHome(input);
    expect(result.summary.payout).toEqual({
      state: 'declared',
      rail: 'mpesa_paybill',
      version: 3,
      verification: 'declared',
    });
    expect(row(result, 'payout')).toMatchObject({
      status: 'provided',
      statusLabel: 'Declaration saved',
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE-000123');
    expect(input.payout.payout).toEqual({
      rail: 'mpesa_paybill',
      paybillNumber: '0099123456',
      accountReference: 'PRIVATE-000123',
    });
  });
});

function database(
  options: {
    access?: unknown;
    finalAccess?: unknown;
    payout?: unknown;
    rows?: Record<string, unknown>;
    errors?: string[];
  } = {},
) {
  const input = fixture();
  const requests: Array<{
    table: string;
    columns: string;
    filters: Array<[string, unknown]>;
    limit: number;
  }> = [];
  let authorityChecked = false;
  const rpc = async (name: string) => {
    if (name === 'rpc_merchant_workspace_access') {
      const data = authorityChecked
        ? (options.finalAccess ?? options.access ?? access())
        : (options.access ?? access());
      authorityChecked = true;
      return { data, error: null };
    }
    return {
      data: name === 'rpc_merchant_application_read' ? record() : (options.payout ?? payout()),
      error: null,
    };
  };
  const tables: Record<string, unknown> = {
    catalogue_item: input.catalogue.records,
    merchant_branch: [branch()],
    merchant_hours: [hours()],
    document: input.documents.records,
    ...options.rows,
  };
  return {
    requests,
    client: {
      rpc,
      from: (table: string) => {
        if (!authorityChecked)
          throw new Error('An owner source cannot read sections before authority.');
        const request = { table, columns: '', filters: [] as Array<[string, unknown]>, limit: 0 };
        requests.push(request);
        const query = {
          select: (columns: string) => {
            request.columns = columns;
            return query;
          },
          eq: (column: string, value: unknown) => {
            request.filters.push([column, value]);
            return query;
          },
          is: (column: string, value: unknown) => {
            request.filters.push([column, value]);
            return query;
          },
          order: () => query,
          limit: (limit: number) => {
            request.limit = limit;
            return query;
          },
          abortSignal: () => query,
          then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve({
              data: tables[table],
              error: options.errors?.includes(table) ? { message: 'private detail' } : null,
            }).then(resolve, reject),
        };
        return query;
      },
    },
  };
}

describe('saved Home owner loader', () => {
  it('returns saved sections through bounded owned queries after the authority check without operational reads', async () => {
    const db = database();
    const result = await loadMerchantHomeSource(db.client, merchantId);
    expect(result.home.summary.catalogue).toEqual({
      state: 'known',
      total: 1,
      available: 1,
      priced: 1,
      activityLinks: 'not_recorded',
    });
    expect(result.home.summary.documents).toEqual({
      state: 'known',
      total: 2,
      uploaded: 1,
      verified: 1,
      rejected: 0,
      expired: 0,
      requirements: 'not_assessed',
    });
    expect(
      db.requests.map((request) => ({
        table: request.table,
        filters: request.filters,
        limit: request.limit,
      })),
    ).toEqual([
      { table: 'catalogue_item', filters: [['merchant_id', merchantId]], limit: 501 },
      {
        table: 'merchant_branch',
        filters: [
          ['merchant_id', merchantId],
          ['deleted_at', null],
        ],
        limit: 101,
      },
      { table: 'merchant_hours', filters: [['merchant_id', merchantId]], limit: 501 },
      {
        table: 'document',
        filters: [
          ['owner_id', merchantId],
          ['owner_type', 'merchant'],
          ['superseded_at', null],
        ],
        limit: 201,
      },
    ]);
  });

  it('shows errors, malformed reviews and truncated reads as unavailable while retaining other saved facts', async () => {
    const db = database({
      errors: ['merchant_branch'],
      rows: {
        catalogue_item: Array.from({ length: 501 }, (_, index) => ({
          ...fixture().catalogue.records[0],
          name: `Item ${index}`,
        })),
        document: [document({ status: 'verified', reviewed_at: null })],
      },
    });
    const result = await loadMerchantHomeSource(db.client, merchantId);
    expect(result.home.summary.catalogue).toEqual({ state: 'unavailable' });
    expect(result.home.summary.locations).toEqual({ state: 'unavailable' });
    expect(result.home.summary.documents).toEqual({ state: 'unavailable' });
    expect(result.home.summary.hours).toEqual({
      state: 'known',
      total: 1,
      openWindows: 1,
      days: 1,
      bookableSchedules: 'not_checked',
    });
  });

  it('rejects mismatched owner records and expired authority before returning any saved Home', async () => {
    const wrong = database({ payout: { ...payout(), merchant_id: branchId } });
    await expect(loadApplicationView(wrong.client, merchantId)).rejects.toThrow(
      'identity could not be confirmed',
    );
    const expired = database({ access: { ...access(), expires_at: '2020-01-01T00:00:00Z' } });
    await expect(loadMerchantHomeSource(expired.client, merchantId)).rejects.toThrow(
      'permissions could not be checked',
    );
    expect(expired.requests).toEqual([]);
    const valid = await loadMerchantHomeSource(database().client, merchantId);
    expect(valid.home.merchantId).toBe(merchantId);
  });

  it('fails closed when an owner RPC stalls, without converting the missing application into section zeros', async () => {
    vi.useFakeTimers();
    try {
      const result = loadMerchantHomeSource({ rpc: () => new Promise(() => {}) }, merchantId);
      const assertion = expect(result).rejects.toThrow('saved Home could not be loaded');
      await vi.advanceTimersByTimeAsync(10000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a membership or revision change during section reads instead of returning stale empty setup', async () => {
    const revoked = database({
      finalAccess: { state: 'blocked', setup: false, operations: false },
      rows: { catalogue_item: [] },
    });
    await expect(loadMerchantHomeSource(revoked.client, merchantId)).rejects.toThrow(
      'permissions changed while Home was loading',
    );
    const revised = database({ finalAccess: { ...access(), revision: 3 } });
    await expect(loadMerchantHomeSource(revised.client, merchantId)).rejects.toThrow(
      'permissions changed while Home was loading',
    );
    const current = await loadMerchantHomeSource(database().client, merchantId);
    expect(current.home.revision).toBe(2);
    expect(current.home.summary.catalogue).toMatchObject({ state: 'known', total: 1 });
  });
});
