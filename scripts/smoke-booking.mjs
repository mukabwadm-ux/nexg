import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const base = process.env.NEXG_BOOKING_BASE_URL ?? 'http://127.0.0.1:3004';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname))
  throw new Error('This smoke journey writes fixtures only to the loopback development workspace.');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch(
  existsSync(edge) ? { executablePath: edge, headless: true } : { headless: true },
);
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(45_000);
const failures = [];
page.on('pageerror', (error) => failures.push(error.message));
const unrelatedActions = [];
page.on('request', (request) => {
  if (request.method() === 'POST' && request.headers()['next-action'])
    unrelatedActions.push(new URL(request.url()).pathname);
});
const results = [];
const record = (message) => {
  results.push(message);
  console.log(message);
};
const output = resolve(root, '.booking-local');
await mkdir(output, { recursive: true });

async function api(path, body, method = 'POST') {
  const response = await context.request.fetch(`${base}/api/booking-workspace/${path}`, {
    method,
    data: body,
    headers: { origin: base, 'idempotency-key': randomUUID() },
    timeout: 120_000,
  });
  const value = await response.json();
  assert.ok(response.ok(), `${path}: ${response.status()} ${JSON.stringify(value)}`);
  return value;
}

try {
  const readyUntil = Date.now() + 600_000;
  for (;;) {
    try {
      if (
        (
          await fetch(`${base}/api/booking-workspace/profiles`, {
            signal: AbortSignal.timeout(5000),
          })
        ).ok
      )
        break;
    } catch {}
    if (Date.now() >= readyUntil)
      throw new Error('The local booking portal did not become ready within ten minutes.');
    await new Promise((done) => setTimeout(done, 1000));
  }
  console.log('Waiting for the isolated development portal to compile…');
  const initial = await page.goto(`${base}/booking-workspace`, {
    waitUntil: 'domcontentloaded',
    timeout: 240_000,
  });
  assert.equal(initial.status(), 200);
  await page.getByRole('heading', { name: 'Calendar', exact: true }).waitFor();
  await page
    .getByRole('button', { name: 'Booking setup', exact: true })
    .waitFor({ timeout: 180_000 });
  const workspace = await api('workspace', undefined, 'GET');
  assert.equal(workspace.profiles.length, 128);
  record('Merchant calendar rendered; all 128 source specialties available.');
  await api(
    'configuration',
    {
      businessName: 'NEXG local acceptance workspace',
      subcategoryId: 'haircare',
      published: true,
      expectedVersion: workspace.configuration.revision,
    },
    'PUT',
  );
  const suffix = randomUUID().slice(0, 8);
  const resource = await api('resources', {
    name: `Smoke stylist ${suffix}`,
    kind: 'staff',
    quantity: 1,
    schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', end: '20:00' },
  });
  const offering = await api('offerings', {
    name: `Smoke appointment ${suffix}`,
    model: 'APPOINTMENT',
    durationMinutes: 60,
    resourceIds: [resource.id],
    priceMinor: 150000,
    currency: 'KES',
    pricingBasis: 'per_booking',
    intakeMode: 'instant_after_requirements',
    active: true,
    bookingEnabled: true,
    leadTimeMinutes: 0,
    horizonDays: 3650,
    paymentPolicyId: 'NO_PREPAYMENT_V1',
    changePolicyId: 'CHANGE_BEFORE_START_V1',
    policyVersion: 1,
  });
  const future = new Date(Date.now() + 7 * 86400_000 + 3 * 3600_000).toISOString().slice(0, 10);
  await page.goto(`${base}/book/${workspace.business.id}`, {
    waitUntil: 'domcontentloaded',
    timeout: 180_000,
  });
  // Initial development compilation of the public API is separate from the page.
  await page.getByLabel('Service', { exact: true }).waitFor({ timeout: 180_000 });
  await page.getByLabel('Service', { exact: true }).selectOption(offering.id);
  await page.getByLabel('Date', { exact: true }).fill(future);
  await page
    .getByRole('group', { name: 'Available start times' })
    .getByRole('button')
    .first()
    .click();
  await page.getByLabel('Your name', { exact: true }).fill('Local browser acceptance');
  await page.getByLabel('Email', { exact: true }).fill('acceptance@example.test');
  const createdResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/bookings'),
  );
  await page.getByRole('button', { name: 'Confirm booking', exact: true }).click();
  const bookingResult = await (await createdResponse).json();
  assert.equal(bookingResult.booking?.status, 'confirmed', JSON.stringify(bookingResult));
  record(
    'Customer chose a real available time, received the server quote, and confirmed a persisted booking.',
  );
  await page.getByRole('button', { name: 'Change time', exact: true }).click();
  await page.getByLabel('New start · EAT', { exact: true }).fill(`${future}T10:00`);
  await page.getByLabel('New end · EAT', { exact: true }).fill(`${future}T11:00`);
  const changedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/reschedule'),
  );
  await page.getByRole('button', { name: 'Confirm new time', exact: true }).click();
  const changed = await (await changedResponse).json();
  assert.equal(changed.status, 'confirmed', JSON.stringify(changed));
  assert.equal(changed.startTime, `${future}T07:00:00.000Z`);
  record(
    'Customer rescheduled using the accepted-booking quote and retained a confirmed allocation.',
  );
  await page.getByRole('button', { name: 'Cancel booking', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
    'Customer page overflows a narrow viewport.',
  );
  await page.screenshot({ path: resolve(output, 'customer-booking.png'), fullPage: true });
  page.once('dialog', (dialog) => dialog.accept());
  const cancelledResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/cancel'),
  );
  await page.getByRole('button', { name: 'Cancel booking', exact: true }).click();
  assert.equal((await (await cancelledResponse).json()).status, 'cancelled');
  const persisted = await api('workspace', undefined, 'GET');
  assert.equal(
    persisted.bookings.find((booking) => booking.id === bookingResult.booking.id)?.status,
    'cancelled',
  );
  record('Private customer cancellation persisted and remained visible in the merchant workspace.');
  await page.goto(`${base}/booking-workspace`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByRole('heading', { name: 'Calendar', exact: true }).waitFor();
  await page
    .getByRole('button', { name: 'Booking setup', exact: true })
    .waitFor({ timeout: 180_000 });
  await page.getByLabel('Calendar date', { exact: true }).fill(future);
  await page.getByRole('combobox', { name: /^Status/ }).selectOption('all');
  for (const view of ['day', 'week', 'month', 'agenda', 'resources']) {
    await page.getByLabel('Calendar view', { exact: true }).selectOption(view);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `${view} calendar overflows the narrow viewport.`,
    );
  }
  await page.getByLabel('Calendar view', { exact: true }).selectOption('week');
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
    'Merchant calendar overflows a narrow viewport.',
  );
  await page.screenshot({ path: resolve(output, 'merchant-calendar-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: resolve(output, 'merchant-calendar.png'), fullPage: true });
  assert.deepEqual(failures, []);
  assert.deepEqual(
    unrelatedActions,
    [],
    'Booking pages invoked an unrelated shopping server action.',
  );
  record('Desktop and narrow viewport journeys completed without browser runtime errors.');
} catch (error) {
  process.exitCode = 1;
  console.error(error.stack ?? error.message);
  await page
    .screenshot({ path: resolve(output, 'booking-smoke-failure.png'), fullPage: true })
    .catch(() => {});
} finally {
  await writeFile(
    resolve(output, 'browser-verification.json'),
    JSON.stringify(
      {
        completedAt: new Date().toISOString(),
        passed: !process.exitCode,
        results,
        browserErrors: failures,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
