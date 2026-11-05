/* Run against the isolated frontend preview: node scripts/smoke-money-payouts.cjs */
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const offerings = require('../apps/web/components/merchant/offerings/config.json');
const base = process.env.MONEY_PREVIEW_URL || 'http://localhost:3132';
const output = path.join(__dirname, '../docs/merchant-portal-plan/money-concept/implementation');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const errors = [],
    writes = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 633 },
      deviceScaleFactor: 1.5,
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
        writes.push(`${request.method()} ${request.url()}`);
    });
    await page.goto(`${base}/merchant-live-preview/money?profile=restaurant&tab=Payouts`, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    await expect(page.getByTestId('money-table-card')).toBeVisible({ timeout: 60000 });
    const summary = page.getByLabel('Money summary'),
      details = page.getByTestId('money-inspector');
    for (const text of [
      'Available for payout',
      'KES 30,000',
      'Payouts in progress',
      'Paid payouts',
      'KES 150,000',
      'Settlement reserve',
      'KES 22,000',
    ])
      await expect(summary).toContainText(text);
    await expect(details).toContainText('Settlement as of 3 Nov');
    await page.screenshot({ path: path.join(output, 'payouts-refined.png') });
    await page.getByRole('button', { name: 'Open PAY-1031' }).click();
    await expect(details).toContainText('Payout · PAY-1031');
    await expect(details).toContainText('KES 150,000');
    await expect(details).toContainText('Destination');
    await expect(details).toContainText('Not supplied');
    await expect(details).not.toContainText('KES 30,000');
    await page.getByRole('button', { name: 'View payout details' }).click();
    await expect(page.getByRole('dialog')).toContainText('Payout PAY-1031');
    await expect(page.getByRole('dialog')).toContainText('KES 150,000');
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.getByLabel('Filter payouts & settlements').selectOption('Paid');
    await expect(page.getByRole('button', { name: 'Open SET-1103' })).toHaveCount(0);
    await expect(details).toContainText('PAY-1031');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export', exact: true }).click(),
    ]);
    const csv = await fs.readFile(await download.path(), 'utf8');
    assert.ok(
      csv.includes('PAY-1031') && csv.includes('KES 150,000') && !csv.includes('SET-1103'),
      'Filtered export must match the selected payout records',
    );
    await page.getByLabel('Filter payouts & settlements').selectOption('All');
    await page.getByLabel('Search payouts & settlements').fill('SET-1103');
    await expect(details).toContainText('Settlement as of 3 Nov');
    await expect(page.getByRole('button', { name: 'Open PAY-1031' })).toHaveCount(0);
    await page.getByLabel('Search payouts & settlements').fill('');
    console.log('Payout record selection, status, filters, details and scoped export passed');

    for (const scenario of ['offline', 'unknown', 'error', 'empty', 'partial', 'stale']) {
      await page.goto(
        `${base}/merchant-live-preview/money?profile=restaurant&tab=Payouts&scenario=${scenario}`,
        { waitUntil: 'domcontentloaded', timeout: 90000 },
      );
      await expect(page.getByTestId('money-table-card')).toBeVisible({ timeout: 30000 });
      if (['offline', 'unknown', 'error'].includes(scenario)) {
        await expect(summary).toContainText('Unavailable');
        await expect(details).toContainText('Source unavailable');
        await expect(summary).not.toContainText('KES 0');
      } else if (scenario === 'empty') {
        await expect(summary).toContainText('No records');
        await expect(details).toContainText('No sample records');
      } else if (scenario === 'partial') {
        await expect(summary).toContainText('Incomplete');
        await expect(summary).toContainText('KES 150,000');
        await expect(details).toContainText('coverage is incomplete');
      } else {
        await expect(page.getByText(/Last confirmed sample/)).toBeVisible();
        await expect(summary).toContainText('KES 30,000');
      }
    }
    console.log('Offline, unknown, error, empty, partial and stale source states passed');

    await page.goto(`${base}/merchant-live-preview/money?profile=restaurant&tab=Transactions`, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    await expect(page.getByTestId('money-table-card')).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: 'Open TX-6112' }).click();
    await page.getByRole('button', { name: 'Review sample refund' }).click();
    await page.getByLabel('Refund amount (KES)').fill('100');
    await page.getByLabel('Refund reason').fill('Sample customer return');
    await page.getByRole('button', { name: 'Save and review' }).click();
    await page.getByRole('button', { name: 'Submit sample result' }).click();
    await page.getByRole('tab', { name: 'Payouts' }).click();
    await expect(summary).toContainText('Needs refresh');
    await expect(summary).toContainText('KES 150,000');
    await expect(details).toContainText('refund changed or is being checked');
    await page.getByRole('button', { name: 'Open PAY-1031' }).click();
    await expect(details).toContainText('KES 150,000');
    await page.getByRole('tab', { name: 'Transactions' }).click();
    await page.getByRole('button', { name: 'Open TX-6112' }).click();
    await page.getByRole('button', { name: 'Check refund status' }).click();
    await page.getByRole('button', { name: 'Sample confirms refund' }).click();
    await page.getByRole('button', { name: 'Refresh sample statement' }).click();
    await page.getByRole('tab', { name: 'Payouts' }).click();
    await expect(summary).toContainText('KES 29,900');
    await expect(summary).toContainText('KES 150,000');
    console.log(
      'Unknown and confirmed refunds do not incorrectly change prior paid payout history',
    );

    // The separate context is disposable. Enabling a source here is an explicit local sample, not a merchant configuration.
    const matrix = await browser.newContext({ viewport: { width: 1280, height: 633 } });
    const matrixPage = await matrix.newPage();
    matrixPage.on('pageerror', (error) => errors.push(error.message));
    matrixPage.on('request', (request) => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
        writes.push(`${request.method()} ${request.url()}`);
    });
    await matrixPage.goto(`${base}/merchant-live-preview/money?profile=restaurant`, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    await expect(matrixPage.getByTestId('money-table-card')).toBeVisible({ timeout: 30000 });
    await matrixPage.getByRole('button', { name: 'Sample specialty' }).click();
    assert.equal(offerings.profiles.length, 128);
    for (const [index, profile] of offerings.profiles.entries()) {
      await matrixPage.getByLabel('Sample specialty', { exact: true }).selectOption(profile.id);
      const workspace = matrixPage.getByTestId('money-workspace');
      await expect(workspace).toHaveAttribute('data-profile', profile.id, { timeout: 30000 });
      await expect(workspace).toHaveAttribute('data-schema', profile.schema, { timeout: 30000 });
      await expect(workspace).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
      const capability = matrixPage.getByLabel('NEXG settlement and payout source');
      if (profile.id !== 'restaurant') await expect(capability).not.toBeChecked();
      if (!(await capability.isChecked())) {
        await capability.check();
        await matrixPage.getByRole('button', { name: 'Apply sample capabilities' }).click();
      } else {
        await matrixPage.getByRole('button', { name: 'Done', exact: true }).click();
      }
      await matrixPage.getByRole('tab', { name: 'Payouts' }).click();
      await expect(matrixPage.getByLabel('Money summary')).toContainText('Available for payout');
      await expect(matrixPage.getByLabel('Money summary')).toContainText('Paid payouts');
      await expect(matrixPage.getByTestId('money-inspector')).toContainText(
        'Settlement as of 3 Nov',
      );
      await expect(matrixPage.getByText(/NEXG-collected sample/).first()).toBeVisible();
      if ((index + 1) % 32 === 0)
        console.log(
          `Explicit payout-source previews checked: ${index + 1}/${offerings.profiles.length}`,
        );
      await matrixPage.getByRole('button', { name: 'Sample specialty' }).click();
    }
    await matrix.close();

    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
    });
    const mobilePage = await mobile.newPage();
    mobilePage.on('pageerror', (error) => errors.push(error.message));
    await mobilePage.goto(
      `${base}/merchant-live-preview/money?profile=restaurant&tab=Payouts&role=viewer`,
      { waitUntil: 'domcontentloaded', timeout: 90000 },
    );
    await expect(mobilePage.getByTestId('money-table-card')).toBeVisible({ timeout: 30000 });
    assert.equal(
      await mobilePage.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
      true,
      'Mobile viewport must not overflow horizontally',
    );
    await mobilePage.getByRole('button', { name: 'Open PAY-1031' }).click();
    await expect(mobilePage.getByTestId('money-inspector')).toContainText('Payout · PAY-1031');
    await mobilePage.screenshot({ path: path.join(output, 'payouts-mobile.png') });
    await mobile.close();
    assert.deepEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
    assert.deepEqual(writes, [], `Unexpected non-read requests: ${writes.join('; ')}`);
    console.log('PASS: all 128 specialties, responsive preview and read-only sample behaviour');
    await context.close();
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
