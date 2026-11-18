import { categoryGroup, type CategoryGroup } from '@/lib/merchant-categories';

/**
 * Merchants → Performance: the shape rpc_merchant_performance returns and
 * what the page works out from it. Money arrives in cents; the page shows
 * whole shillings. Pure, so it is tested on its own.
 */

export interface Pair {
  now: number;
  before: number;
}

export interface PerfMerchant {
  id: string;
  name: string;
  category_key: string;
  category_label: string;
  photo_path: string | null;
  gmv: number;
  commission: number;
  orders: number;
  prev_gmv: number;
  rating: number | null;
  ratings: number;
}

export interface Performance {
  kpis: {
    gmv: Pair;
    commission: Pair;
    orders: Pair;
    active: Pair;
    rating: { now: number | null; before: number | null; count: number };
  };
  series: { day: string; gmv: number; commission: number }[];
  categories: { key: string; label: string; gmv: number; commission: number; prev_gmv: number }[];
  merchants: PerfMerchant[];
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string' && v.trim() && Number.isFinite(Number(v))
      ? Number(v)
      : null;
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const pair = (v: unknown): Pair => ({ now: num(obj(v).now) ?? 0, before: num(obj(v).before) ?? 0 });

export function parsePerformance(data: unknown): Performance {
  const d = obj(data);
  const k = obj(d.kpis);
  const r = obj(k.rating);
  return {
    kpis: {
      gmv: pair(k.gmv),
      commission: pair(k.commission),
      orders: pair(k.orders),
      active: pair(k.active),
      rating: { now: num(r.now), before: num(r.before), count: num(r.count) ?? 0 },
    },
    series: arr(d.series).map((raw) => {
      const s = obj(raw);
      return { day: String(s.day ?? ''), gmv: num(s.gmv) ?? 0, commission: num(s.commission) ?? 0 };
    }),
    categories: arr(d.categories).map((raw) => {
      const c = obj(raw);
      return {
        key: String(c.key ?? 'other'),
        label: String(c.label ?? 'Other'),
        gmv: num(c.gmv) ?? 0,
        commission: num(c.commission) ?? 0,
        prev_gmv: num(c.prev_gmv) ?? 0,
      };
    }),
    merchants: arr(d.merchants).map((raw) => {
      const m = obj(raw);
      return {
        id: String(m.id ?? ''),
        name: String(m.name ?? 'Unnamed merchant'),
        category_key: String(m.category_key ?? 'other'),
        category_label: String(m.category_label ?? 'Other'),
        photo_path: typeof m.photo_path === 'string' ? m.photo_path : null,
        gmv: num(m.gmv) ?? 0,
        commission: num(m.commission) ?? 0,
        orders: num(m.orders) ?? 0,
        prev_gmv: num(m.prev_gmv) ?? 0,
        rating: num(m.rating),
        ratings: num(m.ratings) ?? 0,
      };
    }),
  };
}

/** Percentage change, one decimal; null when there was nothing before. */
export function change(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) * 1000) / before) / 10;
}

/** Whole shillings from cents. */
export const kes = (cents: number) => Math.round(cents / 100);

export const money = (cents: number) => `KES ${kes(cents).toLocaleString('en-KE')}`;

/** "KES 18.42M", "KES 950K", for tight spots. */
export function moneyShort(cents: number): string {
  const k = kes(cents);
  if (Math.abs(k) >= 1_000_000) return `KES ${(k / 1_000_000).toFixed(2)}M`;
  if (Math.abs(k) >= 10_000) return `KES ${Math.round(k / 1_000).toLocaleString('en-KE')}K`;
  return `KES ${k.toLocaleString('en-KE')}`;
}

export const GROUP_LABEL: Record<Exclude<CategoryGroup, 'all'>, string> = {
  food: 'Food',
  stays: 'Stays',
  groceries: 'Groceries',
  apparel: 'Apparel',
  experiences: 'Experiences',
  services: 'Services',
  more: 'Other',
};

/** The category table in the design: Food, Groceries, Apparel, Experiences, Services, then Other. */
export function byGroup(categories: Performance['categories']) {
  const order: Exclude<CategoryGroup, 'all' | 'stays'>[] = [
    'food',
    'groceries',
    'apparel',
    'experiences',
    'services',
    'more',
  ];
  const sums = new Map(order.map((g) => [g, { gmv: 0, commission: 0, prev: 0 }]));
  for (const c of categories) {
    const s = sums.get(categoryGroup(c.key))!;
    s.gmv += c.gmv;
    s.commission += c.commission;
    s.prev += c.prev_gmv;
  }
  return order
    .map((g) => ({
      group: g,
      label: GROUP_LABEL[g],
      ...sums.get(g)!,
      growth: change(sums.get(g)!.gmv, sums.get(g)!.prev),
    }))
    .filter((r) => r.group !== 'more' || r.gmv > 0 || r.prev > 0);
}

export type Board = 'sales' | 'orders' | 'growth' | 'rated';

export function isBoard(value: unknown): value is Board {
  return value === 'sales' || value === 'orders' || value === 'growth' || value === 'rated';
}

/** The five at the top of a leaderboard tab. */
export function leaderboard(merchants: PerfMerchant[], board: Board): PerfMerchant[] {
  const list = [...merchants];
  if (board === 'orders')
    return list
      .filter((m) => m.orders > 0)
      .sort((a, b) => b.orders - a.orders || b.gmv - a.gmv)
      .slice(0, 5);
  if (board === 'growth')
    return list
      .filter((m) => m.prev_gmv > 0)
      .sort((a, b) => (change(b.gmv, b.prev_gmv) ?? 0) - (change(a.gmv, a.prev_gmv) ?? 0))
      .slice(0, 5);
  if (board === 'rated')
    return list
      .filter((m) => m.rating != null)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 5);
  return list.filter((m) => m.gmv > 0).slice(0, 5);
}

/** Three plain sentences from the figures, or fewer when there is nothing to say. */
export function insights(p: Performance): string[] {
  const out: string[] = [];
  const groups = byGroup(p.categories).filter((g) => g.gmv > 0);
  const lead = [...groups].sort((a, b) => b.gmv - a.gmv)[0];
  if (lead) {
    out.push(
      lead.growth == null
        ? `${lead.label} led sales with ${moneyShort(lead.gmv)}; there were no sales the period before to compare.`
        : `${lead.label} sales ${lead.growth >= 0 ? 'up' : 'down'} ${Math.abs(lead.growth)}% (${moneyShort(lead.gmv)}).`,
    );
  }
  const orders = change(p.kpis.orders.now, p.kpis.orders.before);
  if (p.kpis.orders.now > 0 || p.kpis.orders.before > 0) {
    out.push(
      orders == null
        ? `${p.kpis.orders.now.toLocaleString('en-KE')} orders, and none the period before.`
        : `Orders ${orders >= 0 ? 'grew' : 'fell'} by ${Math.abs(orders)}% (${p.kpis.orders.now.toLocaleString('en-KE')}).`,
    );
  }
  const active = change(p.kpis.active.now, p.kpis.active.before);
  out.push(
    active == null
      ? `${p.kpis.active.now.toLocaleString('en-KE')} merchants are live.`
      : `Active merchants ${active >= 0 ? 'increased' : 'decreased'} by ${Math.abs(active)}% (${p.kpis.active.now.toLocaleString('en-KE')}).`,
  );
  return out.slice(0, 3);
}

export type Step = 'daily' | 'weekly' | 'monthly';

/** Daily points rolled up to weeks (from Monday) or months, in whole shillings. */
export function rollUp(series: Performance['series'], step: Step) {
  const key = (iso: string) => {
    if (step === 'daily') return iso;
    const d = new Date(`${iso}T00:00:00Z`);
    if (step === 'monthly') return `${iso.slice(0, 7)}-01`;
    const back = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - back);
    return d.toISOString().slice(0, 10);
  };
  const sums = new Map<string, { gmv: number; commission: number }>();
  for (const s of series) {
    const k = key(s.day);
    const v = sums.get(k) ?? { gmv: 0, commission: 0 };
    v.gmv += s.gmv;
    v.commission += s.commission;
    sums.set(k, v);
  }
  return [...sums.entries()].map(([day, v]) => ({
    day,
    gmv: kes(v.gmv),
    commission: kes(v.commission),
  }));
}
