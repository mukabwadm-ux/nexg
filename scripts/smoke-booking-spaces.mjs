import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const base = process.env.NEXG_BOOKING_BASE_URL ?? 'http://127.0.0.1:3004';
const engine = process.env.BOOKING_ENGINE_URL ?? 'http://127.0.0.1:3003';
for (const target of [base, engine])
  assert.ok(
    ['127.0.0.1', 'localhost'].includes(new URL(target).hostname),
    'Use a loopback development workspace.',
  );
const secret =
  process.env.BOOKING_BRIDGE_SECRET ??
  (await readFile(resolve(root, '.booking-local/bridge-secret'), 'utf8')).trim();
const businessId = `local-space-acceptance-${randomUUID().slice(0, 8)}`;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch(
  existsSync(edge) ? { executablePath: edge, headless: true } : { headless: true },
);
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(45_000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const output = resolve(root, '.booking-local');
await mkdir(output, { recursive: true });
const results = [];
const record = (message) => {
  results.push(message);
  console.log(message);
};

async function merchant(path, body, method = 'POST') {
  const claims = Buffer.from(
    JSON.stringify({
      businessId,
      userId: 'local-space-owner',
      role: 'owner',
      branches: null,
      expiresAt: Date.now() + 60_000,
    }),
  ).toString('base64url');
  const response = await fetch(new URL(`/v1/${path}`, engine), {
    method,
    headers: {
      'x-nexg-booking-context': claims,
      'x-nexg-booking-signature': createHmac('sha256', secret).update(claims).digest('hex'),
      'idempotency-key': randomUUID(),
      'content-type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  const value = await response.json();
  assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(value)}`);
  return value;
}

try {
  await merchant(
    'configuration',
    { subcategoryId: 'restaurant', businessName: 'NEXG local table acceptance', published: true },
    'PUT',
  );
  const table = await merchant('resources', {
    name: 'Local acceptance table for six',
    kind: 'space',
    quantity: 6,
    partyCapacity: 6,
    schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', end: '23:00' },
  });
  await merchant(
    'configuration',
    {
      subcategoryId: 'restaurant',
      published: true,
      canonicalAnswers: {
        BQ_OFFERS_TABLE_RESERVATIONS: true,
        Q_DATA_AUTHORITY: [
          {
            data_class: 'reservations',
            authority: 'NEXG_AUTHORITATIVE',
            owner_reference: 'nexg-booking-engine',
            scope: { business_id: businessId },
          },
        ],
        BQ_SPACE_POLICY: {
          spaces: [
            { resource_id: table.id, minimum_party_size: 1, maximum_party_size: 6, active: true },
          ],
          combinations: [],
          turnover_minutes: 15,
        },
      },
    },
    'PUT',
  );
  const offering = await merchant('offerings', {
    name: 'Local acceptance dining reservation',
    model: 'SPACE_RESERVATION',
    durationMinutes: 90,
    resourceIds: [table.id],
    resourceSelectionMode: 'choose_one',
    priceMinor: 200000,
    currency: 'KES',
    intakeMode: 'instant_after_requirements',
    active: true,
    bookingEnabled: true,
    leadTimeMinutes: 0,
    horizonDays: 3650,
    paymentPolicyId: 'MANUAL_COLLECTION_V1',
    changePolicyId: 'CHANGE_BEFORE_START_V1',
    policyVersion: 1,
    reservationFee: {
      mode: 'fixed',
      amountMinor: 50000,
      treatment: 'applied_in_addition',
      requiredBeforeConfirmation: true,
      refundTerms: 'Local acceptance example: owner reviews refunds before the reservation starts.',
    },
  });
  const date = new Date(Date.now() + 8 * 86400_000 + 3 * 3600_000).toISOString().slice(0, 10);
  await page.goto(`${base}/book/${businessId}`, {
    waitUntil: 'domcontentloaded',
    timeout: 240_000,
  });
  await page.getByLabel('Service', { exact: true }).waitFor({ timeout: 180_000 });
  await page.getByLabel('Service', { exact: true }).selectOption(offering.id);
  await page.getByLabel('Choose an eligible resource', { exact: true }).selectOption(table.id);
  await page.getByLabel('Date', { exact: true }).fill(date);
  await page.getByLabel('Party size', { exact: true }).fill('4');
  await page
    .getByRole('group', { name: 'Available start times' })
    .getByRole('button')
    .first()
    .click();
  await page.getByLabel('Your name', { exact: true }).fill('Local table acceptance');
  await page.getByLabel('Email', { exact: true }).fill('tables@example.test');
  await page.getByText('Reservation fee (additional)', { exact: true }).waitFor();
  const createdResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/bookings'),
  );
  await page.getByRole('button', { name: 'Reserve and arrange payment', exact: true }).click();
  const created = await (await createdResponse).json();
  assert.equal(created.booking.status, 'held');
  assert.equal(created.booking.quantity, 4);
  assert.deepEqual(created.booking.resourceIds, [table.id]);
  assert.equal(created.booking.pricing.serviceSubtotalMinor, 200000);
  assert.equal(created.booking.pricing.reservationFeeMinor, 50000);
  assert.equal(created.booking.pricing.totalMinor, 250000);
  assert.equal(created.booking.pricing.dueNowMinor, 50000);
  record(
    'A customer reserved an actual table for four; the additional KES 500 fee created a real capacity hold.',
  );
  await page.screenshot({ path: resolve(output, 'table-reservation-fee.png'), fullPage: true });
  const paid = await merchant(`bookings/${created.booking.id}/record_payment`, {
    expectedVersion: created.booking.version,
    amountMinor: 50000,
    method: 'cash',
    reference: `LOCAL-TABLE-${randomUUID()}`,
    evidence: 'Local test only: owner records having received the reservation fee in cash.',
  });
  const confirmed = await merchant(`bookings/${created.booking.id}/confirm`, {
    expectedVersion: paid.version,
  });
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.paymentState, 'merchant_recorded');
  assert.equal(confirmed.paidMinor, 50000);
  const own = await context.request.get(
    `${base}/api/public/booking/${businessId}/bookings/${created.booking.id}`,
    { headers: { 'x-booking-customer-token': created.customerToken } },
  );
  assert.ok(own.ok());
  assert.equal((await own.json()).status, 'confirmed');
  record(
    'Owner-recorded fee evidence allowed confirmation, and the customer saw the persisted confirmed table reservation.',
  );
  await merchant(`bookings/${created.booking.id}/cancel`, { expectedVersion: confirmed.version });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  record('The table journey completed without browser runtime errors or narrow-screen overflow.');
} catch (error) {
  process.exitCode = 1;
  console.error(error.stack ?? error.message);
  await page
    .screenshot({ path: resolve(output, 'table-smoke-failure.png'), fullPage: true })
    .catch(() => {});
} finally {
  await writeFile(
    resolve(output, 'spaces-browser-verification.json'),
    JSON.stringify(
      {
        completedAt: new Date().toISOString(),
        passed: !process.exitCode,
        results,
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
