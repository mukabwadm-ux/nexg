const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../apps/web/components/merchant/offerings/config.json');
const base = process.env.OFFERINGS_PREVIEW_URL || 'http://localhost:3129';
const output = path.resolve('docs/merchant-portal-plan/offerings-concept/implementation');
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};

let browser;
let page;
(async () => {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1568, height: 1003 } });
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(120000);
  await page.addInitScript(() =>
    localStorage.setItem(
      'nexg.cart.v1',
      JSON.stringify({
        merchantId: 'customer-store',
        merchantName: 'Customer store',
        lines: [{ id: 'cart-item', name: 'Customer cart item', price_kes: 100, quantity: 1 }],
      }),
    ),
  );
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const backend = [];
  page.on('request', (r) => {
    if (
      r.method() === 'POST' ||
      /supabase|\/api\/(merchant\/booking|booking-workspace)/.test(r.url())
    )
      backend.push(r.url());
  });
  await page.goto(`${base}/merchant-live-preview/offerings`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.getByRole('button', { name: 'Edit Occasion makeup', exact: true }).waitFor();
  check(
    (await page.getByRole('dialog').count()) === 0,
    'Customer popup blocks the merchant workspace',
  );
  check(
    (await page.getByRole('link', { name: /View cart/ }).count()) === 0,
    'Customer cart overlaps the merchant controls',
  );
  console.log('Loaded Offerings. Checking interactive journeys.');
  const editor = page.getByRole('complementary', { name: 'Offering editor' });
  check(
    (await page
      .getByRole('link', { name: 'Offerings', exact: true })
      .getAttribute('aria-current')) === 'page',
    'Offerings is not active in the shared navigation',
  );
  await editor.getByLabel('Name *', { exact: true }).fill('Occasion makeup edited');
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Occasion makeup edited', exact: true }).waitFor();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Edit Occasion makeup edited', exact: true }).click();
  check(
    (await editor.getByLabel('Name *', { exact: true }).inputValue()) === 'Occasion makeup edited',
    'Saved draft did not survive reload',
  );
  await editor.getByRole('button', { name: 'Publish offering', exact: true }).click();
  await editor.getByRole('button', { name: 'Unpublish', exact: true }).waitFor();
  await editor.getByRole('button', { name: 'Unpublish', exact: true }).click();
  await editor.getByRole('button', { name: 'Publish offering', exact: true }).waitFor();
  await editor.getByLabel('Name *', { exact: true }).fill('Unsaved example');
  await page.getByRole('button', { name: 'Edit Bridal makeup', exact: true }).click();
  await page.getByRole('dialog', { name: 'Keep your unsaved changes?' }).waitFor();
  await page.getByRole('button', { name: 'Discard and continue', exact: true }).click();
  await editor.getByRole('heading', { name: 'Bridal makeup', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Edit Lip tint', exact: true }).click();
  await editor.getByRole('tab', { name: 'Availability', exact: true }).click();
  check(
    await editor.getByLabel('Stock quantity', { exact: false }).isDisabled(),
    'Externally owned stock is editable',
  );
  await page.getByRole('button', { name: 'Manage connections', exact: true }).click();
  await page.getByLabel('Simulated connection state').selectOption('offline');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  check(
    (await page.getByText('Stock unavailable', { exact: true }).count()) > 0,
    'Unknown external stock is not represented',
  );
  await page.getByLabel('Search offerings', { exact: true }).fill('nothing-matches');
  await page.getByRole('heading', { name: 'No matching offerings', exact: true }).waitFor();
  await page.getByLabel('Search offerings', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page
    .getByLabel('Or paste CSV')
    .fill(
      'name,description,type,price_mode,price_kes,unit\nImported lipstick,Sample product,PRODUCT_CATALOG_V1,fixed,999.50,item',
    );
  await page.getByRole('button', { name: 'Check import', exact: true }).click();
  await page.getByText('1 valid drafts ready', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Import 1 drafts', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Imported lipstick', exact: true }).click();
  await editor.getByRole('button', { name: 'Publish offering', exact: true }).click();
  check(
    await editor
      .getByRole('alert')
      .innerText()
      .then((t) => t.includes('Link the stock')),
    'Incomplete imported item published',
  );
  await editor.getByRole('tab', { name: 'Availability', exact: false }).click();
  await editor.getByLabel('Link inventory to this offering').check();
  await editor.getByLabel('Stock quantity', { exact: false }).fill('0');
  await editor.getByRole('tab', { name: 'Details', exact: true }).click();
  await editor.getByLabel('Stock policy *').fill('Only sell confirmed quantities.');
  await editor.getByRole('button', { name: 'Publish offering', exact: true }).click();
  await editor.getByRole('button', { name: 'Unpublish', exact: true }).waitFor();
  check(
    (await page.getByText('Out of stock', { exact: true }).count()) > 0,
    'Zero stock was not separate from published status',
  );
  for (const failure of ['unknown-schema', 'missing-resources']) {
    await page.evaluate((failure) => {
      const key = 'nexg.offerings.preview.v1.makeup';
      const data = JSON.parse(localStorage.getItem(key));
      if (failure === 'unknown-schema') data.configuration.enabledSchemas = ['UNREGISTERED_EDITOR'];
      else delete data.offerings[0].resources;
      localStorage.setItem(key, JSON.stringify(data));
    }, failure);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page
      .getByRole('heading', { name: 'Offerings could not be loaded', exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'Reset this specialty’s sample', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Occasion makeup', exact: true }).waitFor();
    // Keep a persisted record available for the next corruption scenario.
    await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.getByText('Changes saved in this browser.', { exact: true }).waitFor();
  }
  const tested = [];
  const observedSchemas = new Set();
  for (const profile of config.profiles) {
    await page.getByRole('button', { name: /Choose sample specialty/ }).click();
    await page.getByLabel('Sample specialty', { exact: true }).selectOption(profile.id);
    await page.getByRole('button', { name: 'Open specialty', exact: true }).click();
    await page
      .locator(
        `[data-offerings-workspace][data-profile="${profile.id}"][aria-busy="false"] [data-schema="${profile.schema}"]`,
      )
      .waitFor();
    check(
      await editor.getByLabel('Name *', { exact: true }).isVisible(),
      `${profile.id}: editor did not render`,
    );
    const doc = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      width: document.documentElement.scrollWidth,
      clientHeight: innerHeight,
      clientWidth: innerWidth,
    }));
    check(
      doc.height <= doc.clientHeight + 1 && doc.width <= doc.clientWidth + 1,
      `${profile.id}: document escaped one screen`,
    );
    tested.push(profile.id);
    observedSchemas.add(profile.schema);
    if (tested.length % 16 === 0) console.log('Specialties rendered:', tested.length);
  }
  console.log('Primary editor types rendered:', observedSchemas.size);
  check(tested.length === 128, 'Not all specialties rendered');
  // Enable and render the conditional space editor through the actual merchant configuration.
  const spaceProfile = config.profiles.find((p) => p.models.includes('SPACE_RESERVATION'));
  await page.getByRole('button', { name: /Choose sample specialty/ }).click();
  await page.getByLabel('Sample specialty', { exact: true }).selectOption(spaceProfile.id);
  await page.getByRole('button', { name: 'Open specialty', exact: true }).click();
  await page.getByRole('button', { name: 'Configure offering types', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Spaces', exact: true }).check();
  await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
  await page
    .locator('.of-heading-actions')
    .getByRole('button', { name: 'Add offering', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Add an offering', exact: true })
    .getByRole('button')
    .filter({ hasText: /^Space/ })
    .click();
  await page.locator('[data-schema="SPACE_RESERVATION_V1"]').waitFor();
  observedSchemas.add('SPACE_RESERVATION_V1');
  check(observedSchemas.size === 18, 'Not all 18 editor types rendered');
  check(
    await editor.getByLabel('Maximum party size *', { exact: true }).isVisible(),
    'Conditional space editor has no party compatibility fields',
  );
  await editor.getByRole('button', { name: 'Close offering editor', exact: true }).click();
  await page.getByRole('button', { name: 'Discard and continue', exact: true }).click();
  // Restore the approved demonstration for the screenshot set.
  await page.getByRole('button', { name: /Choose sample specialty/ }).click();
  await page.getByLabel('Sample specialty', { exact: true }).selectOption('makeup');
  await page.getByRole('button', { name: 'Open specialty', exact: true }).click();
  await page.getByRole('button', { name: /Choose sample specialty/ }).click();
  await page.getByRole('button', { name: 'Reset current specialty’s sample', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Occasion makeup', exact: true }).waitFor();
  if (await page.getByRole('button', { name: 'Dismiss message', exact: true }).count())
    await page.getByRole('button', { name: 'Dismiss message', exact: true }).click();
  fs.mkdirSync(output, { recursive: true });
  for (const [name, width, height] of [
    ['desktop', 1568, 1003],
    ['compact', 1280, 720],
  ]) {
    await page.setViewportSize({ width, height });
    const bounds = await editor
      .getByRole('button', { name: 'Publish offering', exact: true })
      .boundingBox();
    check(
      bounds && bounds.y + bounds.height <= height,
      `${name}: publication controls escaped the viewport`,
    );
    const nameBox = await page.locator('.of-row-name').first().boundingBox();
    const priceBox = await page
      .locator('.of-table tbody tr')
      .first()
      .locator('td')
      .nth(2)
      .boundingBox();
    check(
      nameBox && priceBox && nameBox.x + nameBox.width <= priceBox.x + 1,
      `${name}: offering name overlaps price`,
    );
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Edit Occasion makeup', exact: true }).click();
  await page.getByRole('button', { name: 'Back to catalogue', exact: false }).waitFor();
  check(
    await editor.getByRole('button', { name: 'Preview offering', exact: true }).isVisible(),
    'Phone preview action is unnamed',
  );
  const button = await editor
    .getByRole('button', { name: 'Publish offering', exact: true })
    .boundingBox();
  check(
    button && button.y + button.height <= 844 && button.x + button.width <= 390,
    'Mobile publication controls escaped the screen',
  );
  check(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight <= innerHeight + 1 &&
        document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    'Mobile document overflows',
  );
  await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Back to catalogue', exact: false }).click();
  check(
    await page.getByLabel('Search offerings', { exact: true }).isVisible(),
    'Mobile return to catalogue failed',
  );
  check(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
  check(backend.length === 0, `Unexpected backend requests: ${backend.join('; ')}`);
  fs.writeFileSync(
    path.join(output, 'browser-verification.json'),
    JSON.stringify(
      {
        passed: true,
        specialtiesRendered: tested,
        registeredEditorsRendered: [...observedSchemas],
        checks: [
          'edit-save-reload',
          'publish-unpublish',
          'unsaved-guard',
          'external-stock-lock',
          'source-unavailable',
          'search-empty',
          'validated-import',
          'incomplete-publish-blocked',
          'published-out-of-stock',
          'conditional-space-configuration',
          'desktop-compact-mobile-bounds',
          'mobile-back',
          'no-backend-requests',
          'populated-customer-cart-hidden',
          'invalid-saved-configuration-recovery',
          'compact-name-price-separation',
          'named-phone-preview-action',
        ],
        browserErrors: errors,
        backendRequests: backend,
      },
      null,
      2,
    ),
  );
  console.log(
    'Offerings: all 128 specialties, 18 editor types, local persistence, publication, source ownership, import and single-screen desktop/mobile passed.',
  );
  await browser.close();
})().catch(async (e) => {
  console.error(e);
  if (page)
    console.error(
      (
        await page
          .locator('body')
          .innerText()
          .catch(() => '')
      ).slice(-6500),
    );
  if (browser) await browser.close();
  process.exitCode = 1;
});
