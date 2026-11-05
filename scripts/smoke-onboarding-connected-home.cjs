const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const output = path.join(
  __dirname,
  '../docs/merchant-portal-plan/onboarding-integration/implementation',
);
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const writes = [];
  const journeys = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url());
  });
  const row = (title) =>
    page
      .locator('[aria-labelledby="setup-title"] li')
      .filter({ has: page.getByText(title, { exact: true }) });
  const edit = (title) => row(title).getByRole('button').click();
  const save = () =>
    page.getByRole('button', { name: 'Save and return to Home preview', exact: true }).click();
  const assertProgress = async (done, total) => {
    const bar = page.getByRole('progressbar', { name: 'Setup progress' });
    await expect(bar).toHaveAttribute('aria-valuenow', String(done));
    await expect(bar).toHaveAttribute('aria-valuemax', String(total));
  };
  try {
    await page.goto('http://127.0.0.1:5181/', { waitUntil: 'networkidle' });
    await page.getByLabel('Business name', { exact: false }).fill('Acacia Kitchen');
    await page.getByLabel('First name', { exact: false }).fill('Amina');
    await page.getByLabel('Last name', { exact: false }).fill('Otieno');
    await page.getByLabel('Business email', { exact: false }).fill('amina@example.com');
    await page.getByLabel('Mobile phone', { exact: false }).fill('0712345678');
    await page.getByLabel('Business category', { exact: false }).selectOption('restaurants_food');
    await page.getByRole('checkbox', { name: 'Restaurant', exact: true }).check();
    await page.locator('#business-registered').selectOption('false');
    await page.getByRole('checkbox', { name: /I accept/ }).check();
    await page.getByRole('button', { name: 'Preview setup Home', exact: true }).click();
    await expect(page.locator('[data-merchant-workspace]')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Welcome, Acacia Kitchen' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Finish setting up to go live' })).toBeVisible();
    await assertProgress(1, 4);
    await expect(page.getByText('Nairobi Collective', { exact: true })).toHaveCount(0);
    await expect(page.getByText('3 of 7 completed · 4 remaining', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Your location/ })).toBeVisible();
    journeys.push(
      'Basic entry renders the shared merchant Home/frame with real business details and calculated 1/4 readiness, not sample 3/7.',
    );
    await page.screenshot({
      path: path.join(output, 'connected-home-desktop.png'),
      fullPage: true,
    });

    await edit('Restaurant setup');
    await expect(page.locator('[data-merchant-workspace]')).toHaveCount(1);
    await page.locator('.mo-registry-questions summary').first().click();
    await page.getByRole('checkbox', { name: 'kenyan', exact: true }).check();
    await page.getByRole('checkbox', { name: 'italian', exact: true }).check();
    for (const id of ['Q_TABLE_SERVICE', 'Q_HAS_PHYSICAL_SEATING', 'Q_RESERVATION_SYSTEM'])
      await page.locator(`#question-restaurant-${id}`).selectOption('false');
    await page.locator('#question-restaurant-Q_AVG_PREP_TIME').fill('0');
    const minimum = page.locator('#question-restaurant-Q_MIN_ORDER');
    if (await minimum.evaluate((element) => element.tagName === 'SELECT'))
      await minimum.selectOption('none');
    else await minimum.fill('none');
    await save();
    await assertProgress(2, 4);
    await expect(
      row('Restaurant setup').getByText('Details supplied', { exact: true }),
    ).toBeVisible();
    await expect(
      row('Restaurant setup').getByRole('button', { name: /Review details/ }),
    ).toBeEnabled();
    journeys.push(
      'Specialty answers, including false, zero and multiple selected choices, flow through the existing editor into the shared Home progress.',
    );

    await edit('Opening hours and availability');
    await page.getByRole('checkbox', { name: 'Monday', exact: true }).check();
    await save();
    await assertProgress(3, 4);
    journeys.push(
      'An applicable hours task completes from the captured schedule, while launch remains pending.',
    );

    await edit('Documents and evidence');
    await page.locator('#upload-owner_id').setInputFiles({
      name: 'owner-id.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\nPreview evidence only'),
    });
    await save();
    await expect(
      row('Documents and evidence').getByText('Selected locally', { exact: true }),
    ).toBeVisible();
    await assertProgress(3, 4);
    await edit('Payout details');
    await page.getByLabel('Account holder name', { exact: false }).fill('Acacia Kitchen');
    await page.getByLabel('Payout mobile number', { exact: false }).fill('0712345678');
    await save();
    await expect(
      row('Payout details').getByText('Details supplied', { exact: true }),
    ).toBeVisible();
    await assertProgress(3, 4);
    const launch = row('Review and launch');
    await expect(launch).toBeVisible();
    await expect(launch.getByRole('button')).toHaveCount(0);
    journeys.push(
      'Pending evidence/payout editors remain usable; selected files and account details never become verified or unblock launch.',
    );

    await page.getByRole('button', { name: 'Help', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Help with setup' })).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    journeys.push('The existing accessible Home drawer is reused for help.');

    await page.getByRole('button', { name: 'Review registration', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Onboarding steps' })).toHaveCount(0);
    await expect(page.getByLabel('Business name', { exact: false })).toHaveValue('Acacia Kitchen');
    await page.getByLabel('Business name', { exact: false }).fill('Acacia Advisory');
    await page.getByLabel('Business category', { exact: false }).selectOption('financial_services');
    await page.getByRole('checkbox', { name: 'Business Services', exact: true }).check();
    await page.getByRole('button', { name: 'Preview setup Home', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome, Acacia Advisory' })).toBeVisible();
    await assertProgress(1, 3);
    await expect(page.getByText('Opening hours and availability', { exact: true })).toHaveCount(0);
    await expect(page.locator('[aria-labelledby="setup-title"]')).not.toContainText(
      /preparation time|test order|delivery zone/i,
    );
    journeys.push(
      'Changing the selected business activity produces its own task list and denominator without restaurant defaults or fake branch records.',
    );

    await page.setViewportSize({ width: 390, height: 844 });
    const reviewButton = await page
      .getByRole('button', { name: 'Review registration', exact: true })
      .boundingBox();
    expect(reviewButton.x >= 0 && reviewButton.x + reviewButton.width <= 390).toBe(true);
    await page.getByLabel('Open workspace navigation').click();
    await page
      .getByRole('navigation', { name: 'Merchant workspace navigation' })
      .getByRole('button', { name: 'Work Locked', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Waiting for admin approval' })).toBeVisible();
    await expect(
      page.getByText('Preview only. No operational records are loaded behind this lock.', {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Back to Home', exact: true }).click();
    await assertProgress(1, 3);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: path.join(output, 'connected-home-phone.png'), fullPage: true });
    journeys.push(
      'Phone navigation preserves approval locks, fits the header, and returns to the same entered business.',
    );
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
    const result = {
      clientDate: '2026-11-02',
      status: 'PASS',
      scope:
        'Shared existing merchant Home/frame with local registration/task adapter; no actual sign-in, server save or admin decision.',
      journeys,
      pageErrors: errors,
      networkWrites: writes,
    };
    fs.writeFileSync(
      path.join(output, 'phase-3-browser-verification.json'),
      JSON.stringify(result, null, 2) + '\n',
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    await page
      .screenshot({ path: path.join(output, 'phase-3-failure.png'), fullPage: true })
      .catch(() => {});
    fs.writeFileSync(
      path.join(output, 'phase-3-browser-verification.json'),
      JSON.stringify(
        { status: 'FAIL', journeys, error: String(error), pageErrors: errors },
        null,
        2,
      ) + '\n',
    );
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
