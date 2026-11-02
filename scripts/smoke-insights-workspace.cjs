/* Functional frontend acceptance. No screenshots, credentials or live writes. */
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const base = process.env.INSIGHTS_PREVIEW_URL || 'http://127.0.0.1:3141';
const output = path.join(
  __dirname,
  '../docs/merchant-portal-plan/insights-implementation/functional-verification.json',
);
const normalize = (value) =>
  value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const report = {
  startedAt: new Date().toISOString(),
  base,
  scope:
    'Local sample frontend; no live reporting correctness, authorization or accessibility certification claim.',
  screenshots: false,
  cases: [],
  runtimeErrors: [],
  forbiddenRequests: [],
  mutations: [],
};

function csvRows(text) {
  const rows = [];
  let row = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\r' || c === '\n') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  assert.equal(quoted, false, 'CSV quotes must be balanced');
  return rows;
}

async function writeReport() {
  await fs.mkdir(path.dirname(output), { recursive: true });
  report.passed = report.cases.filter((item) => item.status === 'passed').length;
  report.failed = report.cases.filter((item) => item.status === 'failed').length;
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => report.runtimeErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
      report.mutations.push({ method: request.method(), path: url.pathname });
    if (
      /supabase\.(co|in)$/.test(url.hostname) ||
      /^\/api\/(location|consent|merchant\/insights|payments|notifications)(\/|$)/.test(
        url.pathname,
      ) ||
      url.pathname.startsWith('/rest/v1/')
    )
      report.forbiddenRequests.push({ path: url.pathname, host: url.hostname });
  });
  const workspace = () => page.locator('[data-insights-workspace]');
  const metric = (id) => workspace().locator(`[data-metric="${id}"] > strong`);
  const dialog = () => page.getByRole('dialog').last();
  async function visit(query = '') {
    await page.goto(`${base}/merchant-live-preview/insights${query}`, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    await expect(workspace()).toBeVisible();
    await expect(workspace()).toHaveAttribute('data-ready', 'true', { timeout: 15000 });
    await expect
      .poll(() => new URL(page.url()).searchParams.has('tab'), {
        message: 'The client scope effect must hydrate before native controls are changed',
        timeout: 15000,
      })
      .toBe(true);
    await expect(workspace()).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('[aria-labelledby="location-sheet-title"]')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  async function tab(label) {
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const direct = workspace().getByRole('tab', { name: label, exact: true });
    if (await direct.isVisible()) await direct.click();
    else if (await page.getByLabel('Business insight area').isVisible())
      await page.getByLabel('Business insight area').selectOption({ label });
    else {
      await workspace().locator('.in-more > summary').click();
      await workspace().getByRole('button', { name: label, exact: true }).click();
    }
    await expect(workspace()).toHaveAttribute('data-active-tab', label.toLowerCase());
  }
  async function period(from, through) {
    await workspace()
      .getByRole('button', { name: /\d+ \w+ 2026.*\d+ \w+ 2026/ })
      .click();
    await dialog().getByLabel('From', { exact: true }).fill(from);
    await dialog().getByLabel('Through', { exact: true }).fill(through);
    await dialog().getByRole('button', { name: 'Apply reporting period' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  async function keyword(value) {
    await workspace()
      .getByRole('button', { name: /^Filters/ })
      .click();
    await dialog().getByLabel('Search contributing records').fill(value);
    await dialog().getByRole('button', { name: 'Show filtered reports' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  async function scenario(value) {
    await page.getByRole('button', { name: 'Sample business', exact: true }).click();
    await dialog().getByLabel('Source state').selectOption(value);
    await dialog().getByRole('button', { name: 'Explore this sample' }).click();
  }
  async function download() {
    await workspace().getByRole('button', { name: 'Export report', exact: true }).click();
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      dialog().getByRole('button', { name: 'Prepare CSV export' }).click(),
    ]);
    return {
      name: file.suggestedFilename(),
      rows: csvRows(await fs.readFile(await file.path(), 'utf8')),
    };
  }
  async function test(name, fn) {
    const started = Date.now();
    try {
      const evidence = await fn();
      report.cases.push({ name, status: 'passed', durationMs: Date.now() - started, evidence });
      console.log(`PASS ${name}`);
    } catch (error) {
      const state = await page
        .evaluate(() => ({
          url: location.pathname + location.search,
          activeTab: document
            .querySelector('[data-insights-workspace]')
            ?.getAttribute('data-active-tab'),
          text: document.querySelector('[data-insights-workspace]')?.textContent?.slice(0, 1600),
        }))
        .catch(() => null);
      report.cases.push({
        name,
        status: 'failed',
        durationMs: Date.now() - started,
        error: error.message,
        state,
      });
      console.log(`FAIL ${name}: ${error.message.slice(0, 700)}`);
      await page.keyboard.press('Escape').catch(() => {});
    }
    await writeReport();
  }

  try {
    await test('Restaurant overview, eight peers and distinct request/finance bases', async () => {
      await visit();
      assert.equal(normalize(await metric('order_completed').innerText()), '1,176');
      assert.equal(normalize(await metric('order_item_sales').innerText()), 'KES 1,176,000.00');
      const labels = [
        'Overview',
        'Orders',
        'Menu',
        'Customers',
        'Operations',
        'Promotions',
        'Finance',
        'Reports',
      ];
      for (const label of labels) {
        await tab(label);
        const selected = workspace().getByRole('tab', { name: label, exact: true });
        if (await selected.isVisible())
          await expect(selected).toHaveAttribute('aria-selected', 'true');
      }
      await tab('Orders');
      assert.equal(normalize(await metric('work_requested').innerText()), '1,248');
      await tab('Finance');
      for (const [id, value] of [
        ['merchant_credits', 'KES 1,176,000.00'],
        ['refund_debits', 'KES 17,640.00'],
        ['fee_debits', 'KES 58,800.00'],
        ['net_posted_credit', 'KES 1,099,560.00'],
      ])
        assert.equal(normalize(await metric(id).innerText()), value);
      return { tabs: labels, completed: 1176, requested: 1248, netPostedCreditKES: 1099560 };
    });
    await test('Branch and date scope recompute from evidence', async () => {
      await visit();
      await page.getByLabel('Report location').selectOption('westlands');
      await expect(metric('order_completed')).toHaveText('3');
      assert.equal(normalize(await metric('order_item_sales').innerText()), 'KES 1,200.00');
      await page.getByLabel('Report location').selectOption('karen');
      await period('2026-10-25', '2026-10-31');
      await expect(metric('order_completed')).toHaveText('336');
      assert.equal(normalize(await metric('order_item_sales').innerText()), 'KES 336,000.00');
      return { westlandsCompleted: 3, lastWeekKarenCompleted: 336 };
    });
    await test('Chart table exposes the same full-period values', async () => {
      await visit();
      const panel = workspace()
        .locator('section')
        .filter({
          has: page.getByRole('heading', { name: 'Completed orders by week', exact: true }),
        });
      await panel.getByRole('button', { name: 'Table view', exact: true }).click();
      const values = await panel.locator('tbody td').allTextContents();
      assert.deepEqual(
        values.map((v) => Number(v.replace(/,/g, ''))),
        [252, 280, 308, 336],
      );
      await panel.getByRole('button', { name: 'Chart view', exact: true }).click();
      await expect(panel.getByRole('figure')).toBeVisible();
      return { values, sum: values.reduce((a, v) => a + Number(v), 0) };
    });
    await test('Definition opens exact contributors and Back restores scoped origin', async () => {
      await visit();
      await page.getByLabel('Report location').selectOption('westlands');
      await period('2026-10-25', '2026-10-31');
      await workspace()
        .getByRole('button', { name: 'Definition: Completed orders', exact: true })
        .click();
      await expect(dialog()).toContainText('Completed in period');
      await dialog().getByRole('button', { name: 'View contributing evidence' }).click();
      await expect(workspace()).toHaveAttribute('data-active-tab', 'reports');
      await expect(
        workspace().getByRole('heading', { name: 'Completed orders evidence', exact: true }),
      ).toBeVisible();
      await expect(workspace()).toContainText('WEST-3');
      await expect(workspace()).not.toContainText('WEST-1');
      const file = await download();
      assert.equal(file.rows.length - 2, 1);
      assert.equal(file.rows[2][0], 'WEST-3');
      assert.ok(
        file.rows[0].includes('order_completed') &&
          file.rows[0].includes('westlands') &&
          file.rows[0].includes('2026-10-25'),
      );
      await workspace().getByRole('button', { name: 'Back to Overview', exact: true }).click();
      await expect(workspace()).toHaveAttribute('data-active-tab', 'overview');
      await expect(page.getByLabel('Report location')).toHaveValue('westlands');
      await expect(metric('order_completed')).toHaveText('1');
      return {
        contributor: 'WEST-3',
        exportedRows: 1,
        restoredLocation: 'westlands',
        restoredFrom: '2026-10-25',
      };
    });
    await test('Exact metric CSV exports every matching row, beyond table pagination', async () => {
      await visit();
      await workspace()
        .getByRole('button', { name: 'Definition: Completed orders', exact: true })
        .click();
      await dialog().getByRole('button', { name: 'View contributing evidence' }).click();
      const file = await download();
      assert.equal(file.rows.length - 2, 1176);
      assert.equal(new Set(file.rows.slice(2).map((row) => row[0])).size, 1176);
      assert.ok(file.rows.slice(2).every((row) => row[6] === 'completed'));
      assert.ok(
        !file.rows.slice(2).some((row) => ['ORD-1245', 'ORD-1244', 'WEST-1'].includes(row[0])),
      );
      return { rows: 1176, uniqueReferences: 1176, excludedCancelledOpenAndOtherBranch: true };
    });
    await test('Keyword filter updates totals and CSV with the exact matching record', async () => {
      await visit();
      await tab('Orders');
      await keyword('ORD-1248');
      await expect(metric('work_requested')).toHaveText('1');
      const file = await download();
      assert.equal(file.rows.length - 2, 1);
      assert.equal(file.rows[2][0], 'ORD-1248');
      assert.ok(file.rows[0].includes('ORD-1248'));
      assert.ok(!file.rows.flat().includes('ORD-1247'));
      await workspace().getByRole('button', { name: 'Clear evidence search' }).click();
      await expect(metric('work_requested')).toHaveText('1,248');
      return { keyword: 'ORD-1248', exportedReferences: [file.rows[2][0]], clearRestores: 1248 };
    });
    await test('Reports library search, selection and complete workspace', async () => {
      await visit();
      await tab('Reports');
      await page.getByLabel('Search reports', { exact: true }).fill('ready');
      const rows = workspace().locator('.in-library-row');
      await expect(rows).toHaveCount(1);
      await rows.first().click();
      await workspace().getByRole('button', { name: 'Open full report' }).click();
      await expect(
        workspace()
          .getByRole('heading', { name: /Ready promise timing/, exact: true })
          .first(),
      ).toBeVisible();
      await expect(workspace()).toContainText('matching evidence rows');
      return { search: 'ready', matchingReports: 1, reportOpened: true };
    });
    await test('Saved views persist, restore scope and delete on this device', async () => {
      await visit();
      await tab('Orders');
      await keyword('ORD-1248');
      await tab('Reports');
      await workspace().getByRole('button', { name: 'Save view', exact: true }).click();
      await dialog().getByLabel('View name', { exact: true }).fill('Smoke scoped orders');
      await dialog().getByRole('button', { name: 'Save on this device' }).click();
      await page.reload({ waitUntil: 'networkidle' });
      await expect(workspace()).toBeVisible();
      await expect(workspace()).toHaveAttribute('data-ready', 'true', { timeout: 15000 });
      await workspace().getByRole('button', { name: 'Coverage', exact: true }).click();
      await expect(dialog()).toBeVisible();
      await page.keyboard.press('Escape');
      await tab('Reports');
      await workspace()
        .getByRole('button', { name: /^Saved views/ })
        .click();
      await expect(workspace()).toContainText('Smoke scoped orders');
      await workspace().getByRole('button', { name: 'Open view', exact: true }).click();
      await expect(metric('work_requested')).toHaveText('1');
      await expect(workspace()).toContainText('ORD-1248');
      await tab('Reports');
      await workspace()
        .getByRole('button', { name: /^Saved views/ })
        .click();
      await workspace()
        .getByRole('button', { name: 'Delete Smoke scoped orders', exact: true })
        .click();
      await expect(workspace()).not.toContainText('Smoke scoped orders');
      return {
        savedOnDevice: true,
        survivesReload: true,
        restoredKeywordRows: 1,
        deletionConfirmed: true,
      };
    });
    await test('Current, confirmed empty, partial, unavailable and restricted source states', async () => {
      await visit();
      await scenario('empty');
      await expect(metric('order_completed')).toHaveText('0');
      await scenario('partial');
      await expect(workspace()).toContainText('partial');
      assert.equal((await workspace().locator('[data-status="partial"]').count()) > 0, true);
      await scenario('unavailable');
      await expect(
        workspace().getByRole('heading', { name: 'Reporting data is unavailable', exact: true }),
      ).toBeVisible();
      await expect(workspace().getByRole('figure')).toHaveCount(0);
      await scenario('restricted');
      for (const label of ['Customers', 'Promotions', 'Finance']) {
        await expect(workspace().getByRole('tab', { name: label, exact: true })).toHaveCount(0);
      }
      await expect(workspace().locator('[data-metric="order_item_sales"]')).toHaveCount(0);
      await expect(metric('order_completed')).toHaveText('1,176');
      await scenario('current');
      await expect(workspace().getByRole('tab', { name: 'Finance', exact: true })).toBeVisible();
      return {
        states: ['confirmed empty', 'partial', 'unavailable', 'restricted', 'current'],
        noUnavailableCharts: true,
        restrictedFinancialCardsAbsent: true,
      };
    });
    await test('Appointment and asset profiles retain meaningful model-specific reporting', async () => {
      await visit('?profile=haircare');
      await expect(page.getByLabel('Activity', { exact: true })).toContainText('Appointments');
      await expect(workspace().getByRole('tab', { name: 'Orders', exact: true })).toHaveCount(0);
      await tab('Appointments');
      await expect(metric('appointment_outcomes')).toHaveText('9');
      await tab('Finance');
      await expect(workspace()).toContainText('Unavailable');
      await visit('?profile=car_rental');
      await tab('Rentals');
      await expect(workspace()).toContainText('asset');
      await expect(workspace().locator('[data-metric="asset_reserved_util"]')).toBeVisible();
      await expect(workspace().getByRole('tab', { name: 'Appointments', exact: true })).toHaveCount(
        0,
      );
      return {
        appointmentProfile: 'haircare',
        completedAppointments: 9,
        rentalProfile: 'car_rental',
        incompatibleOrderTabsAbsent: true,
      };
    });
    await test('Keyboard peer navigation and dialog focus/escape restoration', async () => {
      await visit();
      const overview = workspace().getByRole('tab', { name: 'Overview', exact: true });
      await overview.focus();
      await page.keyboard.press('ArrowRight');
      await expect(workspace()).toHaveAttribute('data-active-tab', 'orders');
      await expect(workspace().getByRole('tab', { name: 'Orders', exact: true })).toBeFocused();
      const trigger = workspace().getByRole('button', { name: /4 Oct 2026.*31 Oct 2026/ });
      await trigger.click();
      await expect(dialog()).toBeVisible();
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        assert.ok(
          await dialog().evaluate((element) => element.contains(document.activeElement)),
          'Focus must stay inside the dialog',
        );
      }
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(trigger).toBeFocused();
      return {
        arrowKeySelectsAndFocuses: 'Orders',
        tabFocusTrapped: true,
        escapeRestoresTrigger: true,
      };
    });
    await test('Mobile 320px and 390px retain every peer and bounded document width', async () => {
      const sizes = [];
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await visit();
        for (const label of ['Orders', 'Menu', 'Customers', 'Operations', 'Promotions', 'Finance'])
          await tab(label);
        await tab('Reports');
        await tab('Overview');
        const dimensions = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
        }));
        assert.ok(
          dimensions.documentWidth <= dimensions.viewportWidth + 1,
          `Body overflows at ${width}px`,
        );
        const menu = page.getByRole('button', { name: 'Open workspace navigation', exact: true });
        const box = await menu.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44);
        await menu.click();
        await expect(page.getByRole('dialog')).toBeVisible();
        for (const label of [
          'Home',
          'Work',
          'Offerings',
          'Availability',
          'Business',
          'Money',
          'Promotions',
          'Insights',
          'Settings',
        ])
          await expect(dialog().getByRole('link', { name: label, exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(menu).toBeFocused();
        sizes.push({
          width,
          ...dimensions,
          allPeersReachable: true,
          menuTarget: { width: box.width, height: box.height },
        });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      return sizes;
    });
    await test('Unknown sample profile safely falls back without a runtime exception', async () => {
      await visit('?profile=not-a-registered-profile');
      await expect(workspace()).toHaveAttribute('data-profile', 'restaurant');
      await expect(workspace()).toContainText('That sample activity was not found. The restaurant example is shown.');
      await expect(metric('order_completed')).toHaveText('1,176');
      return { requestedUnknownProfile: true, explicitFallbackNotice: true, fallbackProfile: 'restaurant', completed: 1176 };
    });
    await test('Preview makes no source calls, mutations or guest consumer prompts', async () => {
      await visit();
      await expect(page.locator('[aria-labelledby="location-sheet-title"]')).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      assert.deepEqual(report.forbiddenRequests, []);
      assert.deepEqual(report.mutations, []);
      assert.deepEqual(report.runtimeErrors, []);
      return {
        forbiddenSourceRequests: 0,
        mutations: 0,
        runtimeErrors: 0,
        freshContextGuestPromptAbsent: true,
      };
    });
    await test('Unauthenticated real reporting API fails closed with private cache headers', async () => {
      const response = await context.request.get(
        `${base}/api/merchant/insights?from=2026-10-04&to=2026-10-31`,
      );
      const status = response.status();
      assert.ok([401, 403, 503].includes(status), `Unexpected private API status ${status}`);
      const headers = response.headers();
      assert.match(headers['cache-control'] || '', /private/);
      assert.match(headers['cache-control'] || '', /no-store/);
      const text = await response.text();
      assert.ok(
        !/Karibu|ORD-1248|1176000|service_role|eyJ/.test(text),
        'No fixture data or credentials may leak',
      );
      return {
        status,
        cacheControl: headers['cache-control'],
        vary: headers.vary,
        noCredentialsRead: true,
        noSampleDataReturned: true,
      };
    });
  } finally {
    report.finishedAt = new Date().toISOString();
    report.status = report.cases.some((item) => item.status === 'failed') ? 'FAILED' : 'PASSED';
    await writeReport();
    await browser.close();
  }
  console.log(
    JSON.stringify({ status: report.status, passed: report.passed, failed: report.failed, output }),
  );
  if (report.failed) process.exitCode = 1;
}

main().catch(async (error) => {
  report.fatal = error.stack || error.message;
  report.status = 'FAILED';
  await writeReport();
  console.error(error);
  process.exitCode = 1;
});
