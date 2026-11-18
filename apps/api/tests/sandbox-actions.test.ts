import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, createServerClient } = vi.hoisted(() => {
  const rpc = vi.fn();
  const createServerClient = vi.fn(() => ({ rpc }));
  return { rpc, createServerClient };
});
vi.mock('@supabase/ssr', () => ({ createServerClient }));
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: () => undefined }) }));

import {
  assignTestRider,
  makeTestBooking,
  moveTestBooking,
  moveTestBookingStage,
} from '../app/developers/sandbox-actions';
import { listTestBookings } from '../lib/sandbox';

const MERCHANT = '22222222-2222-4222-8222-222222222222';
const BOOKING = '44444444-4444-4444-8444-444444444444';
const ROW = {
  order_id: BOOKING,
  reference: 'TEST-261117-A1B2C3',
  service: 'airport_transfer',
  quantity: 1,
  status: 'requested',
  stage: 'placed',
  payment_method: 'on_account',
  payment_status: 'pending',
  currency: 'KES',
  total_cents: 100000,
  scheduled_for: null,
  pickup_label: 'Sample pickup',
  dropoff_label: 'Sample drop-off',
  created_at: '2026-11-17T09:12:44.512+00:00',
  merchant_id: MERCHANT,
  merchant_name: 'Sunrise Tours',
  next: ['confirmed', 'in_progress', 'completed', 'cancelled'],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
  rpc.mockImplementation(async (name: string) => {
    if (name === 'rpc_api_test_orders') return { data: [ROW], error: null };
    if (name === 'rpc_api_test_order_sample') return { data: ROW, error: null };
    if (name === 'rpc_api_test_order_stage') {
      return {
        data: {
          order: { ...ROW, status: 'in_progress', stage: 'arriving' },
          previous_stage: 'picked_up',
        },
        error: null,
      };
    }
    if (name === 'rpc_api_test_order_rider') {
      return { data: { order: ROW, assigned_at: '2026-11-18T09:20:03.118+00:00' }, error: null };
    }
    if (name === 'rpc_api_test_order_move') {
      return {
        data: {
          order: { ...ROW, status: 'confirmed', stage: 'confirmed' },
          previous_status: 'requested',
        },
        error: null,
      };
    }
    return { data: null, error: null };
  });
});
afterEach(() => vi.unstubAllEnvs());

const names = () => rpc.mock.calls.map(([name]) => name as string);

describe('test bookings in the developer console', () => {
  it('reads the test bookings of the merchants the person owns', async () => {
    const list = await listTestBookings({ rpc });

    expect(list).toEqual({
      ok: true,
      bookings: [
        expect.objectContaining({
          id: BOOKING,
          reference: 'TEST-261117-A1B2C3',
          status: 'requested',
          totalCents: 100000,
          merchantName: 'Sunrise Tours',
          next: ['confirmed', 'in_progress', 'completed', 'cancelled'],
        }),
      ],
    });
    expect(rpc).toHaveBeenCalledWith('rpc_api_test_orders', { p_limit: 20 });
  });

  it('says so when the list cannot be read', async () => {
    rpc.mockResolvedValueOnce({ data: [{ ...ROW, next: ['shipped'] }], error: null });

    expect(await listTestBookings({ rpc })).toEqual({
      ok: false,
      message: 'The test bookings could not be read.',
    });
  });

  it('makes a sample booking and answers with the refreshed list', async () => {
    const result = await makeTestBooking(MERCHANT, 'airport_transfer');

    expect(rpc).toHaveBeenCalledWith('rpc_api_test_order_sample', {
      p_merchant_id: MERCHANT,
      p_service: 'airport_transfer',
    });
    expect(result).toMatchObject({
      ok: true,
      message: 'Booked TEST-261117-A1B2C3. NexG sends booking.created to your test endpoints.',
    });
    expect(result.ok && result.bookings).toHaveLength(1);
  });

  it('moves a booking on and says from what to what', async () => {
    const result = await moveTestBooking(BOOKING, 'confirmed');

    expect(rpc).toHaveBeenCalledWith('rpc_api_test_order_move', {
      p_order_id: BOOKING,
      p_status: 'confirmed',
    });
    expect(result).toMatchObject({
      ok: true,
      message:
        'TEST-261117-A1B2C3 moved from requested to confirmed. NexG sends booking.status_changed to your test endpoints.',
    });
  });

  it('passes the database’s refusal on as it is', async () => {
    rpc.mockImplementation(async () => ({
      data: null,
      error: { message: 'A test booking was just made. Wait a few seconds.' },
    }));

    expect(await makeTestBooking(MERCHANT, 'courier')).toEqual({
      ok: false,
      message: 'A test booking was just made. Wait a few seconds.',
    });
  });

  it('asks the database nothing for a request it cannot be', async () => {
    expect((await makeTestBooking('not-a-merchant', 'courier')).ok).toBe(false);
    expect((await makeTestBooking(MERCHANT, 'Airport Transfer!')).ok).toBe(false);
    expect((await moveTestBooking('not-a-booking', 'confirmed')).ok).toBe(false);
    expect((await moveTestBooking(BOOKING, 'requested')).ok).toBe(false);
    expect(names()).toEqual([]);
  });

  it('moves a booking by stage, and says from which stage to which', async () => {
    const result = await moveTestBookingStage(BOOKING, 'arriving');

    expect(rpc).toHaveBeenCalledWith('rpc_api_test_order_stage', {
      p_order_id: BOOKING,
      p_stage: 'arriving',
    });
    expect(result).toMatchObject({
      ok: true,
      message:
        'TEST-261117-A1B2C3 moved from picked_up to arriving. NexG sends the event to your test endpoints.',
    });
  });

  it('gives a ride or courier a test rider', async () => {
    const result = await assignTestRider(BOOKING);

    expect(rpc).toHaveBeenCalledWith('rpc_api_test_order_rider', { p_order_id: BOOKING });
    expect(result).toMatchObject({
      ok: true,
      message:
        'TEST-261117-A1B2C3 has a test rider. NexG sends booking.rider_assigned to your test endpoints.',
    });
  });

  it('asks the database nothing for a stage it does not know', async () => {
    expect((await moveTestBookingStage(BOOKING, 'flying')).ok).toBe(false);
    expect((await assignTestRider('not-a-booking')).ok).toBe(false);
    expect(names()).toEqual([]);
  });
});
