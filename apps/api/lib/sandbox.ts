import { z } from 'zod';

import type { RpcCaller } from './webhooks';

/**
 * Test bookings: bookings made with a test key, or from the developer
 * console, that never become orders.
 *
 * A real booking changes status as the merchant and NexG work on it. A test
 * booking has nobody working on it, so it is moved by hand, through the API
 * (POST /v1/test/orders/{id}/status) or with the console's buttons, and each
 * move sends booking.status_changed to the merchant's test endpoints. The
 * database holds the rules: forward only, or to cancelled, until it is
 * completed or cancelled.
 */

/** The statuses a test booking can be moved to, in the order a booking goes through them. */
export const TEST_STATUSES = ['confirmed', 'in_progress', 'completed', 'cancelled'] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];

const Row = z.object({
  order_id: z.string().uuid(),
  reference: z.string(),
  service: z.string(),
  quantity: z.number().int(),
  status: z.string().nullable(),
  stage: z.string(),
  currency: z.string(),
  total_cents: z.number().int(),
  created_at: z.string(),
  merchant_id: z.string().uuid(),
  merchant_name: z.string(),
  next: z.array(z.enum(TEST_STATUSES)),
});

export interface TestBooking {
  id: string;
  reference: string;
  service: string;
  quantity: number;
  status: string | null;
  stage: string;
  currency: string;
  totalCents: number;
  createdAt: string;
  merchantId: string;
  merchantName: string;
  /** Where it may move to, nearest first. Empty once completed or cancelled. */
  next: TestStatus[];
}

export type TestBookingList =
  | { ok: true; bookings: TestBooking[] }
  | { ok: false; message: string };

/** The latest test bookings of every merchant the signed-in person owns. */
export async function listTestBookings(client: RpcCaller): Promise<TestBookingList> {
  const { data, error } = await client.rpc('rpc_api_test_orders', { p_limit: 20 });
  if (error) return { ok: false, message: error.message };
  const rows = z.array(Row).safeParse(data ?? []);
  if (!rows.success) return { ok: false, message: 'The test bookings could not be read.' };
  return {
    ok: true,
    bookings: rows.data.map((r) => ({
      id: r.order_id,
      reference: r.reference,
      service: r.service,
      quantity: r.quantity,
      status: r.status,
      stage: r.stage,
      currency: r.currency,
      totalCents: r.total_cents,
      createdAt: r.created_at,
      merchantId: r.merchant_id,
      merchantName: r.merchant_name,
      next: r.next,
    })),
  };
}

/**
 * The buttons a test booking gets in the console: the next step on, and
 * cancel. The API also lets a booking skip ahead; the console keeps to the
 * order a real booking goes through.
 */
export function consoleMoves(next: readonly TestStatus[]): TestStatus[] {
  const step = next.find((status) => status !== 'cancelled');
  return [...(step ? [step] : []), ...(next.includes('cancelled') ? (['cancelled'] as const) : [])];
}

export const MOVE_LABELS: Record<TestStatus, string> = {
  confirmed: 'Confirm',
  in_progress: 'Start',
  completed: 'Complete',
  cancelled: 'Cancel',
};
