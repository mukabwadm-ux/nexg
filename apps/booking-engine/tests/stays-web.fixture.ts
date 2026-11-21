/** Opt-in child for the web bridge integration test. Synthetic loopback database only. */
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { createPayload } from '../src/payload.js';
import { createBookingServer } from '../src/server.js';
import { setupStayFixture } from './stay-fixture.js';
import { assertStayHoldReady } from '../src/stays.js';
import { prepareStayPaymentAttempt } from '../src/stay-payment-preparation.js';
import {
  bindPreparedStayPaymentAttempt,
  createStaySettlementReceiver,
  type StaySettlementProof,
} from '../src/stay-settlement.js';

delete process.env.BOOKING_DATABASE_URL;
delete process.env.BOOKING_DB_PUSH;
const base = new URL(process.env.BOOKING_TEST_POSTGRES_URL ?? '');
const knownFixture =
  (base.username === 'nexg_fixture' && base.pathname === '/nexg_stays_test') ||
  (base.username === 'nexg_stays_pr' && base.pathname === '/nexg_stays_pr');
if (
  !['postgres:', 'postgresql:'].includes(base.protocol) ||
  base.hostname !== '127.0.0.1' ||
  !knownFixture ||
  base.search ||
  base.hash
)
  throw new Error('An explicit isolated loopback Stays fixture is required.');
Object.assign(process.env, { NODE_ENV: 'test', PAYLOAD_FORCE_DRIZZLE_PUSH: 'true' });
const { default: pg } = await import('pg');
const name = 'nexg_stays_web_' + randomUUID().replaceAll('-', '');
const admin = new pg.Client({ connectionString: base.toString() });
await admin.connect();
try {
  await admin.query('CREATE DATABASE "' + name + '"');
} finally {
  await admin.end();
}
const database = new URL(base);
database.pathname = '/' + name;
let payload: Awaited<ReturnType<typeof createPayload>> | undefined;
let server: ReturnType<typeof createBookingServer> | undefined;
const emit = (value: unknown) =>
  process.stdout.write('STAYS_FIXTURE ' + JSON.stringify(value) + '\n');
try {
  payload = await createPayload({
    postgresUrl: database.toString(),
    push: true,
    cacheKey: randomUUID(),
    secret: 'synthetic-stays-web-fixture-secret-123456789',
  });
  const f = await setupStayFixture(payload, false, () => Date.now());
  server = createBookingServer(f.engine, 'synthetic-stays-web-fixture-secret-123456789');
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture listener');
  const start = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
  emit({
    type: 'ready',
    port: address.port,
    merchantId: f.owner.businessId,
    userId: f.guest.userId,
    contact: f.customer,
    input: { ...f.input, checkIn: start, checkOut: end },
  });
  const receiver = createStaySettlementReceiver(f.engine, {
    verify: async (raw) => ({ identity: f.owner, proof: raw as StaySettlementProof }),
    canConfirm: async (identity, row, request) => {
      await assertStayHoldReady(f.engine, identity, row, request);
      return true;
    },
  });
  for await (const line of createInterface({ input: process.stdin })) {
    const command = JSON.parse(line) as { type: string; bookingId?: string };
    if (command.type === 'stop') break;
    if (command.type !== 'settle' || !command.bookingId) throw new Error('Unknown fixture command');
    const attemptId = randomUUID();
    const prepared = await prepareStayPaymentAttempt(
      f.engine,
      f.guest,
      { bookingId: command.bookingId, attemptId },
      attemptId,
    );
    const binding = {
      attemptId,
      provider: 'fixture-only',
      providerAccountId: 'synthetic-web-fixture',
      providerReference: randomUUID(),
    };
    await bindPreparedStayPaymentAttempt(
      f.engine,
      f.owner,
      command.bookingId,
      binding,
      randomUUID(),
    );
    const outcome = await receiver({
      ...binding,
      merchantId: f.owner.businessId,
      bookingId: command.bookingId,
      eventId: randomUUID(),
      amountMinor: prepared.amountMinor,
      currency: 'KES',
      status: 'settled',
      occurredAt: new Date().toISOString(),
    });
    emit({ type: 'settled', bookingId: command.bookingId, outcome });
  }
} finally {
  if (server)
    await new Promise<void>((resolve) => {
      server!.close(() => resolve());
      server!.closeAllConnections();
    });
  try {
    await payload?.destroy();
  } finally {
    const cleanup = new pg.Client({ connectionString: base.toString() });
    await cleanup.connect();
    try {
      await cleanup.query('DROP DATABASE "' + name + '" WITH (FORCE)');
    } finally {
      await cleanup.end();
    }
  }
}
