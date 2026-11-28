import { ToastProvider } from '@nexg/ui';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { parseHistory, parseOverrides, parseOverview } from '@/lib/category-commissions';

import { CategoriesScreen, HistoryTable, OverridesTable } from './screen';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => '/settings/categories',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/app/settings/categories/actions', () => ({
  saveCategory: vi.fn(),
  addCategory: vi.fn(),
  decideRate: vi.fn(),
  withdrawRate: vi.fn(),
  importCategories: vi.fn(),
}));
vi.mock('@/components/idle-timer', () => ({ stillSignedIn: async () => true }));

const overview = parseOverview({
  today: '2026-11-28',
  overrides_in_force: 1,
  presets: { own_delivery_pct: 14, nexg_delivery_pct: 28, standard_pct: 14, vat_pct: 16 },
  can_edit: true,
  can_decide: true,
  can_add: true,
  categories: [
    {
      category: 'alcohol_beverages',
      label: 'Alcohol & Beverages',
      is_active: true,
      subcategories: [
        { id: 'wines_champagne', name: 'Wines & Champagne' },
        { id: 'spirits', name: 'Whisky, Vodka, Gin, Rum & Tequila' },
        { id: 'beer', name: 'Beer & Cider' },
        { id: 'cocktails_mocktails', name: 'Cocktails & Mocktails' },
      ],
      rate_group: 'Alcohol & Beverages',
      band_min_pct: 12,
      band_max_pct: 15,
      fulfilment_methods: ['delivery', 'pickup'],
      approval: 'two_person',
      merchant_overrides: true,
      rate: {
        id: 'r1',
        pct: 15,
        nexg_delivery_pct: null,
        vat_treatment: 'inclusive',
        starts_on: '2026-11-28',
        ends_on: null,
      },
      pending: {
        id: 'p1',
        pct: 13,
        nexg_delivery_pct: null,
        vat_treatment: 'inclusive',
        starts_on: '2026-12-01',
        ends_on: null,
        reason: 'Launch push',
        requested_by: 'Ops One',
        requested_at: '2026-11-28T08:00:00Z',
        mine: false,
      },
      merchants: 3,
      overrides: 1,
    },
    {
      category: 'restaurants_food',
      label: 'Food & Restaurant',
      is_active: true,
      subcategories: [],
      fulfilment_methods: ['delivery', 'pickup', 'dine_in'],
      rate: null,
    },
  ],
})!;

describe('CategoriesScreen', () => {
  it('lists every category with its rate, VAT, status and the editor for the first', () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <CategoriesScreen overview={overview} history={[]} overrides={[]} focus={null} />
      </ToastProvider>,
    );
    expect(html).toContain('Alcohol &amp; Beverages');
    expect(html).toContain('15.00%');
    expect(html).toContain('13.00% waiting');
    expect(html).toContain('VAT Inclusive');
    // Food has no category rate: the preset, said so.
    expect(html).toContain('14.00%');
    expect(html).toContain('preset');
    expect(html).toContain('Edit Category');
    expect(html).toContain('Band 12–15%');
    expect(html).toContain('Waiting for approval');
    expect(html).toContain('Manage Overrides (1)');
    expect(html).toContain('Showing 1 – 2 of 2 categories');
  });
});

describe('the other tabs', () => {
  it('shows merchant overrides against their category rate', () => {
    const html = renderToStaticMarkup(
      <OverridesTable
        focus={null}
        rows={parseOverrides([
          {
            merchant_id: 'm1',
            merchant: 'Bar Three',
            category: 'alcohol_beverages',
            category_label: 'Alcohol & Beverages',
            own_delivery_pct: 9,
            nexg_delivery_pct: null,
            starts_on: '2026-11-28',
            status: 'in_force',
            category_pct: 15,
            charged_pct: 9,
            overrides_allowed: true,
          },
        ])}
      />,
    );
    expect(html).toContain('Bar Three');
    expect(html).toContain('9.00%');
    expect(html).toContain('In force');
  });

  it('shows each change with its old and new value and who made it', () => {
    const html = renderToStaticMarkup(
      <HistoryTable
        focus={null}
        categories={overview.categories}
        rows={parseHistory([
          {
            id: 1,
            category: 'alcohol_beverages',
            label: 'Alcohol & Beverages',
            action: 'rate_approved',
            before: { pct: 15 },
            after: { pct: 13 },
            reason: 'Launch push',
            actor: 'Finance One',
            at: '2026-11-28T09:00:00Z',
          },
        ])}
      />,
    );
    expect(html).toContain('Rate approved');
    expect(html).toContain('15%');
    expect(html).toContain('13%');
    expect(html).toContain('Finance One');
  });
});
