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

function orderRecord(order: OrderRow & { id: string }): WorkRecord {
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
    context: order.store ?? 'Location unavailable',
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
      .select(
        'id, reference, guest, item_count, store, placed_at, promised_ready_at, rider, what_now, needs_your_ack',
      )
      .eq('merchant_id', merchantId)
      .order('placed_at', { ascending: false })
      .limit(200);
    if (error) return { ok: false, message: 'Orders could not be loaded. Try again.' };
    return {
      ok: true,
      records: (data ?? []).flatMap((order) =>
        order.id ? [orderRecord({ ...order, id: order.id })] : [],
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
