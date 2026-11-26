'use server';

import { revalidatePath } from 'next/cache';

import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

/*
 * Concierge orders for a staying guest, paid by a pay link
 * (20270332000500_concierge_pay_link.sql). The database prices the basket
 * from the catalogue exactly as a guest's web order, checks the caller works
 * in hospitality (or orders), sends the link and audits it.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Which merchant categories each "Request Concierge Service" tile lists. */
const GROUPS: Record<string, string[] | null> = {
  transfer: ['airport_transfers', 'vehicle_rentals', 'vehicle_services'],
  groceries: ['supermarket', 'groceries_essentials', 'pharmacy', 'health', 'marketplace'],
  food: ['restaurant', 'restaurants_food', 'bar_liquor', 'alcohol_beverages'],
  bookings: [
    'wellness',
    'beauty',
    'laundry',
    'laundry_cleaning',
    'premium_services',
    'concierge_services',
  ],
  experiences: ['experiences', 'travel_tours', 'games_sports'],
  other: null,
};

type Untyped = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

async function db() {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');
  return createClient() as unknown as Untyped;
}

export interface ConciergeItem {
  id: string;
  name: string;
  price_kes: number;
  unit_label: string | null;
  estimate: boolean;
  age_restricted: boolean;
}
export interface ConciergeMerchant {
  id: string;
  name: string;
  category: string;
  open_now: boolean;
  min_order_kes: number | null;
  items: ConciergeItem[];
}
export interface ConciergeCatalogue {
  stay: {
    guest_name: string;
    phone_masked: string | null;
    has_phone: boolean;
    has_email: boolean;
    label: string;
    address: string | null;
  };
  merchants: ConciergeMerchant[];
}

export async function conciergeCatalogue(
  stayId: string,
  group: string,
): Promise<{ ok: true; data: ConciergeCatalogue } | { ok: false; message: string }> {
  if (!UUID.test(stayId)) return { ok: false, message: 'Choose a guest first.' };
  if (!(group in GROUPS)) return { ok: false, message: 'Unknown service.' };
  const { data, error } = await (
    await db()
  ).rpc('rpc_console_concierge_catalogue', {
    p_stay_id: stayId,
    p_categories: GROUPS[group],
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: data as ConciergeCatalogue };
}

export interface ConciergeBasket {
  stayId: string;
  merchantId: string;
  items: { id: string; quantity: number }[];
  note?: string;
  phone?: string;
}

function payload(b: ConciergeBasket) {
  return {
    stay_id: b.stayId,
    merchant_id: b.merchantId,
    note: b.note?.trim() || null,
    phone: b.phone?.trim() || null,
    items: b.items
      .filter((i) => UUID.test(i.id) && Number.isInteger(i.quantity) && i.quantity > 0)
      .map((i) => ({ catalogue_item_id: i.id, quantity: Math.min(i.quantity, 50) })),
  };
}

export interface ConciergeQuote {
  ok: boolean;
  message?: string;
  subtotal_cents?: number;
  delivery_fee_cents?: number;
  service_fee_cents?: number;
  small_basket_fee_cents?: number;
  total_cents?: number;
}

export async function conciergeQuote(b: ConciergeBasket): Promise<ConciergeQuote> {
  if (!UUID.test(b.stayId) || !UUID.test(b.merchantId)) return { ok: false, message: '' };
  const { data, error } = await (await db()).rpc('rpc_console_concierge_quote', { p: payload(b) });
  if (error) return { ok: false, message: error.message };
  return data as ConciergeQuote;
}

export interface PayLinkSent {
  ok: boolean;
  message?: string;
  reference?: string;
  total_cents?: number;
  link?: string;
  expires_at?: string;
  sent_to?: string[];
}

export async function orderConcierge(b: ConciergeBasket): Promise<PayLinkSent> {
  if (!UUID.test(b.stayId)) return { ok: false, message: 'Choose a guest first.' };
  if (!UUID.test(b.merchantId)) return { ok: false, message: 'Choose a merchant.' };
  const body = payload(b);
  if (body.items.length === 0) return { ok: false, message: 'Choose at least one item.' };
  const { data, error } = await (await db()).rpc('rpc_console_concierge_order', { p: body });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/stays', 'layout');
  return data as PayLinkSent;
}

export async function resendPayLink(orderId: string, phone?: string): Promise<PayLinkSent> {
  if (!UUID.test(orderId)) return { ok: false, message: 'The order ID is invalid.' };
  const { data, error } = await (
    await db()
  ).rpc('rpc_console_concierge_resend', { p_order_id: orderId, p_phone: phone?.trim() || null });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/stays', 'layout');
  return data as PayLinkSent;
}
