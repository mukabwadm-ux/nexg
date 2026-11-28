import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createPayload } from '../src/payload.js';

/**
 * A disposable database for one test file: SQLite in a temporary folder, or,
 * when BOOKING_TEST_POSTGRES_URL is set (a server where this user may create
 * databases, as CI's "Booking runtime on PostgreSQL" job sets it), a fresh
 * PostgreSQL database, the production storage. `sqlite` is what BookingEngine
 * takes; `close` destroys Payload and removes the database.
 */
export async function testPayload(name: string, secret: string) {
  const testPostgres = process.env.BOOKING_TEST_POSTGRES_URL;
  if (!testPostgres) {
    const directory = await mkdtemp(path.join(tmpdir(), `nexg-${name}-`));
    const payload = await createPayload({
      sqliteUrl: 'file:' + path.join(directory, 'test.db').replaceAll('\\', '/'),
      secret,
      cacheKey: randomUUID(),
    });
    return {
      payload,
      sqlite: true,
      close: async () => {
        await payload.destroy();
        await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
          () => undefined,
        );
      },
    };
  }
  const { default: pg } = await import('pg');
  const database = 'nexg_booking_test_' + randomUUID().replaceAll('-', '');
  const admin = new pg.Client({ connectionString: testPostgres });
  await admin.connect();
  await admin.query(`create database "${database}"`);
  await admin.end();
  const url = new URL(testPostgres);
  url.pathname = '/' + database;
  const payload = await createPayload({
    postgresUrl: url.toString(),
    push: true,
    secret,
    cacheKey: randomUUID(),
  });
  return {
    payload,
    sqlite: false,
    close: async () => {
      await payload.destroy();
      const client = new pg.Client({ connectionString: testPostgres });
      await client.connect();
      await client.query(`drop database if exists "${database}" with (force)`);
      await client.end();
    },
  };
}
