import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as actions from './actions';
import { MerchantAccessError } from '../../lib/merchant-access';

const mock = vi.hoisted(() => ({ requireMerchant: vi.fn(), createClient: vi.fn() }));
vi.mock('../../lib/partner', () => ({ requireMerchant: mock.requireMerchant }));
vi.mock('../../lib/supabase/server', () => ({ createClient: mock.createClient }));
vi.mock('next/cache', () => ({ revalidatePath() {} }));
const input = {
  merchantId: 'merchant-1',
  branchId: null,
  name: 'Example',
  priceKes: 50,
  body: 'Help',
  topic: 'account',
  page: '/merchant',
  branches: [],
  caps: {},
  userId: 'user-1',
};
const invocations: [string, () => Promise<unknown>][] = [
  ['setAcceptingOrders', () => actions.setAcceptingOrders('merchant-1', true, '')],
  ['setBusyMode', () => actions.setBusyMode('merchant-1', 10, '')],
  ['setPrep', () => actions.setPrep('merchant-1', 10, null)],
  ['addStore', () => actions.addStore(input as never)],
  ['renameStore', () => actions.renameStore('branch-1', 'Example', '')],
  ['closeStore', () => actions.closeStore('branch-1', '')],
  ['requestFeatured', () => actions.requestFeatured(input as never)],
  ['withdrawFeatured', () => actions.withdrawFeatured('featured-1')],
  ['markMessagesRead', () => actions.markMessagesRead('merchant-1')],
  ['setItemAvailable', () => actions.setItemAvailable('item-1', true)],
  ['setItemPrice', () => actions.setItemPrice('item-1', 50)],
  [
    'addMenuItems',
    () =>
      actions.addMenuItems({
        merchantId: 'merchant-1',
        items: [{ name: 'Example', priceKes: 50 }],
      }),
  ],
  ['removeMenuItem', () => actions.removeMenuItem('item-1')],
  ['saveBranch', () => actions.saveBranch(input as never)],
  ['pauseBranch', () => actions.pauseBranch('branch-1', '')],
  ['resumeBranch', () => actions.resumeBranch('branch-1')],
  ['deleteBranch', () => actions.deleteBranch('branch-1', 'Example')],
  ['inviteMember', () => actions.inviteMember(input as never)],
  ['updateMember', () => actions.updateMember(input as never)],
  ['removeMember', () => actions.removeMember('merchant-1', 'user-1')],
  ['revokeInvite', () => actions.revokeInvite('invite-1')],
  ['setHours', () => actions.setHours(input as never)],
  ['copyHours', () => actions.copyHours('merchant-1', null, 'branch-1')],
  ['setOverride', () => actions.setOverride(input as never)],
  ['replyToReview', () => actions.replyToReview('rating-1', 'Thanks')],
  ['replyToDispute', () => actions.replyToDispute('dispute-1', 'Reply')],
  ['acceptDispute', () => actions.acceptDispute('dispute-1')],
  ['saveMerchantSettings', () => actions.saveMerchantSettings('merchant-1', {})],
  ['openTicket', () => actions.openTicket(input)],
];

beforeEach(() => {
  mock.requireMerchant.mockReset();
  mock.createClient.mockReset();
});
describe('direct merchant server actions', () => {
  it.each(invocations)('guards %s before its owner write', async (_name, invoke) => {
    mock.requireMerchant.mockRejectedValue(new MerchantAccessError('Access unavailable.', 503));
    await expect(invoke()).rejects.toMatchObject({ status: 503, message: 'Access unavailable.' });
    expect(mock.createClient).not.toHaveBeenCalled();
  });

  it('allows pending owner support while preserving the server-authenticated shell check', async () => {
    mock.requireMerchant.mockImplementation(async (options) => {
      if (options.access !== 'shell') throw new MerchantAccessError('Approval required.', 403);
      return { id: 'merchant-1', access: { state: 'pending', setup: true, operations: false } };
    });
    mock.createClient.mockReturnValue({
      rpc: async () => ({ data: { ok: true, reference: 'SUP-1' }, error: null }),
    });
    await expect(actions.openTicket(input)).resolves.toMatchObject({
      ok: true,
      data: { reference: 'SUP-1' },
    });
    await expect(actions.setAcceptingOrders('merchant-1', true, '')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('updates only catalogue rows in the authorized workspace and reports foreign item IDs', async () => {
    mock.requireMerchant.mockResolvedValue({
      id: 'merchant-1',
      access: { state: 'pending', setup: true, operations: false },
    });
    const rows = [
      { id: 'own', merchant_id: 'merchant-1', price_kes: 10 },
      { id: 'foreign', merchant_id: 'merchant-2', price_kes: 20 },
    ];
    mock.createClient.mockReturnValue({
      from: () => {
        let patch: Record<string, unknown> = {};
        const filters: Record<string, unknown> = {};
        const query = {
          update(value: Record<string, unknown>) {
            patch = value;
            return query;
          },
          eq(key: string, value: unknown) {
            filters[key] = value;
            return query;
          },
          select: () => query,
          async maybeSingle() {
            const row = rows.find((row) =>
              Object.entries(filters).every(
                ([key, value]) => row[key as keyof typeof row] === value,
              ),
            );
            if (row) Object.assign(row, patch);
            return { data: row ? { id: row.id } : null, error: null };
          },
        };
        return query;
      },
    });
    await expect(actions.setItemPrice('own', 50)).resolves.toMatchObject({ ok: true });
    await expect(actions.setItemPrice('foreign', 99)).resolves.toEqual({
      ok: false,
      message: 'This item is not in your current workspace.',
    });
    expect(rows).toEqual([
      { id: 'own', merchant_id: 'merchant-1', price_kes: 50 },
      { id: 'foreign', merchant_id: 'merchant-2', price_kes: 20 },
    ]);
  });

  it('adds multiple products with photos only to a section belonging to the authorized merchant', async () => {
    mock.requireMerchant.mockResolvedValue({
      id: 'merchant-1',
      access: { state: 'pending', setup: true, operations: false },
    });
    const saved: Record<string, unknown>[] = [];
    mock.createClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'catalogue_item')
          return {
            insert: async (items: Record<string, unknown>[]) => {
              saved.push(...items);
              return { error: null };
            },
          };
        const filters: Record<string, unknown> = {};
        const query = {
          select: () => query,
          eq(key: string, value: unknown) {
            filters[key] = value;
            return query;
          },
          maybeSingle: async () => ({
            data:
              filters.id === 'section-1' && filters.merchant_id === 'merchant-1'
                ? { id: 'section-1' }
                : null,
            error: null,
          }),
        };
        return query;
      },
    });
    const result = await actions.addMenuItems({
      merchantId: 'merchant-1',
      sectionId: 'section-1',
      items: [
        {
          name: ' Coffee ',
          priceKes: 50,
          photoPath: 'merchant-1/12345678-1234-1234-1234-123456789abc.jpg',
        },
        { name: 'Tea', description: 'Hot', priceKes: 30, ageRestricted: false },
      ],
    });
    expect(result).toEqual({ ok: true, message: '2 products added to your catalogue.' });
    expect(saved).toEqual([
      {
        name: 'Coffee',
        description: null,
        price_kes: 50,
        age_restricted: false,
        photo_path: 'merchant-1/12345678-1234-1234-1234-123456789abc.jpg',
        merchant_id: 'merchant-1',
        section_id: 'section-1',
      },
      {
        name: 'Tea',
        description: 'Hot',
        price_kes: 30,
        age_restricted: false,
        photo_path: null,
        merchant_id: 'merchant-1',
        section_id: 'section-1',
      },
    ]);
    await expect(
      actions.addMenuItems({
        merchantId: 'merchant-1',
        sectionId: 'foreign',
        items: [{ name: 'Tea', priceKes: 30 }],
      }),
    ).resolves.toEqual({ ok: false, message: 'Choose a section from this business.' });
    expect(saved).toHaveLength(2);
  });

  it('binds hours branch IDs to the current workspace before calling the existing owner command', async () => {
    mock.requireMerchant.mockResolvedValue({
      id: 'merchant-1',
      access: { state: 'pending', setup: true, operations: false },
    });
    const saved: string[] = [];
    mock.createClient.mockReturnValue({
      from: () => {
        const filters: Record<string, unknown> = {};
        const query = {
          select: () => query,
          eq(key: string, value: unknown) {
            filters[key] = value;
            return query;
          },
          maybeSingle: async () => ({
            data:
              filters.id === 'own' && filters.merchant_id === 'merchant-1' ? { id: 'own' } : null,
            error: null,
          }),
        };
        return query;
      },
      rpc: async (_name: string, payload: { p_branch_id: string }) => {
        saved.push(payload.p_branch_id);
        return { data: { ok: true }, error: null };
      },
    });
    await expect(
      actions.setHours({ ...input, branchId: 'foreign' } as never),
    ).rejects.toMatchObject({ status: 403 });
    await expect(actions.setHours({ ...input, branchId: 'own' } as never)).resolves.toMatchObject({
      ok: true,
    });
    expect(saved).toEqual(['own']);
  });
});
