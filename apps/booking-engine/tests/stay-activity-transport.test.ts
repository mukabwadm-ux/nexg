import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStayTransport } from '../src/stay-transport.js';
import type { BookingEngine } from '../src/engine.js';
import type { Identity } from '../src/types.js';

const identity = {
  businessId: '01a12345-168a-4456-8b79-000000000001',
  userId: '01a12345-168a-4456-8b79-000000000002',
  role: 'customer',
  expiresAt: Date.now() + 60000,
  staysCustomer: {
    purpose: 'nexg.stays.customer.v1',
    verified: true,
    customer: { name: 'Fixture Guest', email: 'guest@example.test' },
  },
} as Identity;

function fixture() {
  const calls: unknown[] = [];
  const db = {
    name: 'postgres',
    beginTransaction: async (options: unknown) => {
      calls.push(['begin', options]);
      return 'snapshot';
    },
    commitTransaction: async (id: unknown) => {
      calls.push(['commit', id]);
    },
    rollbackTransaction: async (id: unknown) => {
      calls.push(['rollback', id]);
    },
  };
  const engine = {
    payload: { db },
    managementContext: () => ({
      request: (actor: Identity, transactionID: unknown) => ({ actor, transactionID }),
    }),
  } as unknown as BookingEngine;
  return { engine, db, calls };
}

test('Activity list uses actor-bound read-only repeatable snapshot and commits once', async () => {
  const f = fixture();
  const result = {
    source: 'nexg-booking-engine' as const,
    scope: 'tenant' as const,
    businessId: identity.businessId,
    complete: true as const,
    items: [],
  };
  const transport = createStayTransport(undefined, async (engine, actor, options) => {
    assert.equal(engine, f.engine);
    assert.equal(actor, identity);
    assert.equal(options.coherentSnapshot, true);
    assert.equal(options.request.transactionID, 'snapshot');
    assert.equal(options.request.actor, identity);
    return result;
  });
  assert.deepEqual(await transport.activityList(f.engine, identity), result);
  assert.deepEqual(f.calls, [
    ['begin', { isolationLevel: 'repeatable read', accessMode: 'read only' }],
    ['commit', 'snapshot'],
  ]);
});

test('Activity list rolls back read failure and never falls back on unsupported storage or actor', async () => {
  const f = fixture();
  let reads = 0;
  const transport = createStayTransport(undefined, async () => {
    reads++;
    throw new Error('fixture read failed');
  });
  await assert.rejects(transport.activityList(f.engine, identity), /fixture read failed/);
  assert.deepEqual(f.calls.at(-1), ['rollback', 'snapshot']);
  assert.equal(
    f.calls.some((call) => Array.isArray(call) && call[0] === 'commit'),
    false,
  );
  f.db.name = 'sqlite';
  await assert.rejects(transport.activityList(f.engine, identity), /storage is unavailable/);
  await assert.rejects(transport.activityList(f.engine, { ...identity, role: 'owner' }), /Sign in/);
  assert.equal(reads, 1);
});
