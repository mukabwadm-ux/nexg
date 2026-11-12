/**
 * A merchant's trading performance over a chosen window, for the
 * Performance section of the merchant page.
 *
 * Read from the orders themselves rather than the nightly health snapshot,
 * so the figures match what the merchant sees on their statement and every
 * number can be traced back to orders. Days and hours are Nairobi time.
 *
 * Definitions, used for the labels on the page too:
 *   - Sales: the item subtotal of orders that were not cancelled, refunded
 *     or disputed. Delivery and service fees are NexG's, not the merchant's.
 *   - Orders: orders placed in the window that were not cancelled.
 *   - On-time ready: orders marked ready by their promised ready time, out of
 *     those that had both.
 *   - Prep time: confirmed to ready, median, in minutes.
 *   - Cancellation rate: cancelled orders out of all orders placed.
 */

export const RANGES = [
  { key: '7d', days: 7, label: '7 days' },
  { key: '30d', days: 30, label: '30 days' },
  { key: '90d', days: 90, label: '90 days' },
] as const;

export type RangeKey = (typeof RANGES)[number]['key'];

export function rangeFrom(value: string | undefined): (typeof RANGES)[number] {
  return RANGES.find((range) => range.key === value) ?? RANGES[1];
}

export interface PerformanceOrder {
  placed_at: string;
  stage: string;
  subtotal_cents: number;
  confirmed_at: string | null;
  ready_at: string | null;
  promised_ready_at: string | null;
  guest_id: string | null;
  order_item:
    | {
        name: string;
        quantity: number;
        line_total_cents: number;
        removed_at: string | null;
      }[]
    | null;
}

export interface PerformanceRating {
  stars: number;
  created_at: string;
}

/** A figure for this window and the one before it. null means no evidence. */
export interface Figure {
  value: number | null;
  previous: number | null;
}

export interface Performance {
  days: number;
  sales: Figure;
  orders: Figure;
  averageOrder: Figure;
  onTimeReady: Figure;
  cancellationRate: Figure;
  prepMinutes: Figure;
  rating: Figure & { count: number };
  repeatGuests: Figure;
  /** One row per Nairobi day in the window, oldest first. */
  daily: { date: string; sales: number; orders: number }[];
  /** Orders by Nairobi hour of day, 0 to 23. */
  byHour: { hour: number; orders: number }[];
  topItems: { name: string; quantity: number; sales: number }[];
  outcomes: { key: 'delivered' | 'in_progress' | 'cancelled'; count: number }[];
  /** Every order placed in the window, cancelled ones included. */
  placedCount: number;
}

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const NOT_SALES = new Set(['cancelled', 'refunded', 'disputed']);
const DONE = new Set(['delivered']);
const STOPPED = new Set(['cancelled', 'refunded']);

/** The Nairobi calendar day of a timestamp, as YYYY-MM-DD. */
export function nairobiDay(at: Date | string): string {
  return new Date(new Date(at).getTime() + NAIROBI_OFFSET_MS).toISOString().slice(0, 10);
}

function nairobiHour(at: string): number {
  return new Date(new Date(at).getTime() + NAIROBI_OFFSET_MS).getUTCHours();
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function windowFigures(orders: PerformanceOrder[], ratings: PerformanceRating[]) {
  const kept = orders.filter((order) => !NOT_SALES.has(order.stage));
  const salesCents = kept.reduce((sum, order) => sum + Number(order.subtotal_cents), 0);
  const cancelled = orders.filter((order) => STOPPED.has(order.stage)).length;

  const timed = orders.filter((order) => order.ready_at && order.promised_ready_at);
  const onTime = timed.filter(
    (order) => new Date(order.ready_at!).getTime() <= new Date(order.promised_ready_at!).getTime(),
  ).length;

  const prep = orders.flatMap((order) =>
    order.confirmed_at && order.ready_at
      ? [(new Date(order.ready_at).getTime() - new Date(order.confirmed_at).getTime()) / 60000]
      : [],
  );

  const guests = new Map<string, number>();
  for (const order of kept) {
    if (order.guest_id) guests.set(order.guest_id, (guests.get(order.guest_id) ?? 0) + 1);
  }
  const returning = [...guests.values()].filter((count) => count > 1).length;

  const stars = ratings.map((rating) => rating.stars);

  return {
    sales: orders.length ? salesCents / 100 : null,
    orders: orders.length ? kept.length : null,
    averageOrder: kept.length ? salesCents / 100 / kept.length : null,
    onTimeReady: timed.length ? (onTime / timed.length) * 100 : null,
    cancellationRate: orders.length ? (cancelled / orders.length) * 100 : null,
    prepMinutes: median(prep.filter((minutes) => minutes >= 0)),
    rating: stars.length ? stars.reduce((a, b) => a + b, 0) / stars.length : null,
    ratingCount: stars.length,
    repeatGuests: guests.size ? (returning / guests.size) * 100 : null,
  };
}

/**
 * Splits orders and ratings into this window and the previous one of the
 * same length, and works out every figure the page shows. `now` is passed
 * in so the result does not depend on the clock.
 */
export function summarise(
  orders: PerformanceOrder[],
  ratings: PerformanceRating[],
  days: number,
  now: Date,
): Performance {
  const today = nairobiDay(now);
  /* The window is whole Nairobi days, today included. */
  const firstDay = nairobiDay(new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * DAY_MS));
  const previousFirstDay = nairobiDay(
    new Date(Date.parse(`${firstDay}T00:00:00Z`) - days * DAY_MS),
  );

  const inWindow = (at: string) => {
    const day = nairobiDay(at);
    return day >= firstDay && day <= today;
  };
  const inPrevious = (at: string) => {
    const day = nairobiDay(at);
    return day >= previousFirstDay && day < firstDay;
  };

  const current = orders.filter((order) => inWindow(order.placed_at));
  const previous = orders.filter((order) => inPrevious(order.placed_at));
  const now_ = windowFigures(
    current,
    ratings.filter((rating) => inWindow(rating.created_at)),
  );
  const before = windowFigures(
    previous,
    ratings.filter((rating) => inPrevious(rating.created_at)),
  );

  const daily = Array.from({ length: days }, (_, index) => ({
    date: nairobiDay(new Date(Date.parse(`${firstDay}T00:00:00Z`) + index * DAY_MS)),
    sales: 0,
    orders: 0,
  }));
  const dayIndex = new Map(daily.map((row, index) => [row.date, index]));
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }));
  const items = new Map<string, { name: string; quantity: number; sales: number }>();
  let delivered = 0;
  let cancelled = 0;

  for (const order of current) {
    byHour[nairobiHour(order.placed_at)]!.orders += 1;
    if (STOPPED.has(order.stage)) {
      cancelled += 1;
      continue;
    }
    if (DONE.has(order.stage)) delivered += 1;
    if (NOT_SALES.has(order.stage)) continue;
    const row = daily[dayIndex.get(nairobiDay(order.placed_at))!];
    if (row) {
      row.orders += 1;
      row.sales += Number(order.subtotal_cents) / 100;
    }
    for (const item of order.order_item ?? []) {
      if (item.removed_at) continue;
      const key = item.name.trim().toLowerCase();
      const entry = items.get(key) ?? { name: item.name.trim(), quantity: 0, sales: 0 };
      entry.quantity += item.quantity;
      entry.sales += Number(item.line_total_cents) / 100;
      items.set(key, entry);
    }
  }

  return {
    days,
    sales: { value: now_.sales, previous: before.sales },
    orders: { value: now_.orders, previous: before.orders },
    averageOrder: { value: now_.averageOrder, previous: before.averageOrder },
    onTimeReady: { value: now_.onTimeReady, previous: before.onTimeReady },
    cancellationRate: { value: now_.cancellationRate, previous: before.cancellationRate },
    prepMinutes: { value: now_.prepMinutes, previous: before.prepMinutes },
    rating: { value: now_.rating, previous: before.rating, count: now_.ratingCount },
    repeatGuests: { value: now_.repeatGuests, previous: before.repeatGuests },
    daily,
    byHour,
    topItems: [...items.values()]
      .sort((a, b) => b.sales - a.sales || b.quantity - a.quantity)
      .slice(0, 5),
    outcomes: [
      { key: 'delivered', count: delivered },
      { key: 'in_progress', count: current.length - delivered - cancelled },
      { key: 'cancelled', count: cancelled },
    ],
    placedCount: current.length,
  };
}

/** The change from the previous window, in percent. null when either side is missing. */
export function change(figure: Figure): number | null {
  if (figure.value === null || figure.previous === null || figure.previous === 0) return null;
  return ((figure.value - figure.previous) / Math.abs(figure.previous)) * 100;
}
