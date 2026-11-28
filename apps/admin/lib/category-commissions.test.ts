import { describe, expect, it } from 'vitest';

import {
  averageRate,
  band,
  changes,
  chargedWithVat,
  exportRows,
  outsideBand,
  parseOverview,
  parsePct,
  planImport,
  readCsv,
  stepPct,
  type CategoryRow,
} from './category-commissions';

const overviewData = {
  today: '2026-11-28',
  overrides_in_force: 2,
  presets: { own_delivery_pct: 14, nexg_delivery_pct: '28', standard_pct: 14, vat_pct: 16 },
  can_edit: true,
  can_decide: false,
  can_add: true,
  categories: [
    {
      category: 'alcohol_beverages',
      label: 'Alcohol & Beverages',
      is_active: true,
      subcategories: [{ id: 'beer', name: 'Beer & Cider' }, { id: 'spirits' }],
      rate_group: 'Alcohol & Beverages',
      band_min_pct: '12.00',
      band_max_pct: 15,
      fulfilment_methods: ['delivery', 'pickup', 'teleport'],
      approval: 'two_person',
      merchant_overrides: true,
      rate: {
        id: 'r1',
        pct: '15.00',
        nexg_delivery_pct: null,
        vat_treatment: 'inclusive',
        starts_on: '2026-11-28',
        ends_on: null,
      },
      next_rate: null,
      pending: {
        id: 'p1',
        pct: 13,
        nexg_delivery_pct: 25,
        vat_treatment: 'inclusive',
        starts_on: '2026-12-01',
        ends_on: null,
        reason: 'Launch',
        requested_by: 'Ops',
        requested_at: '2026-11-28T08:00:00Z',
        mine: true,
      },
      merchants: 4,
      overrides: 1,
    },
    {
      category: 'restaurants_food',
      label: 'Food & Restaurant',
      is_active: true,
      subcategories: [],
      rate_group: null,
      band_min_pct: null,
      band_max_pct: null,
      fulfilment_methods: ['delivery'],
      approval: 'single',
      merchant_overrides: false,
      rate: null,
    },
    { category: 'flights', label: 'Flights', is_active: false, rate: null },
    { label: 'no code' },
  ],
};

const overview = parseOverview(overviewData)!;
const [alcohol, food] = overview.categories as [CategoryRow, CategoryRow];

describe('parseOverview', () => {
  it('reads categories, rates and presets defensively', () => {
    expect(overview.categories).toHaveLength(3);
    expect(alcohol.rate?.pct).toBe(15);
    expect(alcohol.band_min_pct).toBe(12);
    expect(alcohol.subcategories).toEqual([
      { id: 'beer', name: 'Beer & Cider' },
      { id: 'spirits', name: 'spirits' },
    ]);
    expect(alcohol.fulfilment_methods).toEqual(['delivery', 'pickup']);
    expect(alcohol.pending?.mine).toBe(true);
    expect(food.approval).toBe('single');
    expect(food.merchant_overrides).toBe(false);
    expect(overview.presets.nexg_delivery_pct).toBe(28);
    expect(overview.can_decide).toBe(false);
  });

  it('answers null for something that is not an object', () => {
    expect(parseOverview(null)).toBeNull();
    expect(parseOverview([])).toBeNull();
  });
});

describe('rates', () => {
  it('writes the band', () => {
    expect(band(alcohol)).toBe('12–15%');
    expect(band(food)).toBeNull();
  });

  it('knows when a rate is outside its band', () => {
    expect(outsideBand(11, alcohol)).toBe(true);
    expect(outsideBand(15.5, alcohol)).toBe(true);
    expect(outsideBand(13, alcohol)).toBe(false);
    expect(outsideBand(40, food)).toBe(false);
  });

  it('averages today’s rate over active categories, the preset where there is no rate', () => {
    // Alcohol 15 and Food on the 14 preset; Flights is switched off.
    expect(averageRate(overview.categories, overview.presets)).toBe(14.5);
  });

  it('adds VAT to a VAT-exclusive rate, as pricing does', () => {
    expect(chargedWithVat(15, 'exclusive', 16)).toBe(17.4);
    expect(chargedWithVat(10, 'exclusive', 16)).toBe(11.6);
    expect(chargedWithVat(15, 'inclusive', 16)).toBe(15);
  });

  it('parses and steps a typed rate', () => {
    expect(parsePct('12.5%')).toEqual({ ok: true, value: 12.5 });
    expect(parsePct('')).toEqual({ ok: true, value: null });
    expect(parsePct('101')).toEqual({ ok: false });
    expect(parsePct('9.555')).toEqual({ ok: false });
    expect(stepPct('14.00', 0.25)).toBe('14.25');
    expect(stepPct('0.1', -0.25)).toBe('0.00');
    expect(stepPct('99.9', 0.25)).toBe('100.00');
  });
});

describe('change history', () => {
  it('lists each changed field with its old and new value', () => {
    expect(
      changes({
        before: { band_min_pct: 12, fulfilment_methods: ['delivery'] },
        after: { band_min_pct: 11, fulfilment_methods: ['delivery', 'pickup'] },
      }),
    ).toEqual([
      { field: 'Band from', before: '12%', after: '11%' },
      { field: 'Fulfilment', before: 'Delivery', after: 'Delivery, Pickup' },
    ]);
  });

  it('shows a first rate with no old value', () => {
    expect(changes({ before: null, after: { pct: 15, vat_treatment: 'inclusive' } })).toEqual([
      { field: 'Commission', before: '—', after: '15%' },
      { field: 'VAT', before: '—', after: 'VAT inclusive' },
    ]);
  });
});

describe('import and export', () => {
  it('reads quoted CSV with a BOM and CRLF', () => {
    const bom = String.fromCharCode(0xfeff);
    expect(readCsv(bom + 'code,name\r\nbeauty,"Beauty, ""Cosmetics"""\r\n\r\n')).toEqual([
      ['code', 'name'],
      ['beauty', 'Beauty, "Cosmetics"'],
    ]);
  });

  it('round-trips the export without changes', () => {
    const csv = exportRows(overview.categories)
      .map((r) => r.map((c) => (c === null ? '' : `"${String(c)}"`)).join(','))
      .join('\n');
    expect(planImport(csv, overview.categories, '2026-11-28')).toEqual({ changes: [], errors: [] });
  });

  it('keeps only what changes, with the rate from the chosen day', () => {
    const csv = [
      'code,name,commission_pct,vat_treatment,fulfilment,active',
      'alcohol_beverages,Alcohol & Beverages,14,exclusive,delivery,yes',
      'restaurants_food,Food & Restaurant,,,delivery,no',
    ].join('\n');
    const plan = planImport(csv, overview.categories, '2026-12-01');
    expect(plan.errors).toEqual([]);
    expect(plan.changes).toEqual([
      {
        category: 'alcohol_beverages',
        label: 'Alcohol & Beverages',
        payload: {
          fulfilment_methods: ['delivery'],
          rate: {
            pct: 14,
            nexg_delivery_pct: null,
            vat_treatment: 'exclusive',
            starts_on: '2026-12-01',
            ends_on: null,
          },
        },
        summary: ['Fulfilment → delivery', 'Commission 15.00% → 14.00% from 2026-12-01'],
      },
      {
        category: 'restaurants_food',
        label: 'Food & Restaurant',
        payload: { is_active: false },
        summary: ['Switched off'],
      },
    ]);
  });

  it('refuses unknown codes and bad values rather than guessing', () => {
    const csv = [
      'code,commission_pct,fulfilment',
      'pets,12,delivery',
      'alcohol_beverages,120,teleport',
    ].join('\n');
    const plan = planImport(csv, overview.categories, '2026-11-28');
    expect(plan.changes).toEqual([]);
    expect(plan.errors).toEqual([
      'Line 2: no category with the code "pets". Add it first.',
      'Line 3: unknown fulfilment teleport.',
      'Line 3: a rate is a percentage from 0 to 100, two decimals at most.',
    ]);
  });
});
