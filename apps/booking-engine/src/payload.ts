import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { buildConfig, getPayload, type CollectionConfig } from 'payload';
import { sqliteAdapter } from '@payloadcms/db-sqlite';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { payloadReserve } from 'payload-reserve';

const dataDir = fileURLToPath(new URL('../.data/', import.meta.url));
const tenantField = { name: 'businessId', type: 'text' as const, required: true, index: true };
const tenantAccess = ({ req }: any) =>
  req.context?.nexgSystem === true
    ? true
    : req.context?.nexgBusinessId
      ? { businessId: { equals: req.context.nexgBusinessId } }
      : false;
const deny = () => false;
const enforceTenant = ({ data, req }: any) => {
  if (req.context?.nexgSystem === true) return data;
  const businessId = req.context?.nexgBusinessId;
  if (!businessId || (data?.businessId && data.businessId !== businessId))
    throw new Error('Business scope mismatch.');
  return { ...data, businessId };
};
const access = {
  read: tenantAccess,
  create: ({ req }: any) => !!(req.context?.nexgSystem || req.context?.nexgBusinessId),
  update: tenantAccess,
  delete: tenantAccess,
  admin: deny,
};
function collection(slug: string, fields: any[]): CollectionConfig {
  return {
    slug,
    admin: { hidden: true },
    access,
    hooks: { beforeValidate: [enforceTenant] },
    fields: [tenantField, ...fields],
  };
}
const extraFields = {
  services: [
    tenantField,
    { name: 'publicId', type: 'text', unique: true, required: true, index: true },
    { name: 'nexg', type: 'json' },
  ],
  resources: [
    tenantField,
    { name: 'publicId', type: 'text', unique: true, required: true, index: true },
    { name: 'nexg', type: 'json' },
  ],
  schedules: [tenantField],
  reservations: [
    tenantField,
    { name: 'publicId', type: 'text', unique: true, required: true, index: true },
    { name: 'nexg', type: 'json' },
  ],
  customers: [tenantField],
};

export async function createPayload(
  options: { sqliteUrl?: string; secret?: string; postgresUrl?: string; cacheKey?: string } = {},
) {
  process.env.DISABLE_PAYLOAD_HMR = 'true';
  await mkdir(dataDir, { recursive: true });
  let secret = options.secret ?? process.env.PAYLOAD_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production')
      throw new Error('PAYLOAD_SECRET is required in production.');
    const filename = path.join(dataDir, 'payload-secret');
    try {
      secret = await readFile(filename, 'utf8');
    } catch {
      secret = randomBytes(48).toString('hex');
      await writeFile(filename, secret, { mode: 0o600 });
    }
  }
  const pg = options.postgresUrl ?? process.env.BOOKING_DATABASE_URL;
  if (process.env.NODE_ENV === 'production' && pg)
    throw new Error(
      'PostgreSQL production writes are disabled until the booking concurrency integration suite is verified against the deployment database.',
    );
  if (process.env.NODE_ENV === 'production' && !pg)
    throw new Error(
      'Production requires a dedicated BOOKING_DATABASE_URL and reviewed migrations.',
    );
  const db = pg
    ? postgresAdapter({
        pool: { connectionString: pg },
        push: process.env.BOOKING_DB_PUSH === 'true',
      })
    : sqliteAdapter({
        client: {
          url:
            options.sqliteUrl ??
            process.env.BOOKING_SQLITE_URL ??
            `file:${path.join(dataDir, 'booking.db').replaceAll('\\', '/')}`,
        },
        push: true,
        transactionOptions: {},
      });
  const overrides: any = {};
  for (const [slug, fields] of Object.entries(extraFields))
    overrides[slug] = {
      fields: ({ defaultFields }: any) => [...defaultFields, ...fields],
      access,
      hooks: { beforeValidate: [enforceTenant] },
    };
  const config = buildConfig({
    secret,
    db,
    admin: { disable: true },
    telemetry: false,
    typescript: { outputFile: path.join(dataDir, 'payload-types.ts') },
    collections: [
      collection('businesses', [
        { name: 'bookingLock', type: 'text' },
        { name: 'businessKey', type: 'text', required: true, unique: true },
        { name: 'name', type: 'text', required: true },
        { name: 'configuration', type: 'json' },
      ]),
      collection('booking-requests', [
        { name: 'publicId', type: 'text', unique: true, required: true, index: true },
        { name: 'nexg', type: 'json', required: true },
      ]),
      collection('booking-operations', [
        { name: 'operationKey', type: 'text', required: true, unique: true },
        { name: 'requestHash', type: 'text', required: true },
        { name: 'result', type: 'json', required: true },
      ]),
      collection('booking-audit', [
        { name: 'actorId', type: 'text', required: true },
        { name: 'operation', type: 'text', required: true },
        { name: 'recordId', type: 'text' },
        { name: 'detail', type: 'json' },
      ]),
      collection('booking-outbox', [
        { name: 'eventKey', type: 'text', required: true, unique: true },
        { name: 'eventType', type: 'text', required: true },
        { name: 'payload', type: 'json', required: true },
        {
          name: 'state',
          type: 'select',
          options: ['pending', 'delivered', 'failed'],
          defaultValue: 'pending',
        },
        { name: 'attempts', type: 'number', defaultValue: 0 },
        { name: 'lastError', type: 'text' },
      ]),
      collection('booking-sessions', [
        { name: 'sessionKey', type: 'text', required: true, unique: true },
        { name: 'publicId', type: 'text', unique: true },
        { name: 'capacity', type: 'number' },
        { name: 'resourceIds', type: 'json' },
        { name: 'published', type: 'checkbox', defaultValue: false },
        { name: 'version', type: 'number', defaultValue: 1 },
        { name: 'locationId', type: 'text' },
        { name: 'reservationId', type: 'text' },
        { name: 'offeringId', type: 'text', required: true },
        { name: 'startTime', type: 'date', required: true },
        { name: 'endTime', type: 'date', required: true },
      ]),
    ],
    plugins: [
      payloadReserve({
        timezone: 'Africa/Nairobi',
        allowGuestBooking: true,
        enforceSchedule: true,
        // Host guards distinguish closed new intake from accepted contracts; actual
        // resource activity is checked on every allocation and existing reschedule.
        enforceActive: false,
        cancellationNoticePeriod: 0,
        maxFlexibleDuration: 60 * 24 * 366,
        resourceTypes: ['staff', 'asset', 'vehicle', 'room', 'space', 'equipment', 'capacity_pool'],
        statusMachine: {
          statuses: [
            'held',
            'pending',
            'confirmed',
            'completed',
            'cancelled',
            'expired',
            'no-show',
          ],
          defaultStatus: 'held',
          confirmStatus: 'confirmed',
          cancelStatus: 'cancelled',
          blockingStatuses: ['held', 'confirmed'],
          terminalStatuses: ['completed', 'cancelled', 'expired', 'no-show'],
          transitions: {
            held: ['confirmed', 'cancelled', 'expired'],
            pending: ['confirmed', 'cancelled'],
            confirmed: ['completed', 'cancelled', 'no-show'],
            completed: [],
            cancelled: [],
            expired: [],
            'no-show': [],
          },
        },
        collectionOverrides: overrides,
      }),
    ],
  });
  const payload = await getPayload({ config, key: options.cacheKey });
  // The shared Drizzle destroy resets schema state but does not close libsql's client.
  const destroy = payload.destroy.bind(payload);
  let closed = false;
  payload.destroy = async () => {
    if (closed) return;
    closed = true;
    await destroy();
    if (pg) await (payload.db as any).pool?.end();
    else (payload.db as any).client?.close();
  };
  return payload;
}
