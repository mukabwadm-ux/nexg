import type { BookingEngine } from './engine.js';
import { quoteStay, createStayHold, readStayHold, readStayAvailability } from './stays.js';
import { BookingError, type Customer, type Identity } from './types.js';
import { readStayActivity } from './stay-activity.js';
import { readStayActivityList } from './stay-activity-list.js';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function authenticatedStayCustomer(identity: Identity): Customer {
  const claim = (identity as Identity & { staysCustomer?: any }).staysCustomer;
  if (
    identity.role !== 'customer' ||
    typeof identity.userId !== 'string' ||
    !uuid.test(identity.userId) ||
    typeof identity.businessId !== 'string' ||
    !uuid.test(identity.businessId) ||
    !claim ||
    claim.purpose !== 'nexg.stays.customer.v1' ||
    claim.verified !== true
  )
    throw new BookingError(
      401,
      'Sign in with a verified Stays customer account.',
      'stay_authentication_required',
    );
  const customer = claim.customer;
  if (
    !customer ||
    typeof customer.name !== 'string' ||
    !customer.name.trim() ||
    customer.name.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(customer.name) ||
    !!customer.email === !!customer.phone ||
    (customer.email !== undefined &&
      (typeof customer.email !== 'string' ||
        customer.email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))) ||
    (customer.phone !== undefined &&
      (typeof customer.phone !== 'string' || !/^\+?[1-9]\d{7,14}$/.test(customer.phone)))
  )
    throw new BookingError(
      401,
      'A real name and one verified contact are required.',
      'stay_authentication_required',
    );
  return {
    name: customer.name.trim(),
    ...(customer.email ? { email: customer.email } : { phone: customer.phone }),
  };
}

function exactObject(raw: unknown, fields: readonly string[]) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    Object.keys(raw).length !== fields.length ||
    Object.keys(raw).some((k) => !fields.includes(k))
  )
    throw new BookingError(422, 'Send only the exact Stays intent.', 'invalid_stay_intent');
  return raw as Record<string, unknown>;
}
function idempotencyKey(key?: string) {
  if (typeof key !== 'string' || !uuid.test(key))
    throw new BookingError(422, 'Supply a UUID Idempotency-Key.', 'invalid_idempotency_key');
  return key.toLowerCase();
}

/** Internal dependency seam for boundary tests, never configurable from HTTP. */
export function createStayTransport(
  commands = { quoteStay, createStayHold, readStayHold, readStayAvailability, readStayActivity },
  activityListReader = readStayActivityList,
) {
  return {
    async activityList(engine: BookingEngine, identity: Identity) {
      authenticatedStayCustomer(identity);
      const db = engine.payload.db;
      if (db.name !== 'postgres' || (db as any).transactionOptions === false)
        throw new BookingError(
          503,
          'Coherent Stay Activity storage is unavailable.',
          'stay_snapshot_unavailable',
        );
      const postgres = db as unknown as {
        beginTransaction(options: {
          isolationLevel: 'repeatable read';
          accessMode: 'read only';
        }): Promise<string | number | null>;
      };
      const tx = await postgres.beginTransaction({
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      });
      if (tx == null)
        throw new BookingError(
          503,
          'Coherent Stay Activity storage is unavailable.',
          'stay_snapshot_unavailable',
        );
      try {
        const view = await activityListReader(engine, identity, {
          request: engine.managementContext().request(identity, tx),
          coherentSnapshot: true,
        });
        await db.commitTransaction(tx);
        return view;
      } catch (error) {
        await db.rollbackTransaction(tx);
        throw error;
      }
    },
    async activity(engine: BookingEngine, identity: Identity, bookingId: string) {
      authenticatedStayCustomer(identity);
      if (!uuid.test(bookingId))
        throw new BookingError(
          404,
          'Confirmed Stay activity not found.',
          'stay_activity_unavailable',
        );
      return commands.readStayActivity(engine, identity, bookingId);
    },
    async availability(engine: BookingEngine, identity: Identity, params: URLSearchParams) {
      authenticatedStayCustomer(identity);
      const fields = ['propertyId', 'unitId', 'checkIn', 'checkOut', 'adults', 'children'];
      if (
        [...params.keys()].some((k) => !fields.includes(k)) ||
        fields.some((k) => params.getAll(k).length !== 1) ||
        !['propertyId', 'unitId'].every((k) => uuid.test(params.get(k)!)) ||
        !['checkIn', 'checkOut'].every((k) => /^\d{4}-\d{2}-\d{2}$/.test(params.get(k)!)) ||
        !['adults', 'children'].every((k) => /^(0|[1-9]\d*)$/.test(params.get(k)!))
      )
        throw new BookingError(
          422,
          'Supply exact room, dates and guest counts once each.',
          'invalid_stay_intent',
        );
      const input = {
        propertyId: params.get('propertyId')!,
        unitId: params.get('unitId')!,
        checkIn: params.get('checkIn')!,
        checkOut: params.get('checkOut')!,
        adults: Number(params.get('adults')),
        children: Number(params.get('children')),
      };
      if (
        !Number.isSafeInteger(input.adults) ||
        input.adults < 1 ||
        !Number.isSafeInteger(input.children) ||
        input.adults + input.children > 40
      )
        throw new BookingError(422, 'Supply valid guest counts.', 'invalid_stay_intent');
      const db = engine.payload.db;
      if (db.name !== 'postgres' || (db as any).transactionOptions === false)
        throw new BookingError(
          503,
          'Coherent native availability storage is unavailable.',
          'stay_snapshot_unavailable',
        );
      const postgres = db as unknown as {
        beginTransaction(options: {
          isolationLevel: 'repeatable read';
          accessMode: 'read only';
        }): Promise<string | number | null>;
      };
      const tx = await postgres.beginTransaction({
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      });
      if (tx == null)
        throw new BookingError(
          503,
          'Coherent native availability storage is unavailable.',
          'stay_snapshot_unavailable',
        );
      try {
        const view = await commands.readStayAvailability(engine, identity, input, {
          request: engine.managementContext().request(identity, tx),
          coherentSnapshot: true,
        });
        await db.commitTransaction(tx);
        return {
          propertyId: view.propertyId,
          unitId: view.unitId,
          checkIn: view.checkIn,
          checkOut: view.checkOut,
          adults: view.adults,
          children: view.children,
          contractVersion: view.contractVersion,
          authority: view.authority,
          held: view.held,
          offeringId: view.offeringId,
          nights: view.nights,
          available: view.available,
          nightlyMinor: view.nightlyMinor,
          totalMinor: view.totalMinor,
          currency: view.currency,
          observedAt: view.observedAt,
        };
      } catch (error) {
        await db.rollbackTransaction(tx);
        throw error;
      }
    },
    async quote(engine: BookingEngine, identity: Identity, raw: unknown, key?: string) {
      authenticatedStayCustomer(identity);
      const input = exactObject(raw, [
        'propertyId',
        'unitId',
        'checkIn',
        'checkOut',
        'adults',
        'children',
      ]);
      return commands.quoteStay(
        engine,
        identity,
        input as unknown as Parameters<typeof quoteStay>[2],
        idempotencyKey(key),
      );
    },
    async hold(engine: BookingEngine, identity: Identity, raw: unknown, key?: string) {
      const customer = authenticatedStayCustomer(identity);
      const input = exactObject(raw, ['quoteId', 'requestId', 'expectedTotalMinor']);
      const requestId = idempotencyKey(key);
      if (
        typeof input.requestId !== 'string' ||
        !uuid.test(input.requestId) ||
        input.requestId !== input.quoteId ||
        input.requestId !== requestId
      )
        throw new BookingError(
          422,
          'Use quoteId as requestId and Idempotency-Key.',
          'invalid_idempotency_key',
        );
      return commands.createStayHold(
        engine,
        identity,
        { ...input, requestId } as unknown as Parameters<typeof createStayHold>[2],
        customer,
      );
    },
    async read(engine: BookingEngine, identity: Identity, id: string) {
      authenticatedStayCustomer(identity);
      if (!uuid.test(id)) throw new BookingError(404, 'This stay hold was not found.', 'not_found');
      return commands.readStayHold(engine, identity, id);
    },
  };
}
