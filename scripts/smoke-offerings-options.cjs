const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const base = process.env.OFFERINGS_PREVIEW_URL || 'http://localhost:3140';
const assert = (value, message) => {
  if (!value) throw new Error(message);
};
let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1568, height: 1003 } });
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/merchant-live-preview/offerings`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  const editor = page.getByRole('complementary', { name: 'Offering editor' });
  const discountButton = editor.getByRole('button', { name: 'Add discount', exact: true });
  await discountButton.waitFor();
  assert(
    await discountButton.evaluate(
      (button) =>
        getComputedStyle(button).borderTopStyle === 'solid' &&
        button.getBoundingClientRect().height >= 32,
    ),
    'Add discount is not a visible outlined button',
  );
  await editor.getByRole('button', { name: 'Add discount', exact: true }).click();
  await editor.getByLabel('Discount percentage', { exact: true }).fill('15');
  assert(
    (await editor.getByText('KES 2,975 / appointment', { exact: true }).count()) > 0,
    'Percentage price preview is wrong',
  );
  await editor.getByRole('button', { name: 'Publish offering', exact: true }).click();
  await editor.getByRole('button', { name: 'Unpublish', exact: true }).waitFor();
  await page.screenshot({
    path: 'docs/merchant-portal-plan/offerings-concept/implementation/discount-state.png',
    fullPage: true,
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Edit Occasion makeup', exact: true }).waitFor();
  assert(
    (await page.locator('.of-table tbody tr').first().innerText()).includes('15% off'),
    'Published discount was not preserved',
  );
  const before = (await page.locator('.of-table-scroll').boundingBox()).width;
  await editor.getByRole('button', { name: 'Close offering editor', exact: true }).click();
  const after = (await page.locator('.of-table-scroll').boundingBox()).width;
  assert(after > before + 200, 'Catalogue did not expand after closing the editor');
  assert((await editor.count()) === 0, 'Closed editor is still rendered');
  await page.getByRole('button', { name: 'Edit Occasion makeup', exact: true }).click();
  await editor.getByRole('button', { name: 'Add offering', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Add an offering', exact: true })
    .getByRole('button')
    .filter({ hasText: /^Product/ })
    .click();
  await editor.getByLabel('Name *', { exact: true }).fill('Expanded panel item');
  await editor
    .getByLabel('Description', { exact: true })
    .fill('Created directly from the expanded product component.');
  await editor.getByLabel('Stock policy *', { exact: true }).fill('Only sell confirmed inventory.');
  await editor.getByRole('tab', { name: 'Pricing', exact: true }).click();
  await editor.getByLabel('Price (KES) *', { exact: true }).fill('600');
  await editor.getByText('Quantity and precision', { exact: true }).click();
  await editor.getByLabel('Minimum quantity', { exact: true }).fill('1');
  await editor.getByLabel('Maximum quantity (optional)', { exact: true }).fill('5');
  await editor.getByText('Options and extras (0)', { exact: true }).click();
  await editor.getByRole('button', { name: 'Add option group', exact: true }).click();
  await editor.getByLabel('Option group name', { exact: true }).fill('Size');
  await editor.getByRole('button', { name: 'Add choice', exact: true }).click();
  await editor.getByLabel('Choice name', { exact: true }).fill('Large');
  await editor.getByLabel('Extra price (KES)', { exact: true }).fill('200');
  await editor.getByRole('tab', { name: 'Availability', exact: true }).click();
  await editor.getByLabel('Link inventory to this offering', { exact: true }).check();
  await editor.getByLabel('Stock quantity', { exact: true }).fill('10');
  await editor.getByRole('button', { name: 'Publish offering', exact: true }).click();
  await editor.getByRole('button', { name: 'Unpublish', exact: true }).waitFor();
  await editor.getByRole('button', { name: 'Add discount', exact: true }).click();
  await editor.getByLabel('Discount type', { exact: true }).selectOption('amount');
  await editor.getByLabel('Discount amount (KES)', { exact: true }).fill('100');
  await editor.getByRole('button', { name: 'Publish changes', exact: true }).click();
  await editor.getByRole('button', { name: 'Unpublish', exact: true }).waitFor();
  const row = page
    .locator('.of-table tbody tr')
    .filter({ has: page.getByRole('button', { name: 'Edit Expanded panel item', exact: true }) });
  assert((await row.innerText()).includes('KES 500 / item'), 'Fixed amount discount is wrong');
  await editor.getByRole('button', { name: 'Edit discount', exact: true }).click();
  await editor.getByLabel('Discount amount (KES)', { exact: true }).fill('700');
  await editor.getByRole('button', { name: 'Publish changes', exact: true }).click();
  assert(
    (await editor.getByRole('alert').innerText()).includes('valid discount'),
    'Excessive discount published',
  );
  await editor.getByLabel('Discount amount (KES)', { exact: true }).fill('100');
  await editor.getByRole('tab', { name: 'Details', exact: true }).click();
  await editor.getByText('Organization and visibility', { exact: true }).click();
  await editor.getByLabel('Catalogue section', { exact: true }).fill('Featured products');
  await editor
    .getByLabel('Visibility starts (Nairobi time)', { exact: true })
    .fill('2035-11-01T09:00');
  await editor.getByLabel('Visibility ends (optional)', { exact: true }).fill('2035-12-01T09:00');
  await editor.getByText('Bundle composition (0)', { exact: true }).click();
  await editor.getByRole('button', { name: 'Add included offering', exact: true }).click();
  await editor.getByLabel('Included offering 1', { exact: true }).selectOption('makeup-sample-4');
  await editor.getByRole('button', { name: 'Publish changes', exact: true }).click();
  await editor.getByRole('button', { name: 'Unpublish', exact: true }).waitFor();
  await editor.getByRole('button', { name: 'Preview offering', exact: true }).click();
  assert(
    await editor.getByText('Scheduled visibility', { exact: true }).isVisible(),
    'Visibility schedule not shown',
  );
  assert(
    await editor.getByText('1 × Lip tint', { exact: true }).isVisible(),
    'Bundle constituent missing',
  );
  await page.getByRole('checkbox', { name: 'Select Expanded panel item', exact: true }).check();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByRole('button', { name: 'Archive 1 offering', exact: true }).click();
  await page.getByLabel('Publication filter', { exact: false }).selectOption('archived');
  await page.getByRole('button', { name: 'Edit Expanded panel item', exact: true }).click();
  await editor.getByRole('button', { name: 'Restore as draft', exact: true }).click();
  await editor.getByRole('button', { name: 'Publish offering', exact: true }).waitFor();
  await editor.getByRole('tab', { name: 'History', exact: true }).click();
  await editor.getByText('Restored as draft in preview', { exact: true }).waitFor();
  const fieldProfile =
    require('../apps/web/components/merchant/offerings/config.json').profiles.find(
      (profile) => profile.schema === 'FIELD_SERVICE_V1',
    );
  await page.getByRole('button', { name: /Choose sample specialty/ }).click();
  await page.getByLabel('Sample specialty', { exact: true }).selectOption(fieldProfile.id);
  await page.getByRole('button', { name: 'Open specialty', exact: true }).click();
  await page
    .locator(
      `[data-profile="${fieldProfile.id}"][aria-busy="false"] [data-schema="FIELD_SERVICE_V1"]`,
    )
    .waitFor();
  await editor.getByRole('button', { name: 'Add discount', exact: true }).click();
  await editor.getByLabel('Discount percentage', { exact: true }).fill('10');
  await editor.getByLabel('Pricing method', { exact: true }).selectOption('quote');
  assert(
    (await editor.getByLabel('Apply a discount to this offering', { exact: true }).isChecked()) ===
      false,
    'Quote switch retained an active discount',
  );
  await editor.getByRole('button', { name: 'Publish changes', exact: true }).click();
  await editor.getByRole('button', { name: 'Unpublish', exact: true }).waitFor();
  assert(
    (await page.getByText('Price on quotation', { exact: true }).count()) > 0,
    'Quote mode could not be published',
  );
  assert(errors.length === 0, errors.join(';'));
  fs.writeFileSync(
    'docs/merchant-portal-plan/offerings-concept/implementation/options-verification.json',
    JSON.stringify(
      {
        passed: true,
        checks: [
          'percentage-discount-publish-reload',
          'fixed-discount-publish',
          'invalid-discount-blocked',
          'closed-editor-expands-catalogue',
          'reopen-editor',
          'add-from-expanded-component',
          'quantity-rules',
          'option-groups',
          'visibility-window',
          'bundle-reference',
          'archive-restore',
          'discount-to-quote-disables-discount-and-publishes',
        ],
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'Discount publishing, expanded-panel creation, adaptive table width, options, quantities, schedules, bundles and restore passed.',
  );
  await browser.close();
})().catch(async (e) => {
  console.error(e);
  if (browser) await browser.close();
  process.exitCode = 1;
});
