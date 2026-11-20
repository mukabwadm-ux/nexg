import type { MyBooking } from '@/lib/booking/customer';
import { createClient } from '@/lib/supabase/server';

/**
 * One signed-in customer's own activity, for the account dashboard and Discovery's "For you".
 *
 * Every read goes through row-level security as the customer, so it can only ever be theirs:
 * orders through the order_read policy (guest.user_id = auth.uid()), bookings through
 * rpc_my_bookings, stays by guest_user_id. Merchant names come from merchant_public, which lists
 * live businesses only. Nothing here is written, and no other customer's data is used: the
 * suggestions are built from this person's history alone.
 */

export const LIVE_STAGES = ['placed', 'confirmed', 'preparing', 'ready', 'picked_up', 'arriving'];

export interface CustomerOrder {
  id: string;
  reference: string;
  merchant_id: string | null;
  stage: string;
  payment_status: string | null;
  payment_method: string | null;
  total_cents: number;
  placed_at: string | null;
}

export interface CustomerStay {
  id: string;
  check_in: string;
  check_out: string;
  status: string;
  quote_total_kes: number | null;
  paid_kes: number | null;
}

export interface PublicMerchant {
  id: string;
  trading_name: string;
  category: string | null;
  category_key: string | null;
}

export interface CustomerActivity {
  name: string | null;
  email: string | null;
  orders: CustomerOrder[];
  bookings: MyBooking[];
  stays: CustomerStay[];
  merchants: Map<string, PublicMerchant>;
}

export async function loadCustomerActivity(): Promise<CustomerActivity | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return null;

  const [orders, bookings, stays] = await Promise.all([
    supabase
      .from('order')
      .select('id, reference, merchant_id, stage, payment_status, payment_method, total_cents, placed_at')
      .order('placed_at', { ascending: false })
      .limit(30),
    supabase.rpc('rpc_my_bookings'),
    supabase
      .from('stay')
      .select('id, check_in, check_out, status, quote_total_kes, paid_kes')
      .eq('guest_user_id', user.id)
      .order('check_in', { ascending: false })
      .limit(20),
  ]);

  const orderRows = (orders.data ?? []) as unknown as CustomerOrder[];
  const merchantIds = [
    ...new Set(orderRows.map((o) => o.merchant_id).filter((id): id is string => !!id)),
  ];
  const merchants = new Map<string, PublicMerchant>();
  if (merchantIds.length) {
    const { data } = await supabase
      .from('merchant_public')
      .select('id, trading_name, category, category_key')
      .in('id', merchantIds);
    for (const m of (data ?? []) as PublicMerchant[]) merchants.set(m.id, m);
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    name: typeof meta.first_name === 'string' && meta.first_name.trim() ? meta.first_name.trim() : null,
    email: user.email ?? null,
    orders: orderRows,
    bookings: Array.isArray(bookings.data) ? (bookings.data as unknown as MyBooking[]) : [],
    stays: (stays.data ?? []) as unknown as CustomerStay[],
    merchants,
  };
}

/** Live businesses in the categories this customer orders from, that they have not tried yet. */
export async function loadSimilarMerchants(
  activity: CustomerActivity,
  limit = 4,
): Promise<PublicMerchant[]> {
  const known = [...activity.merchants.values()];
  const keys = [...new Set(known.map((m) => m.category_key ?? m.category).filter(Boolean))] as string[];
  if (!keys.length) return [];
  const supabase = createClient();
  const { data } = await supabase
    .from('merchant_public')
    .select('id, trading_name, category, category_key')
    .in('category_key', keys)
    .eq('explore_visible', true)
    .limit(limit + known.length);
  return ((data ?? []) as PublicMerchant[]).filter((m) => !activity.merchants.has(m.id)).slice(0, limit);
}

export const kes = (cents: number) => `KES ${Math.round(cents / 100).toLocaleString('en-KE')}`;

/** The order still in motion, newest first: what Home and Discovery put on top. */
export function liveOrder(orders: CustomerOrder[]): CustomerOrder | null {
  return orders.find((o) => LIVE_STAGES.includes(o.stage) && o.payment_status !== 'pending') ?? null;
}

/** Orders waiting for the customer to pay, still open. */
export function unpaidOrders(orders: CustomerOrder[]): CustomerOrder[] {
  return orders.filter((o) => o.stage === 'placed' && o.payment_status === 'pending');
}

/** Businesses the customer has had delivered from, most recent first, one each. */
export function orderAgain(activity: CustomerActivity, limit = 3) {
  const seen = new Set<string>();
  const out: { merchant: PublicMerchant; last: CustomerOrder; count: number }[] = [];
  for (const o of activity.orders) {
    if (o.stage !== 'delivered' || !o.merchant_id) continue;
    const merchant = activity.merchants.get(o.merchant_id);
    if (!merchant) continue;
    if (seen.has(o.merchant_id)) {
      const entry = out.find((e) => e.merchant.id === o.merchant_id);
      if (entry) entry.count += 1;
      continue;
    }
    seen.add(o.merchant_id);
    out.push({ merchant, last: o, count: 1 });
  }
  return out.slice(0, limit);
}

/** Bookings and stays still ahead, soonest first. */
export function comingUp(activity: CustomerActivity, now = new Date()) {
  const bookings = activity.bookings
    .filter((b) => ['pending', 'confirmed'].includes(b.status) && new Date(b.starts_at) >= now)
    .map((b) => ({ kind: 'booking' as const, at: b.starts_at, booking: b }));
  const today = now.toISOString().slice(0, 10);
  const stays = activity.stays
    .filter((s) => s.check_in >= today && ['held', 'booked'].includes(s.status))
    .map((s) => ({ kind: 'stay' as const, at: s.check_in, stay: s }));
  return [...bookings, ...stays].sort((a, b) => a.at.localeCompare(b.at));
}
