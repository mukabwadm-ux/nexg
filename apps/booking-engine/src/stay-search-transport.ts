import type { BookingEngine } from './engine.js';
import { assertStayPilotEnvironment } from './stay-pilot.js';
import { readStaySearch } from './stays.js';
import { authenticatedStayCustomer } from './stay-transport.js';
import { BookingError, type Identity } from './types.js';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const required = ['checkIn', 'checkOut', 'adults', 'children'];
const invalid = () =>
  new BookingError(422, 'Supply exact dates and guest counts once.', 'invalid_stay_intent');
const unavailable = () =>
  new BookingError(
    503,
    'Coherent native availability storage is unavailable.',
    'stay_snapshot_unavailable',
  );

export async function staySearchTransport(
  engine: BookingEngine,
  identity: Identity,
  params: URLSearchParams,
) {
  assertStayPilotEnvironment();
  authenticatedStayCustomer(identity);
  const propertyId = params.get('propertyId');
  if (
    [...params.keys()].some((key) => !required.includes(key) && key !== 'propertyId') ||
    required.some((key) => params.getAll(key).length !== 1) ||
    params.getAll('propertyId').length > 1 ||
    (propertyId !== null && !uuid.test(propertyId)) ||
    !['checkIn', 'checkOut'].every((key) => /^\d{4}-\d{2}-\d{2}$/.test(params.get(key)!)) ||
    !['adults', 'children'].every((key) => /^(0|[1-9]\d*)$/.test(params.get(key)!))
  )
    throw invalid();
  const input = {
    propertyId: propertyId?.toLowerCase() ?? null,
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
    throw invalid();
  const database = engine.payload.db;
  const postgres = database as unknown as {
    transactionOptions?: unknown;
    beginTransaction(options: {
      isolationLevel: 'repeatable read';
      accessMode: 'read only';
    }): Promise<string | number | null>;
  };
  if (database.name !== 'postgres' || postgres.transactionOptions === false) throw unavailable();
  const tx = await postgres.beginTransaction({
    isolationLevel: 'repeatable read',
    accessMode: 'read only',
  });
  if (tx == null) throw unavailable();
  try {
    const result = await readStaySearch(engine, identity, input, {
      request: engine.managementContext().request(identity, tx),
      coherentSnapshot: true,
    });
    await database.commitTransaction(tx);
    return result;
  } catch (error) {
    await database.rollbackTransaction(tx);
    throw error;
  }
}
