'use server';

import { z } from 'zod';

import { listTestBookings, TEST_STAGES, TEST_STATUSES, type TestBooking } from '@/lib/sandbox';
import { createClient } from '@/lib/session';
import { rpcCaller } from '@/lib/webhooks';

/**
 * Test bookings, from the developer console.
 *
 * The database decides who may do what (the merchant's owner, in a current
 * session) and where a booking may move. These actions only shape the
 * request, and answer with the refreshed list so the card does not reload.
 */

const Id = z.string().uuid();
const ServiceCode = z.string().regex(/^[a-z][a-z0-9_]*$/);
const Status = z.enum(TEST_STATUSES);
const Stage = z.enum(TEST_STAGES);

export type TestBookingResult =
  | { ok: true; bookings: TestBooking[]; message: string }
  | { ok: false; message: string };

async function refreshed(message: string): Promise<TestBookingResult> {
  const list = await listTestBookings(rpcCaller(createClient()));
  if (!list.ok) return { ok: false, message: list.message };
  return { ok: true, bookings: list.bookings, message };
}

export async function makeTestBooking(
  merchantId: string,
  service: string,
): Promise<TestBookingResult> {
  if (!Id.safeParse(merchantId).success) {
    return { ok: false, message: 'Choose the merchant to book for.' };
  }
  if (!ServiceCode.safeParse(service).success) return { ok: false, message: 'Choose a service.' };

  const { data, error } = await rpcCaller(createClient()).rpc('rpc_api_test_order_sample', {
    p_merchant_id: merchantId,
    p_service: service,
  });
  if (error) return { ok: false, message: error.message };

  const made = z.object({ reference: z.string() }).safeParse(data);
  return refreshed(
    `Booked ${made.success ? made.data.reference : 'a test booking'}. NexG sends booking.created to your test endpoints.`,
  );
}

export async function moveTestBooking(orderId: string, status: string): Promise<TestBookingResult> {
  if (!Id.safeParse(orderId).success) return { ok: false, message: 'No such test booking.' };
  const to = Status.safeParse(status);
  if (!to.success) {
    return { ok: false, message: 'Choose confirmed, in_progress, completed or cancelled.' };
  }

  const { data, error } = await rpcCaller(createClient()).rpc('rpc_api_test_order_move', {
    p_order_id: orderId,
    p_status: to.data,
  });
  if (error) return { ok: false, message: error.message };

  const moved = z
    .object({
      order: z.object({ reference: z.string(), status: z.string() }),
      previous_status: z.string(),
    })
    .safeParse(data);
  return refreshed(
    moved.success
      ? `${moved.data.order.reference} moved from ${moved.data.previous_status} to ${moved.data.order.status}. NexG sends booking.status_changed to your test endpoints.`
      : 'Moved. NexG sends booking.status_changed to your test endpoints.',
  );
}

export async function moveTestBookingStage(
  orderId: string,
  stage: string,
): Promise<TestBookingResult> {
  if (!Id.safeParse(orderId).success) return { ok: false, message: 'No such test booking.' };
  const to = Stage.safeParse(stage);
  if (!to.success) return { ok: false, message: 'Choose a stage.' };

  const { data, error } = await rpcCaller(createClient()).rpc('rpc_api_test_order_stage', {
    p_order_id: orderId,
    p_stage: to.data,
  });
  if (error) return { ok: false, message: error.message };

  const moved = z
    .object({
      order: z.object({ reference: z.string(), stage: z.string() }),
      previous_stage: z.string(),
    })
    .safeParse(data);
  return refreshed(
    moved.success
      ? `${moved.data.order.reference} moved from ${moved.data.previous_stage} to ${moved.data.order.stage}. NexG sends the event to your test endpoints.`
      : 'Moved. NexG sends the event to your test endpoints.',
  );
}

export async function assignTestRider(orderId: string): Promise<TestBookingResult> {
  if (!Id.safeParse(orderId).success) return { ok: false, message: 'No such test booking.' };

  const { data, error } = await rpcCaller(createClient()).rpc('rpc_api_test_order_rider', {
    p_order_id: orderId,
  });
  if (error) return { ok: false, message: error.message };

  const assigned = z.object({ order: z.object({ reference: z.string() }) }).safeParse(data);
  return refreshed(
    `${assigned.success ? assigned.data.order.reference : 'The booking'} has a test rider. NexG sends booking.rider_assigned to your test endpoints.`,
  );
}
