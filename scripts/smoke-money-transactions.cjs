/* Run against the isolated development preview: node scripts/smoke-money-transactions.cjs */
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const offerings = require('../apps/web/components/merchant/offerings/config.json');
const money = require('../apps/web/components/merchant/money/config.json');
const base = process.env.MONEY_PREVIEW_URL || 'http://localhost:3132';
const labels = { ORDER: 'Order', APPOINTMENT: 'Booking', FIELD_VISIT: 'Visit', ASSET_INTERVAL: 'Rental', TRANSFER: 'Trip', SESSION_CAPACITY: 'Booking', SPACE_RESERVATION: 'Reservation', TOUR: 'Tour', REQUEST_QUOTE: 'Request', PRODUCTION_DUE: 'Job', LINKED_WINDOWS: 'Service', SERVICE_JOB: 'Job', ENTITLEMENT: 'Membership', FREIGHT: 'Shipment', STORAGE: 'Storage' };

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 633 } });
    const page = await context.newPage(), errors = [], writes = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => { if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method())) writes.push(`${r.method()} ${r.url()}`); });
    await page.goto(`${base}/merchant-live-preview/money?profile=airport_pickup&tab=Transactions`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await expect(page.getByTestId('money-table-card')).toBeVisible({ timeout: 60000 });
    await page.getByRole('button', { name: 'Sample specialty' }).click();
    for (const [index, profile] of offerings.profiles.entries()) {
      await page.getByLabel('Sample specialty', { exact: true }).selectOption(profile.id);
      await expect(page.getByTestId('money-workspace')).toHaveAttribute('data-profile', profile.id, { timeout: 30000 });
      await expect(page.getByTestId('money-workspace')).toHaveAttribute('data-schema', profile.schema, { timeout: 30000 });
      await expect(page.getByTestId('money-workspace')).toHaveAttribute('data-ready', 'true', { timeout: 30000 });
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await page.getByRole('tab', { name: 'Transactions' }).click();
      const descriptor = money.descriptors.find((d) => d.schemaId === profile.schema);
      assert.ok(descriptor, `Missing Money descriptor for ${profile.id}`);
      await expect(page.getByRole('columnheader', { name: labels[descriptor.modelId], exact: true })).toBeVisible();
      await expect(page.getByLabel('Money summary')).toContainText('Payments received');
      await expect(page.getByLabel('Money summary')).toContainText('Refunds confirmed');
      await expect(page.getByTestId('money-inspector')).toContainText('Payment method');
      if ((index + 1) % 32 === 0) console.log(`Transaction views checked: ${index + 1}/${offerings.profiles.length}`);
      await page.getByRole('button', { name: 'Sample specialty' }).click();
    }
    assert.deepEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
    assert.deepEqual(writes, [], `Unexpected non-read requests: ${writes.join('; ')}`);
    console.log(`PASS: ${offerings.profiles.length} transaction views use workflow vocabulary and transaction-specific summaries; no browser errors or non-read requests`);
    await context.close();
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
