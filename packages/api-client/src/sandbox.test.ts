import { describe, expect, it } from 'vitest';

import { NexgClient } from './client.js';
import { NexgApiError } from './errors.js';

/*
 * The client against a real NexG API, with a test key. Skipped unless both
 * are given, so CI never runs it:
 *
 *   NEXG_SANDBOX_BASE_URL=https://api.nexgapp.com \
 *   NEXG_SANDBOX_KEY=nexg_test_… \
 *   pnpm --filter @nexg-org/api-client test
 *
 * The key needs merchant_read, merchant_write and catalogue_write. Only a
 * test key is accepted: its bookings are sandbox bookings, nothing is
 * dispatched or charged, and its catalogue changes are not saved.
 */
/* Read through globalThis: the package is typed without Node's globals. */
const env =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const baseUrl = env.NEXG_SANDBOX_BASE_URL;
const apiKey = env.NEXG_SANDBOX_KEY;

describe.skipIf(!baseUrl || !apiKey)(
  'against the sandbox',
  () => {
    if (apiKey && !apiKey.startsWith('nexg_test_')) {
      throw new Error('NEXG_SANDBOX_KEY must be a test key (nexg_test_…).');
    }
    const nexg = new NexgClient({ apiKey, ...(baseUrl ? { baseUrl } : {}) });

    it('reads zones and services, and checks a delivery', async () => {
      const zones = await nexg.zones.list();
      expect(Array.isArray(zones.items)).toBe(true);

      const services = await nexg.services.list();
      expect(services.items.map((s) => s.code)).toContain('courier');

      const trip = await nexg.delivery.check({
        pickup_lat: -1.2648,
        pickup_lng: 36.8027,
        dropoff_lat: -1.2921,
        dropoff_lng: 36.7865,
      });
      expect(typeof trip.deliverable).toBe('boolean');
      expect(trip.currency).toBe('KES');
    });

    it('books a courier, reads it back, moves it and gives it a rider', async () => {
      const { booking } = await nexg.orders.create({
        service: 'courier',
        pickup_label: 'Woodvale Grove, Westlands',
        pickup_lat: -1.2648,
        pickup_lng: 36.8027,
        dropoff_label: 'Kilimani',
        dropoff_lat: -1.2921,
        dropoff_lng: 36.7865,
        note: 'Client library sandbox test.',
      });
      expect(booking.service).toBe('courier');

      const { order } = await nexg.orders.get(booking.order_id);
      expect(order.order_id).toBe(booking.order_id);

      const moved = await nexg.sandbox.moveOrder(booking.order_id, { status: 'confirmed' });
      expect(moved.order.status).toBe('confirmed');

      const rider = await nexg.sandbox.assignRider(booking.order_id);
      expect(typeof rider.assigned_at).toBe('string');

      let found = false;
      for await (const listed of nexg.orders.listAll({ limit: 5 })) {
        if (listed.order_id === booking.order_id) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it('changes catalogue items without saving them, with a test key', async () => {
      const { items } = await nexg.catalogue.list();
      const first = items[0];
      if (!first) return;

      const answer = await nexg.catalogue.updateMany([
        { id: first.id, available: !first.available },
      ]);
      expect(answer.applied).toBe(false);
      expect(answer.items[0]?.available).toBe(!first.available);

      const after = await nexg.catalogue.list();
      expect(after.items.find((i) => i.id === first.id)?.available).toBe(first.available);
    });

    it('throws NexgApiError with the code and fields for a bad request', async () => {
      const error = await nexg.catalogue
        .updateMany([{ id: 'not-an-id', price_kes: 0 }])
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NexgApiError);
      expect(error).toMatchObject({ status: 400, code: 'invalid_request' });
      expect(Object.keys((error as NexgApiError).fields ?? {})).toEqual(
        expect.arrayContaining(['items.0.id', 'items.0.price_kes']),
      );
    });
  },
  // A real API: on a local dev server each route compiles on first use.
  60_000,
);
