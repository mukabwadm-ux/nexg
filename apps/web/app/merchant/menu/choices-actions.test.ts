import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ rpc: vi.fn(), update: vi.fn() }));

vi.mock('next/cache', () => ({ revalidatePath() {} }));
vi.mock('@/lib/merchant-action-access', () => ({
  async merchantActionClient() {
    const query = {
      update: (values: unknown) => {
        mock.update(values);
        return query;
      },
      eq: () => query,
      select: () => query,
      maybeSingle: async () => ({ data: { id: 'x' }, error: null }),
    };
    return { merchantId: 'merchant-1', client: { from: () => query, rpc: mock.rpc } };
  },
}));

import {
  saveItemVariants,
  saveOptionGroup,
  setItemOptionGroups,
  setItemUnit,
} from './choices-actions';

const item = '11111111-2222-4333-8444-555555555555';

beforeEach(() => {
  mock.rpc.mockReset().mockResolvedValue({ data: { ok: true }, error: null });
  mock.update.mockReset();
});

describe('Menu choices and units', () => {
  it('saves a group with prices in cents for the current shop', async () => {
    const r = await saveOptionGroup({
      name: ' Size ',
      required: true,
      maxChoices: 5,
      options: [
        { name: 'Small', extraKes: 0, available: true },
        { name: 'Large', extraKes: 150, available: true },
        { name: '', extraKes: 0, available: true },
      ],
    });
    expect(r.ok).toBe(true);
    expect(mock.rpc).toHaveBeenCalledWith('rpc_merchant_option_group_save', {
      p_merchant_id: 'merchant-1',
      p_group: {
        name: 'Size',
        required: true,
        min_choices: 1,
        max_choices: 2,
        archived: false,
        options: [
          { name: 'Small', extra_cents: 0, available: true },
          { name: 'Large', extra_cents: 15000, available: true },
        ],
      },
    });
  });

  it('refuses a group with no options or a negative price', async () => {
    expect(
      (await saveOptionGroup({ name: 'X', required: false, maxChoices: 1, options: [] })).ok,
    ).toBe(false);
    expect(
      (
        await saveOptionGroup({
          name: 'X',
          required: false,
          maxChoices: 1,
          options: [{ name: 'A', extraKes: -5, available: true }],
        })
      ).ok,
    ).toBe(false);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('puts groups on an item', async () => {
    const g = '22222222-2222-4333-8444-555555555555';
    expect((await setItemOptionGroups(item, [g])).ok).toBe(true);
    expect(mock.rpc).toHaveBeenCalledWith('rpc_merchant_item_option_groups_set', {
      p_item_id: item,
      p_group_ids: [g],
    });
  });

  it('saves a weighed unit and needs its label', async () => {
    const unit = {
      soldBy: 'weight' as const,
      unitLabel: 'kg',
      unitStep: 0.5,
      unitMin: 0.5,
      unitMax: 3,
      priceIsEstimate: true,
    };
    expect((await setItemUnit(item, { ...unit, unitLabel: '' })).ok).toBe(false);
    expect((await setItemUnit(item, unit)).ok).toBe(true);
    expect(mock.update).toHaveBeenCalledWith({
      sold_by: 'weight',
      unit_label: 'kg',
      unit_step: 0.5,
      unit_min: 0.5,
      unit_max: 3,
      price_is_estimate: true,
    });
  });

  it('saves a size and colour grid, dropping empty values and cells for unknown pairs', async () => {
    const r = await saveItemVariants(item, {
      attributes: [
        { name: ' Size ', values: ['40', ' 41', '', '40'] },
        { name: 'Colour', values: ['Black'] },
      ],
      variants: [
        { values: ['40', 'Black'], priceKes: 3000, available: true, stockCount: null },
        { values: ['41', 'Black'], priceKes: 3100, available: false, stockCount: 2 },
        { values: ['40'], priceKes: 1, available: true, stockCount: null },
      ],
    });
    expect(r.ok).toBe(true);
    expect(mock.rpc).toHaveBeenCalledWith('rpc_merchant_item_variants_save', {
      p_item_id: item,
      p_payload: {
        attributes: [
          { name: 'Size', values: ['40', '41'] },
          { name: 'Colour', values: ['Black'] },
        ],
        variants: [
          {
            values: ['40', 'Black'],
            price_kes: 3000,
            available: true,
            stock_count: null,
            sku: null,
          },
          { values: ['41', 'Black'], price_kes: 3100, available: false, stock_count: 2, sku: null },
        ],
      },
    });
  });

  it('refuses fractional prices and turns versions off with empty lists', async () => {
    const bad = await saveItemVariants(item, {
      attributes: [{ name: 'Size', values: ['S'] }],
      variants: [{ values: ['S'], priceKes: 9.5, available: true, stockCount: null }],
    });
    expect(bad.ok).toBe(false);
    expect(mock.rpc).not.toHaveBeenCalled();
    const off = await saveItemVariants(item, { attributes: [], variants: [] });
    expect(off.message).toBe('Versions turned off for this item.');
    expect(mock.rpc).toHaveBeenCalledWith('rpc_merchant_item_variants_save', {
      p_item_id: item,
      p_payload: { attributes: [], variants: [] },
    });
  });
});
