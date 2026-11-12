import { describe, expect, it } from 'vitest';

import {
  change,
  nairobiDay,
  rangeFrom,
  summarise,
  type PerformanceOrder,
} from './merchant-performance';

const NOW = new Date('2026-11-12T09:00:00Z'); // 12:00 in Nairobi

function order(overrides: Partial<PerformanceOrder>): PerformanceOrder {
  return {
    placed_at: '2026-11-12T08:00:00Z',
    stage: 'delivered',
    subtotal_cents: 100_000,
    confirmed_at: null,
    ready_at: null,
    promised_ready_at: null,
    guest_id: null,
    order_item: [],
    ...overrides,
  };
}

describe('nairobiDay', () => {
  it('rolls over at midnight Nairobi time, not UTC', () => {
    expect(nairobiDay('2026-11-11T20:59:00Z')).toBe('2026-11-11');
    expect(nairobiDay('2026-11-11T21:00:00Z')).toBe('2026-11-12');
  });
});

describe('rangeFrom', () => {
  it('falls back to 30 days for anything unknown', () => {
    expect(rangeFrom('7d').days).toBe(7);
    expect(rangeFrom('nonsense').days).toBe(30);
    expect(rangeFrom(undefined).days).toBe(30);
  });
});

describe('summarise', () => {
  it('reports no evidence, not zero, when there are no orders', () => {
    const result = summarise([], [], 7, NOW);
    expect(result.sales.value).toBeNull();
    expect(result.orders.value).toBeNull();
    expect(result.onTimeReady.value).toBeNull();
    expect(result.daily).toHaveLength(7);
    expect(result.daily.at(-1)!.date).toBe('2026-11-12');
  });

  it('counts sales from the item subtotal and leaves cancelled orders out', () => {
    const result = summarise(
      [
        order({ subtotal_cents: 150_000 }),
        order({ subtotal_cents: 50_000, stage: 'preparing' }),
        order({ subtotal_cents: 999_900, stage: 'cancelled' }),
      ],
      [],
      7,
      NOW,
    );
    expect(result.sales.value).toBe(2000);
    expect(result.orders.value).toBe(2);
    expect(result.averageOrder.value).toBe(1000);
    expect(result.cancellationRate.value).toBeCloseTo(33.33, 1);
    expect(result.outcomes).toEqual([
      { key: 'delivered', count: 1 },
      { key: 'in_progress', count: 1 },
      { key: 'cancelled', count: 1 },
    ]);
  });

  it('compares with the window before, of the same length', () => {
    const result = summarise(
      [
        order({ placed_at: '2026-11-12T08:00:00Z', subtotal_cents: 300_000 }),
        order({ placed_at: '2026-11-03T08:00:00Z', subtotal_cents: 200_000 }),
        order({ placed_at: '2026-10-01T08:00:00Z', subtotal_cents: 900_000 }),
      ],
      [],
      7,
      NOW,
    );
    expect(result.sales).toEqual({ value: 3000, previous: 2000 });
    expect(change(result.sales)).toBe(50);
  });

  it('works out on-time ready, prep time and top items', () => {
    const result = summarise(
      [
        order({
          confirmed_at: '2026-11-12T08:00:00Z',
          ready_at: '2026-11-12T08:20:00Z',
          promised_ready_at: '2026-11-12T08:25:00Z',
          order_item: [
            { name: 'Pilau', quantity: 2, line_total_cents: 80_000, removed_at: null },
            { name: 'Chai', quantity: 1, line_total_cents: 20_000, removed_at: null },
          ],
        }),
        order({
          confirmed_at: '2026-11-12T08:00:00Z',
          ready_at: '2026-11-12T08:40:00Z',
          promised_ready_at: '2026-11-12T08:25:00Z',
          order_item: [
            { name: 'pilau ', quantity: 1, line_total_cents: 40_000, removed_at: null },
            {
              name: 'Removed',
              quantity: 9,
              line_total_cents: 900_000,
              removed_at: NOW.toISOString(),
            },
          ],
        }),
      ],
      [],
      7,
      NOW,
    );
    expect(result.onTimeReady.value).toBe(50);
    expect(result.prepMinutes.value).toBe(30);
    expect(result.topItems).toEqual([
      { name: 'Pilau', quantity: 3, sales: 1200 },
      { name: 'Chai', quantity: 1, sales: 200 },
    ]);
    expect(result.byHour[11]!.orders).toBe(2);
  });

  it('averages ratings in the window only', () => {
    const result = summarise(
      [order({})],
      [
        { stars: 5, created_at: '2026-11-12T08:00:00Z' },
        { stars: 3, created_at: '2026-11-11T08:00:00Z' },
        { stars: 1, created_at: '2026-09-01T08:00:00Z' },
      ],
      7,
      NOW,
    );
    expect(result.rating.value).toBe(4);
    expect(result.rating.count).toBe(2);
  });
});
