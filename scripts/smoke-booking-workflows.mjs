import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const base = process.env.NEXG_BOOKING_BASE_URL ?? 'http://127.0.0.1:3004';
const service = process.env.BOOKING_ENGINE_URL ?? 'http://127.0.0.1:3003';
for (const target of [base, service])
  assert.ok(
    ['127.0.0.1', 'localhost'].includes(new URL(target).hostname),
    'Use only a loopback development workspace.',
  );
const secret =
  process.env.BOOKING_BRIDGE_SECRET ??
  (await readFile(resolve(root, '.booking-local/bridge-secret'), 'utf8')).trim();
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
const waitResponse = (predicate) => {
  const pending = page.waitForResponse(predicate);
  void pending.catch(() => {});
  return pending;
};
const results = [];
const selectedModels = process.argv
  .find((arg) => arg.startsWith('--models='))
  ?.slice(9)
  .split(',');
const attemptedModels = [];
const date = new Date(Date.now() + 10 * 86400_000 + 3 * 3600_000).toISOString().slice(0, 10);
const record = (message) => {
  results.push(message);
  console.log(message);
};

async function merchant(businessId, path, body, method = 'POST') {
  const claims = Buffer.from(
    JSON.stringify({
      businessId,
      userId: 'local-workflow-owner',
      role: 'owner',
      branches: null,
      expiresAt: Date.now() + 60_000,
    }),
  ).toString('base64url');
  const response = await fetch(new URL(`/v1/${path}`, service), {
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
async function resource(id, name, kind = 'staff', quantity = 1, unit = 'place', scale = 0) {
  return merchant(id, 'resources', {
    name,
    kind,
    quantity,
    capacityUnit: unit,
    quantityScale: scale,
    ...(kind === 'capacity_pool' ? { capacityMode: 'per-guest' } : {}),
    schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '08:00', end: '20:00' },
  });
}
async function offering(id, model, resourceIds, specialistSetup, extra = {}) {
  return merchant(id, 'offerings', {
    name: `Local acceptance ${model}`,
    model,
    resourceIds,
    durationMinutes: 60,
    priceMinor: 100000,
    currency: 'KES',
    intakeMode: 'merchant_approval',
    active: true,
    bookingEnabled: true,
    leadTimeMinutes: 0,
    horizonDays: 3650,
    paymentPolicyId: 'NO_PREPAYMENT_V1',
    changePolicyId: 'CHANGE_BEFORE_START_V1',
    policyVersion: 1,
    specialistSetup,
    ...extra,
  });
}
async function progress(id, booking, command, extra = {}) {
  return merchant(id, `bookings/${booking.id}/workflow`, {
    expectedVersion: booking.version,
    command,
    ...extra,
  });
}
async function field(name, value) {
  await page.locator(`[name="${name}"]`).fill(value);
}
async function window(name, start, end) {
  await field(`${name}Start`, `${date}T${start}`);
  await field(`${name}End`, `${date}T${end}`);
}
async function restore(id) {
  await page.goto(`${base}/book/${id}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page
    .getByRole('button', { name: 'View your last booking in this session', exact: true })
    .click();
  await page.getByRole('region', { name: 'Fulfilment progress', exact: true }).waitFor();
}
async function accept(label) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('checkbox').check();
  const response = waitResponse(
    (value) =>
      value.request().method() === 'POST' && new URL(value.url()).pathname.endsWith('/workflow'),
  );
  await page.getByRole('button', { name: 'Confirm this step', exact: true }).click();
  const result = await response;
  const value = await result.json();
  assert.ok(result.ok(), JSON.stringify(value));
  return value;
}

try {
  for (const [model, subcategory] of [
    ['TOUR', 'city_tours'],
    ['LINKED_WINDOWS', 'laundry'],
    ['PRODUCTION_DUE', 'cakes'],
    ['ENTITLEMENT', 'gym'],
    ['FREIGHT', 'road_freight'],
    ['SERVICE_JOB', 'car_wash'],
  ]) {
    if (selectedModels && !selectedModels.includes(model)) continue;
    attemptedModels.push(model);
    const id = `local-workflow-${model.toLowerCase()}-${randomUUID().slice(0, 8)}`;
    await merchant(
      id,
      'configuration',
      {
        subcategoryId: subcategory,
        businessName: `NEXG local ${model} acceptance`,
        published: true,
        ...(model === 'ENTITLEMENT'
          ? { canonicalAnswers: { Q_PERSONAL_TRAINING_AVAILABLE: true } }
          : {}),
      },
      'PUT',
    );
    let setup, resourceIds, child;
    if (model === 'TOUR') {
      const guide = await resource(id, 'Local actual guide');
      resourceIds = [guide.id];
      setup = {
        model,
        version: 1,
        supplierComponents: [],
        mode: 'private',
        itinerary: 'Accepted local Nairobi walking itinerary',
        itineraryVersion: 1,
        resourceIds,
        minimumParticipants: 1,
        maximumParticipants: 6,
      };
    } else if (model === 'LINKED_WINDOWS') {
      const pool = await resource(id, 'Local laundry workload', 'capacity_pool', 20, 'kg');
      resourceIds = [pool.id];
      setup = {
        model,
        version: 1,
        supplierComponents: [],
        promiseMode: 'FIRM_PRE_ACCEPTED',
        incomingMethod: 'CUSTOMER_DROPOFF',
        outgoingMethod: 'CUSTOMER_COLLECTION',
        incomingResourceIds: [],
        outgoingResourceIds: [],
        processingResourceId: pool.id,
        processingUnit: 'kg',
        quantityScale: 0,
        minimumProcessingMinutes: 60,
        maximumProcessingMinutes: 240,
        calendarBasis: 'elapsed',
        workingDays: [0, 1, 2, 3, 4, 5, 6],
        opens: '08:00',
        closes: '20:00',
      };
    } else if (model === 'PRODUCTION_DUE') {
      const pool = await resource(id, 'Local production workload', 'capacity_pool', 10, 'job');
      resourceIds = [pool.id];
      setup = {
        model,
        version: 1,
        supplierComponents: [],
        capacityPoolId: pool.id,
        capacityUnit: 'job',
        quantityScale: 0,
        preparationLeadMinutes: 120,
        cutoffLocalTime: '18:00',
        workingDays: [0, 1, 2, 3, 4, 5, 6],
        approvalMode: 'required',
        handoffResourceIds: [],
      };
    } else if (model === 'ENTITLEMENT') {
      const trainer = await resource(id, 'Local plan trainer');
      child = await offering(id, 'APPOINTMENT', [trainer.id], undefined, {
        name: 'Local covered trainer appointment',
        intakeMode: 'instant_after_requirements',
      });
      resourceIds = [];
      setup = {
        model,
        version: 1,
        supplierComponents: [],
        planId: `LOCAL-PLAN-${id}`,
        planVersion: 1,
        scopeOfferingIds: [child.id],
        validity: { mode: 'relative_to_activation', duration: { value: 2, unit: 'month' } },
        credits: [
          { id: 'training', quantityMinor: 2, unit: 'visit', scale: 0, offeringIds: [child.id] },
        ],
        creditCancellation: 'restore_before_start',
        renewal: 'none',
      };
    } else if (model === 'SERVICE_JOB') {
      const bay = await resource(id, 'Local actual service bay', 'space');
      const team = await resource(id, 'Local actual service team');
      resourceIds = [bay.id, team.id];
      setup = {
        model,
        version: 1,
        supplierComponents: [],
        jobSchedulingMode: 'scheduled_work',
        assessmentMode: 'fixed_scope',
        resourceIds,
        durationMinutes: 30,
        partsRequired: false,
        partsEvidenceKind: 'authorized_manual_reference',
        custodyMode: 'customer_retains',
        custodyResourceIds: [],
        custodyDurationMinutes: 1440,
      };
    } else {
      const truck = await resource(id, 'Local actual truck', 'vehicle'),
        kg = await resource(id, 'Local truck mass', 'capacity_pool', 1000, 'kg'),
        cbm = await resource(id, 'Local truck volume', 'capacity_pool', 5000, 'cbm', 3);
      resourceIds = [truck.id, kg.id, cbm.id];
      setup = {
        model,
        version: 1,
        supplierComponents: [],
        legs: [
          {
            id: 'road',
            origin: 'Nairobi',
            destination: 'Nakuru',
            resourceIds: [truck.id],
            dimensions: [
              { resourceId: kg.id, unit: 'kg', scale: 0 },
              { resourceId: cbm.id, unit: 'cbm', scale: 3 },
            ],
          },
        ],
        requiresDocuments: true,
        requiresClearance: false,
        finalMode: 'delivery',
      };
    }
    const product = await offering(id, model, resourceIds, setup);
    assert.equal(product.executionMode, 'native_workflow');
    await page.goto(`${base}/book/${id}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.getByLabel('Service', { exact: true }).waitFor({ timeout: 180_000 });
    await page.getByLabel('Service', { exact: true }).selectOption(product.id);
    if (model === 'ENTITLEMENT') await page.getByText('Plan version 1', { exact: true }).waitFor();
    if (model === 'TOUR') await window('spTour', '09:00', '11:00');
    else if (model === 'LINKED_WINDOWS') {
      await window('spIncoming', '08:00', '09:00');
      await window('spProcessing', '09:00', '11:00');
      await field('spWorkload', '3');
      await window('spOutgoing', '11:00', '12:00');
    } else if (model === 'PRODUCTION_DUE') {
      await field('spSpecification', 'Three cakes with the agreed flavour, size and inscription.');
      await field('spProductionStart', `${date}T08:00`);
      await field('spDue', `${date}T17:00`);
      await field('spWorkload', '3');
    } else if (model === 'SERVICE_JOB') {
      await field(
        'spJobDescription',
        'Accepted interior and exterior wash using the actual bay and team.',
      );
      await window('spJobWindow', '09:00', '09:30');
      await field('spJobCompletion', `${date}T18:00`);
    } else if (model === 'FREIGHT') {
      await field('spCargoDescription', 'Six sealed cartons for actual local road delivery.');
      await field('spPieces', '6');
      await field('spCargo:kg', '100');
      await field('spCargo:cbm', '1.5');
      await window('spLeg:road', '08:00', '12:00');
    }
    await page.getByLabel('Your name', { exact: true }).fill('Local specialist browser acceptance');
    await page.getByLabel('Email', { exact: true }).fill('workflows@example.test');
    const createdResponse = waitResponse(
      (value) =>
        value.request().method() === 'POST' && new URL(value.url()).pathname.endsWith('/bookings'),
    );
    await page
      .getByRole('button', { name: /^(Request booking|Send request)$/, exact: true })
      .click();
    const created = await (await createdResponse).json();
    assert.equal(created.booking?.status, 'pending', JSON.stringify(created));
    let booking = created.booking;
    await page.getByRole('region', { name: 'Fulfilment progress', exact: true }).waitFor();
    if (model === 'PRODUCTION_DUE') {
      booking = await progress(id, booking, 'IssueSpecialistQuote', {
        scopeVersion: 1,
        serviceSubtotalMinor: 175000,
        evidence: 'Owner proposed an exact price for the customer specification.',
      });
      await restore(id);
    }
    if (model !== 'ENTITLEMENT') {
      const labels = {
        TOUR: 'Accept itinerary and price',
        LINKED_WINDOWS: 'Accept collection, processing and return scope',
        SERVICE_JOB: 'Accept fixed service scope and price',
        PRODUCTION_DUE: 'Accept specification and price',
        FREIGHT: 'Accept cargo scope and price',
      };
      booking = await accept(labels[model]);
      const command = {
        TOUR: 'ConfirmTour',
        LINKED_WINDOWS: 'ConfirmCustomerDropoffPromise',
        SERVICE_JOB: 'ConfirmServiceWorkSlot',
        PRODUCTION_DUE: 'CommitProduction',
        FREIGHT: 'ConfirmFreightBooking',
      }[model];
      booking = await progress(id, booking, command);
      assert.ok(
        booking.specialist.allocations.length > 0,
        'Commitment must create actual role capacity claims.',
      );
    } else {
      booking = await progress(id, booking, 'ActivateMembership', {
        approval: { version: 1, priceMinor: booking.priceMinor },
      });
      await restore(id);
      await page.getByRole('button', { name: 'Book using plan credits', exact: true }).click();
      await page.getByLabel('Covered offering', { exact: true }).selectOption(child.id);
      await page.getByLabel('Child booking start · EAT', { exact: true }).fill(`${date}T10:00`);
      await page
        .getByLabel('Applicable remaining credit', { exact: true })
        .selectOption('training');
      const redeemedResponse = waitResponse(
        (value) =>
          value.request().method() === 'POST' &&
          new URL(value.url()).pathname.endsWith('/workflow'),
      );
      await page.getByRole('button', { name: 'Book covered service', exact: true }).click();
      const redeemed = await redeemedResponse;
      booking = await redeemed.json();
      assert.ok(redeemed.ok(), JSON.stringify(booking));
      assert.equal(booking.specialist.details.credits[0].quantityMinor, 1);
      assert.equal(booking.specialist.redemptions.length, 1);
      const childId = booking.specialist.redemptions[0].id;
      await page.getByRole('button', { name: 'View covered booking', exact: true }).click();
      await page.getByRole('button', { name: 'Change time', exact: true }).click();
      await page.getByLabel('New start · EAT', { exact: true }).fill(`${date}T11:00`);
      await page.getByLabel('New end · EAT', { exact: true }).fill(`${date}T12:00`);
      const movedResponse = waitResponse(
        (value) =>
          value.request().method() === 'POST' &&
          new URL(value.url()).pathname.endsWith('/reschedule'),
      );
      await page.getByRole('button', { name: 'Confirm new time', exact: true }).click();
      const moved = await (await movedResponse).json();
      assert.equal(moved.status, 'confirmed', JSON.stringify(moved));
      assert.equal(
        moved.priceMinor,
        0,
        'A covered booking must retain its accepted coverage when moved.',
      );
      page.once('dialog', (dialog) => dialog.accept());
      const cancelledResponse = waitResponse(
        (value) =>
          value.request().method() === 'POST' && new URL(value.url()).pathname.endsWith('/cancel'),
      );
      await page.getByRole('button', { name: 'Cancel booking', exact: true }).click();
      assert.equal((await (await cancelledResponse).json()).status, 'cancelled');
      await page.getByRole('button', { name: 'Back to plan', exact: true }).click();
      await page.getByRole('region', { name: 'Fulfilment progress', exact: true }).waitFor();
      const workspace = await merchant(id, 'workspace', undefined, 'GET');
      booking = workspace.bookings.find((entry) => entry.id === created.booking.id);
      assert.equal(
        booking.specialist.details.credits[0].quantityMinor,
        1,
        'Cancellation awaits the accepted merchant restoration review.',
      );
      assert.equal(
        Date.parse(booking.specialist.redemptions[0].startTime),
        Date.parse(`${date}T11:00:00+03:00`),
      );
      booking = await progress(id, booking, 'RestoreEntitlementCredit', {
        cancelledBooking: { bookingId: childId },
        evidence:
          'Owner reviewed the actual prestart cancellation and restored credit under the accepted plan policy.',
      });
      assert.equal(booking.specialist.details.credits[0].quantityMinor, 2);
    }
    await restore(id);
    assert.deepEqual(errors, []);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `${model} overflows a narrow viewport.`,
    );
    await page.screenshot({
      path: resolve(output, `workflow-${model.toLowerCase()}.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    record(
      `${model}: customer entered the typed workflow and reviewed its persisted native commitment${model === 'ENTITLEMENT' ? ', including actual credit-backed child booking' : ''}.`,
    );
  }
} catch (error) {
  process.exitCode = 1;
  console.error(error.stack ?? error.message);
  await page
    .screenshot({ path: resolve(output, 'workflow-smoke-failure.png'), fullPage: true })
    .catch(() => {});
} finally {
  await writeFile(
    resolve(output, 'workflow-browser-verification.json'),
    JSON.stringify(
      {
        completedAt: new Date().toISOString(),
        passed: !process.exitCode,
        attemptedModels,
        results,
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
