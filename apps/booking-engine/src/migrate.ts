import { randomUUID } from 'node:crypto';
import { createPayload } from './payload.js';

/**
 * PostgreSQL schema migrations for the booking runtime.
 *
 *   pnpm migrate              apply pending migrations to BOOKING_DATABASE_URL
 *   pnpm migrate:create name  write a migration for schema changes since the last one
 *
 * `migrate:create` compares the code's schema with the latest migration
 * snapshot; point BOOKING_DATABASE_URL at a scratch database, not production.
 */
const [command = 'up', name] = process.argv.slice(2);
const url = process.env.BOOKING_DATABASE_URL;
if (!url) throw new Error('Set BOOKING_DATABASE_URL to the PostgreSQL database to migrate.');
const payload = await createPayload({ postgresUrl: url, push: false, cacheKey: randomUUID() });
try {
  if (command === 'create') {
    if (!name) throw new Error('Name the migration, e.g. pnpm migrate:create initial.');
    await (payload.db as any).createMigration({
      migrationName: name,
      payload,
      forceAcceptWarning: true,
    });
  } else if (command === 'up') {
    await payload.db.migrate();
    console.log('Booking database is up to date.');
  } else if (command === 'status') {
    await (payload.db as any).migrateStatus();
  } else throw new Error(`Unknown command "${command}". Use up, status or create.`);
} finally {
  await payload.destroy();
}
