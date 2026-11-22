'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

import type { WorkRecord } from '@/components/merchant/work/model';
import { merchantActionClient } from '@/lib/merchant-action-access';

type BookingRow = {
  id: string;
  reference: string;
  resource_id: string;
  starts_at: string;
  ends_at: string;
  quantity: number;
  status: string;
  guest_name: string | null;
};
type OrderRow = {
  id: string | null;
  reference: string | null;
  guest: string | null;
  item_count: number | null;
  store: string | null;
  placed_at: string | null;
  promised_ready_at: string | null;
  rider: string | null;
  what_now: string | null;
  stage: string | null;
  needs_your_ack: boolean | null;
};
type Failure = { ok: false; message: string };

const bookingColumns =
  'id, reference, resource_id, starts_at, ends_at, quantity, status, guest_name';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const dateTime = new Intl.DateTimeFormat('en-KE', {
  timeZone: 'Africa/Nairobi',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const orderStatuses: Record<string, { label: string; stage: number }> = {
  /* Paid online and not paid yet: nothing to prepare until it is. */
  awaiting_payment: { label: 'Waiting for payment', stage: 0 },
  to_cook: { label: 'Start preparation', stage: 0 },
  cooking: { label: 'Preparing', stage: 1 },
  you_are_late: { label: 'Preparation overdue', stage: 1 },
  waiting_for_a_rider: { label: 'Waiting for a rider', stage: 2 },
  rider_coming: { label: 'Rider on the way', stage: 2 },
  on_the_way: { label: 'Out for delivery', stage: 2 },
  done: { label: 'Delivered', stage: 3 },
  closed: { label: 'Closed', stage: 3 },
};
const orderColumns =
  'id, reference, guest, item_count, store, placed_at, promised_ready_at, rider, what_now, stage, needs_your_ack';
/* The shop's two steps (rpc_merchant_order_step). Accepting is automatic and
   an order paid online waits for payment, so there is no button before then. */
function orderNextAction(order: OrderRow): WorkRecord['nextAction'] {
  if (
    order.what_now !== 'to_cook' &&
    order.what_now !== 'cooking' &&
    order.what_now !== 'you_are_late'
  )
    return undefined;
  if (order.stage === 'placed' || order.stage === 'confirmed')
    return { id: 'start', label: 'Start preparing' };
  if (order.stage === 'preparing') return { id: 'ready', label: 'Mark ready for the rider' };
  return undefined;
}

/* A digital order (an eSIM): no rider. Once it is paid, the shop sends each
   line's code (rpc_merchant_order_send_codes), one at a time. */
type DigitalOrder = {
  order_id: string;
  codes_missing: number;
  lines: { order_item_id: string; name: string; has_code: boolean }[];
  has_buyer_id: boolean;
};

/* Asked on its own (20270130000600): before the database has it, nothing is digital. */
async function digitalOrders(
  client: Awaited<ReturnType<typeof merchantActionClient>>['client'],
  ids: string[],
): Promise<Map<string, DigitalOrder>> {
  if (!ids.length) return new Map();
  try {
    const result = await (client as unknown as SupabaseClient).rpc('rpc_merchant_digital_orders', {
      p_order_ids: ids,
    });
    if (!result || result.error || !Array.isArray(result.data)) return new Map();
    return new Map((result.data as DigitalOrder[]).map((row) => [row.order_id, row]));
  } catch {
    return new Map();
  }
}

function digitalNextAction(
  order: OrderRow,
  digital: DigitalOrder | undefined,
): WorkRecord['nextAction'] {
  if (!digital || digital.codes_missing < 1) return undefined;
  if (
    order.what_now !== 'to_cook' &&
    order.what_now !== 'cooking' &&
    order.what_now !== 'you_are_late'
  )
    return undefined;
  const next = digital.lines.find((line) => !line.has_code);
  if (!next) return undefined;
  const total = digital.lines.length;
  const done = total - digital.codes_missing;
  return {
    id: 'send_code',
    label:
      total > 1
        ? `Send the code for ${next.name} (${done + 1} of ${total})`
        : `Send the code for ${next.name}`,
    needsText: true,
  };
}

/* Ready: the rider (or, for a collection order, the customer) shows a code
   and the shop types it in to hand the order over (rpc_merchant_handover_code_enter). */
function orderHandoverAction(order: OrderRow): WorkRecord['nextAction'] {
  if (order.stage !== 'ready') return undefined;
  return { id: 'handover', label: 'Hand over: enter the code shown to you', needsCode: true };
}
const bookingStatuses: Record<string, string> = {
  pending: 'Pending confirmation',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
  no_show: 'No show',
};

function formatDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Time unavailable';
  return dateTime.format(new Date(value));
}

function orderRecord(order: OrderRow & { id: string }, digital?: DigitalOrder): WorkRecord {
  const status = orderStatuses[order.what_now ?? ''] ?? { label: 'Status unavailable', stage: 0 };
  return {
    id: order.id,
    reference: order.reference ?? order.id,
    workflowId: 'WF_ORDER',
    customer: order.guest ?? 'Customer name unavailable',
    item:
      order.item_count == null
        ? 'Item count unavailable'
        : `${order.item_count} ${order.item_count === 1 ? 'item' : 'items'}`,
    context: digital
      ? digital.has_buyer_id
        ? 'Digital delivery · buyer ID given'
        : 'Digital delivery'
      : (order.store ?? 'Location unavailable'),
    milestone: formatDate(order.promised_ready_at ?? order.placed_at),
    operator: order.rider ?? 'Unassigned',
    stage: status.stage,
    statusLabel: status.label,
    attention:
      Boolean(order.needs_your_ack) ||
      order.what_now === 'you_are_late' ||
      order.what_now === 'to_cook',
    upcoming: false,
    confirmation: status.label,
    sourceLabel: 'Orders',
    history: order.placed_at ? [`Placed ${formatDate(order.placed_at)}`] : [],
    nextAction: digital
      ? digitalNextAction(order, digital)
      : (orderNextAction(order) ?? orderHandoverAction(order)),
  };
}

function bookingRecord(booking: BookingRow, resource: string | undefined): WorkRecord {
  const upcoming = booking.status === 'confirmed' && Date.parse(booking.starts_at) > Date.now();
  const done = ['cancelled', 'completed', 'no_show'].includes(booking.status);
  const statusLabel = bookingStatuses[booking.status] ?? 'Status unavailable';
  const nextAction =
    booking.status === 'pending'
      ? { id: 'confirmed', label: 'Confirm booking' }
      : booking.status === 'confirmed' && !upcoming
        ? { id: 'completed', label: 'Complete booking' }
        : undefined;
  return {
    id: booking.id,
    reference: booking.reference,
    workflowId: 'WF_BOOKING',
    customer: booking.guest_name ?? 'Guest name unavailable',
    item: resource ?? 'Resource unavailable',
    context: `${booking.quantity} ${booking.quantity === 1 ? 'place' : 'places'}`,
    milestone: formatDate(booking.starts_at),
    operator: 'Unassigned',
    stage: done ? 2 : booking.status === 'confirmed' ? 1 : 0,
    statusLabel,
    attention: booking.status === 'pending',
    upcoming,
    confirmation: statusLabel,
    sourceLabel: 'Bookings',
    history: [],
    nextAction,
    additionalActions:
      booking.status === 'pending' || booking.status === 'confirmed'
        ? [
            { id: 'cancelled', label: 'Cancel booking' },
            ...(booking.status === 'confirmed' && !upcoming
              ? [{ id: 'no_show', label: 'Mark no show' }]
              : []),
          ]
        : undefined,
  };
}

export async function loadMerchantWork(
  workflow: 'WF_ORDER' | 'WF_BOOKING',
  bookingId?: string,
): Promise<{ ok: true; records: WorkRecord[] } | Failure> {
  const { client, merchantId } = await merchantActionClient();
  if (workflow === 'WF_ORDER') {
    const { data, error } = await client
      .from('merchant_orders_v')
      .select(orderColumns)
      .eq('merchant_id', merchantId)
      .order('placed_at', { ascending: false })
      .limit(200);
    if (error) return { ok: false, message: 'Orders could not be loaded. Try again.' };
    const digital = await digitalOrders(
      client,
      (data ?? []).flatMap((order) => (order.id ? [order.id] : [])),
    );
    return {
      ok: true,
      records: (data ?? []).flatMap((order) =>
        order.id ? [orderRecord({ ...order, id: order.id }, digital.get(order.id))] : [],
      ),
    };
  }
  if (workflow !== 'WF_BOOKING') return { ok: false, message: 'This type of work is unavailable.' };
  const db = client as unknown as SupabaseClient;
  const [bookings, resources, linked] = await Promise.all([
    db
      .from('booking')
      .select(bookingColumns)
      .eq('merchant_id', merchantId)
      .neq('status', 'blocked')
      .order('starts_at', { ascending: false })
      .limit(200),
    db.from('bookable_resource').select('id, name').eq('merchant_id', merchantId),
    typeof bookingId === 'string' && uuid.test(bookingId)
      ? db
          .from('booking')
          .select(bookingColumns)
          .eq('merchant_id', merchantId)
          .eq('id', bookingId)
          .neq('status', 'blocked')
          .maybeSingle<BookingRow>()
      : null,
  ]);
  if (bookings.error || resources.error)
    return { ok: false, message: 'Bookings could not be loaded. Try again.' };
  const byId = new Map((resources.data ?? []).map((row) => [row.id, row.name as string]));
  const records: BookingRow[] = bookings.data ?? [];
  const linkedBooking = linked?.data;
  if (linkedBooking && !records.some((row) => row.id === linkedBooking.id))
    records.unshift(linkedBooking);
  return { ok: true, records: records.map((row) => bookingRecord(row, byId.get(row.resource_id))) };
}

export async function advanceMerchantBooking(
  id: string,
  action: string,
): Promise<{ ok: true; record: WorkRecord } | Failure> {
  const { client, merchantId } = await merchantActionClient();
  if (typeof id !== 'string' || !uuid.test(id))
    return { ok: false, message: 'Choose a valid booking.' };
  const db = client as unknown as SupabaseClient;
  const { data, error } = await db
    .from('booking')
    .select(bookingColumns)
    .eq('merchant_id', merchantId)
    .eq('id', id)
    .maybeSingle<BookingRow>();
  if (error || !data) return { ok: false, message: 'This booking could not be loaded.' };
  const current = bookingRecord(data, undefined);
  const permitted = [current.nextAction, ...(current.additionalActions ?? [])].some(
    (item) => item?.id === action,
  );
  if (!permitted)
    return { ok: false, message: 'This booking changed. Reload it before trying again.' };
  const { data: updated, error: saveError } = await db.rpc('rpc_booking_set_status', {
    p_booking_id: id,
    p_status: action,
  });
  if (saveError || !updated)
    return { ok: false, message: 'Could not update the booking. Reload it before trying again.' };
  const { data: resource } = await db
    .from('bookable_resource')
    .select('name')
    .eq('merchant_id', merchantId)
    .eq('id', data.resource_id)
    .maybeSingle();
  revalidatePath('/merchant/work');
  revalidatePath('/merchant/bookings');
  return { ok: true, record: bookingRecord(updated, resource?.name) };
}

export async function advanceMerchantOrder(
  id: string,
  action: string,
): Promise<{ ok: true; record: WorkRecord } | Failure> {
  const { client, merchantId } = await merchantActionClient();
  if (typeof id !== 'string' || !uuid.test(id))
    return { ok: false, message: 'Choose a valid order.' };
  const load = () =>
    client
      .from('merchant_orders_v')
      .select(orderColumns)
      .eq('merchant_id', merchantId)
      .eq('id', id)
      .maybeSingle<OrderRow>();
  const { data, error } = await load();
  if (error || !data?.id) return { ok: false, message: 'This order could not be loaded.' };
  if (action.startsWith('send_code:')) {
    const digital = (await digitalOrders(client, [id])).get(id);
    const next = digitalNextAction(data, digital);
    const line = digital?.lines.find((item) => !item.has_code);
    if (!next || !line)
      return { ok: false, message: 'This order changed. Reload it before trying again.' };
    let code = '';
    try {
      code = decodeURIComponent(action.slice('send_code:'.length)).trim();
    } catch {
      return { ok: false, message: 'That code could not be read. Paste it again.' };
    }
    if (code.length < 1 || code.length > 2000)
      return { ok: false, message: 'Paste the code, up to 2,000 characters.' };
    const { error: sendError } = await (client as unknown as SupabaseClient).rpc(
      'rpc_merchant_order_send_codes',
      { p_order_id: id, p_codes: [{ order_item_id: line.order_item_id, code }] },
    );
    if (sendError)
      return {
        ok: false,
        message:
          sendError.hint === 'unpaid'
            ? 'Wait for the customer’s payment before sending the code.'
            : 'Could not send the code. Reload the order before trying again.',
      };
    const [{ data: sent }, after] = await Promise.all([load(), digitalOrders(client, [id])]);
    revalidatePath('/merchant/work');
    revalidatePath('/merchant/orders');
    const row = sent?.id ? sent : data;
    return { ok: true, record: orderRecord({ ...row, id: row.id ?? id }, after.get(id)) };
  }
  /* A digital order is offered only send_code; the database refuses it a rider. */
  if (action.startsWith('handover:')) {
    if (!orderHandoverAction(data))
      return { ok: false, message: 'This order changed. Reload it before trying again.' };
    const code = action.slice('handover:'.length).replace(/\D/g, '');
    if (code.length !== 4) return { ok: false, message: 'Enter the 4-digit code.' };
    const { data: entered, error: codeError } = await client.rpc(
      'rpc_merchant_handover_code_enter',
      { p_order_id: id, p_code: code },
    );
    const result = (entered ?? {}) as { ok?: boolean; message?: string };
    if (codeError || result.ok === false)
      return {
        ok: false,
        message: result.message ?? 'Could not hand the order over. Reload it before trying again.',
      };
    const { data: handed } = await load();
    revalidatePath('/merchant/work');
    revalidatePath('/merchant/orders');
    const row = handed?.id ? handed : data;
    return { ok: true, record: orderRecord({ ...row, id: row.id ?? id }) };
  }
  if (orderNextAction(data)?.id !== action)
    return { ok: false, message: 'This order changed. Reload it before trying again.' };
  const { error: stepError } = await client.rpc('rpc_merchant_order_step', {
    p_order_id: id,
    p_step: action,
  });
  if (stepError)
    return {
      ok: false,
      message:
        stepError.hint === 'awaiting_payment'
          ? 'Wait for the customer’s payment before starting this order.'
          : 'Could not update the order. Reload it before trying again.',
    };
  const { data: updated } = await load();
  revalidatePath('/merchant/work');
  revalidatePath('/merchant/orders');
  const row = updated?.id ? updated : data;
  return { ok: true, record: orderRecord({ ...row, id: row.id ?? id }) };
}
