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
  const enterHome = async () => {
    await page.getByRole('button', { name: 'Preview setup Home', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome, Acacia Kitchen' })).toBeVisible();
  };
  const editTask = (title) =>
    page
      .locator('.mo-setup-list li')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
      .getByRole('button', { name: 'Review / add details' })
      .click();
  try {
    await page.goto('http://127.0.0.1:5181/', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Onboard your business' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Onboarding steps' })).toHaveCount(0);
    await expect(page.locator('form')).toHaveCount(1);
    await expect(page.locator('form fieldset')).toHaveCount(6);
    for (const label of [
      'Listing name',
      'Registered legal name',
      'Registration number',
      'Operating street address / premises',
      'KRA PIN',
      'Payout mobile number',
    ]) {
      await expect(page.getByLabel(label, { exact: false })).toHaveCount(0);
    }
    await expect(page.locator('.mo-registry-questions')).toHaveCount(0);
    journeys.push(
      'Initial registration is one page with the six requested groups and no operational setup wizard.',
    );
    await page.getByLabel('Business name', { exact: false }).fill('Acacia Kitchen');
    await page.getByLabel('First name', { exact: false }).fill('Amina');
    await page.getByLabel('Last name', { exact: false }).fill('Otieno');
    await page.getByLabel('Business email', { exact: false }).fill('amina@example.com');
    await page.getByLabel('Mobile phone', { exact: false }).fill('0712345678');
    await page.getByLabel('Business category', { exact: false }).selectOption('restaurants_food');
    await expect(page.getByRole('checkbox', { name: 'Café', exact: true })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Restaurant', exact: true }).check();
    await page.locator('#business-registered').selectOption('false');
    await expect(page.getByRole('checkbox', { name: /marketing messages/ })).not.toBeChecked();
    await page.getByRole('checkbox', { name: /Use my mobile number/ }).uncheck();
    await page.locator('#field-business-businessPhone').fill('+254 20 123 4567');
    await page.getByRole('button', { name: 'Preview setup Home', exact: true }).click();
    await expect(
      page.getByText('Acknowledge the platform terms and data notice to continue.', {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('checkbox', { name: /I accept/ }).check();
    await expect(
      page.getByText('Acknowledge the platform terms and data notice to continue.', {
        exact: true,
      }),
    ).toHaveCount(0);
    await page.screenshot({ path: path.join(output, 'registration-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: path.join(output, 'registration-phone.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await enterHome();
    journeys.push(
      'Required acknowledgement is explicit; marketing is optional; the core fields alone reach personalized Home.',
    );

    await editTask('Offerings');
    await expect(page.getByLabel('Listing name', { exact: false })).toBeVisible();
    await page.getByLabel('Listing name', { exact: false }).fill('Seasonal lunch');
    await page
      .getByRole('button', { name: 'Save and return to Home preview', exact: true })
      .click();
    await expect(
      page.getByText('1 draft listings retained. Complete the details later.', { exact: true }),
    ).toBeVisible();
    await editTask('Location and coverage');
    await page
      .getByLabel('Operating street address / premises', { exact: false })
      .fill('Westlands, Nairobi');
    await page.getByRole('button', { name: 'Back to Home preview', exact: true }).click();
    await expect(page.getByText('Westlands, Nairobi', { exact: true })).toBeVisible();
    journeys.push(
      'Original detailed sections open from Home; partial listing/location input is retained and does not force other setup.',
    );

    await editTask('Offerings');
    await expect(page.getByLabel('Listing name', { exact: false })).toHaveValue('Seasonal lunch');
    await page.getByLabel('Price (KES)', { exact: false }).fill('-10');
    await page.getByRole('button', { name: 'Back to Home preview', exact: true }).click();
    await page.getByRole('button', { name: 'Back to registration', exact: true }).click();
    await expect(page.locator('#field-business-businessPhone')).toHaveValue('+254 20 123 4567');
    await expect(page.getByLabel('Listing name', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Onboarding steps' })).toHaveCount(0);
    await enterHome();
    journeys.push(
      'Returning to registration restores only the short form; incomplete portal drafts cannot block it or lose their values.',
    );

    await page
      .getByRole('navigation', { name: 'Workspace sections' })
      .getByRole('button', { name: 'Work Locked' })
      .click();
    await expect(page.getByRole('heading', { name: 'Waiting for admin approval' })).toBeVisible();
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
    journeys.push(
      'Approval lock remains a safe preview; no API writes, OTP requests or runtime errors.',
    );
    const result = {
      clientDate: '2026-11-02',
      status: 'PASS',
      scope:
        'Phase 2 short-registration and deferred-editor frontend only. No real authentication, persistence or admin approval.',
      journeys,
      pageErrors: errors,
      networkWrites: writes,
    };
    fs.writeFileSync(
      path.join(output, 'phase-2-browser-verification.json'),
      JSON.stringify(result, null, 2) + '\n',
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    await page
      .screenshot({ path: path.join(output, 'phase-2-failure.png'), fullPage: true })
      .catch(() => {});
    fs.writeFileSync(
      path.join(output, 'phase-2-browser-verification.json'),
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
