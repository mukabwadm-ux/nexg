import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';
const auth = vi.hoisted(() => vi.fn());
vi.mock('./native-stay-customer', () => ({ resolveVerifiedStayCustomer: auth }));
import { nativeVpsStayCheckout } from './native-vps-stay-checkout';

type FixtureMessage =
  | {
      type: 'ready';
      port: number;
      merchantId: string;
      userId: string;
      contact: { name: string; email?: string; phone?: string };
      input: {
        propertyId: string;
        unitId: string;
        checkIn: string;
        checkOut: string;
        adults: number;
        children: number;
      };
    }
  | { type: 'settled'; bookingId: string; outcome: unknown };

test.skipIf(!process.env.BOOKING_TEST_POSTGRES_URL)(
  'web bridge -> real PostgreSQL engine -> verified fixture settlement -> private Activity',
  async () => {
    const engineDir = fileURLToPath(new URL('../../../booking-engine/', import.meta.url));
    const child = spawn(process.execPath, ['--import', 'tsx', 'tests/stays-web.fixture.ts'], {
      cwd: engineDir,
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const exited = once(child, 'exit');
    const messages: FixtureMessage[] = [],
      waiters: ((message: FixtureMessage) => void)[] = [];
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      if (!line.startsWith('STAYS_FIXTURE ')) return;
      const message = JSON.parse(line.slice('STAYS_FIXTURE '.length)) as FixtureMessage;
      const waiter = waiters.shift();
      if (waiter) waiter(message);
      else messages.push(message);
    });
    let errors = '';
    child.stderr.on('data', (chunk) => {
      errors = (errors + String(chunk)).slice(-4000);
    });
    const next = () =>
      messages.length
        ? Promise.resolve(messages.shift())
        : Promise.race([
            new Promise<FixtureMessage>((resolve) => waiters.push(resolve)),
            exited.then(([code]) => {
              throw new Error(`Fixture exited ${code}: ${errors}`);
            }),
          ]);
    try {
      const ready = await next();
      if (ready?.type !== 'ready') throw new Error('Fixture did not report its ready state.');
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('NEXG_NATIVE_STAYS_SYNTHETIC_FIXTURE', 'true');
      vi.stubEnv('NEXG_NATIVE_STAYS_PILOT_MERCHANT_IDS', ready.merchantId);
      vi.stubEnv('BOOKING_ENGINE_URL', `http://127.0.0.1:${ready.port}`);
      vi.stubEnv('BOOKING_BRIDGE_SECRET', 'synthetic-stays-web-fixture-secret-123456789');
      auth.mockResolvedValue({ ok: true, userId: ready.userId, contact: ready.contact });
      const call = (path: string[], body?: unknown, key?: string, query = '') =>
        nativeVpsStayCheckout(
          new Request('http://127.0.0.1/fixture' + query, {
            method: body ? 'POST' : 'GET',
            headers: {
              Authorization: 'Bearer synthetic-auth-subject',
              ...(key ? { 'Idempotency-Key': key } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          }),
          { merchantId: ready.merchantId, path },
        );
      const query =
        '?' + new URLSearchParams(Object.entries(ready.input).map(([k, v]) => [k, String(v)]));
      let response = await call(['availability'], undefined, undefined, query);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        available: true,
        held: false,
        authority: 'nexg-booking-engine',
      });
      const searchQuery =
        '?' +
        new URLSearchParams({
          propertyId: ready.input.propertyId,
          checkIn: ready.input.checkIn,
          checkOut: ready.input.checkOut,
          adults: String(ready.input.adults),
          children: String(ready.input.children),
        });
      response = await call(['search'], undefined, undefined, searchQuery);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        scope: 'business',
        complete: true,
        checkedUnits: 1,
        items: [{ unitId: ready.input.unitId }],
      });
      response = await call(['quote'], ready.input, randomUUID());
      expect(response.status).toBe(200);
      const quote = await response.json();
      expect(quote.checkoutPaymentReady).toBe(false);
      expect(quote.paymentMethods).toEqual([]);
      response = await call(
        ['holds'],
        {
          quoteId: quote.quoteId,
          firstName: 'Not trusted identity',
          expectedTotalMinor: quote.totalMinor,
        },
        quote.quoteId,
      );
      expect(response.status).toBe(200);
      const hold = await response.json();
      expect(hold).toMatchObject({
        operationId: quote.quoteId,
        status: 'held',
        paymentStatus: 'unpaid',
      });
      response = await call(['availability'], undefined, undefined, query);
      expect((await response.json()).available).toBe(false);
      response = await call(['search'], undefined, undefined, searchQuery);
      expect(await response.json()).toMatchObject({ complete: true, items: [] });
      response = await call(['activity']);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ complete: true, items: [] });
      expect((await call(['holds', hold.stayId, 'activity'])).status).toBe(404);
      child.stdin.write(JSON.stringify({ type: 'settle', bookingId: hold.stayId }) + '\n');
      expect(await next()).toMatchObject({ type: 'settled', outcome: { outcome: 'confirmed' } });
      response = await call(['activity']);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        source: 'nexg-booking-engine',
        complete: true,
        items: [{ bookingId: hold.stayId, status: 'confirmed' }],
      });
      response = await call(['holds', quote.quoteId]);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        stayId: hold.stayId,
        status: 'booked',
        paymentStatus: 'paid',
        holdExpiresAt: hold.holdExpiresAt,
      });
      response = await call(['holds', hold.stayId, 'activity']);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        source: 'nexg-booking-engine',
        bookingId: hold.stayId,
        bookingReference: hold.stayId,
        status: 'confirmed',
        paymentStatus: 'paid',
        checkIn: ready.input.checkIn,
        checkOut: ready.input.checkOut,
      });
    } finally {
      if (child.exitCode === null) child.stdin.end(JSON.stringify({ type: 'stop' }) + '\n');
      const [code] = await exited;
      lines.close();
      vi.unstubAllEnvs();
      expect(code, errors).toBe(0);
    }
  },
  300000,
);
