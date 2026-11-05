const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/merchant-portal-plan/onboarding-integration/implementation');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  const writes = [];
  const steps = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url());
  });
  const navigate = (index) =>
    page
      .getByRole('navigation', { name: 'Onboarding steps' })
      .getByRole('button')
      .nth(index)
      .click();
  const previewHome = async () => {
    await navigate(5);
    await page.getByRole('checkbox', { name: /I confirm/ }).check();
    await page.getByRole('checkbox', { name: /I accept/ }).check();
    await page.getByRole('button', { name: 'Preview setup Home', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome, Acacia Kitchen' })).toBeVisible();
  };
  try {
    await page.goto(process.env.ONBOARDING_PREVIEW_URL || 'http://127.0.0.1:5181/', {
      waitUntil: 'networkidle',
    });
    await expect(page.getByRole('heading', { name: 'Onboard your business' })).toBeVisible();
    await page.getByLabel('Business name', { exact: false }).fill('Acacia Kitchen');
    await page.getByLabel('First name', { exact: false }).fill('Amina');
    await page.getByLabel('Last name', { exact: false }).fill('Otieno');
    await page.getByLabel('Mobile phone', { exact: false }).fill('0712345678');
    await page.getByLabel('Business email', { exact: false }).fill('amina@example.com');
    await page.locator('#business-registered').selectOption('false');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Business category', { exact: false }).selectOption('restaurants_food');
    await page.getByRole('checkbox', { name: 'Restaurant', exact: true }).check();
    await page.getByRole('button', { name: 'Skip extra setup and review' }).click();
    await previewHome();
    await expect(page.getByText('Waiting for admin approval', { exact: true })).toBeVisible();
    await expect(page.getByText('No sign-in or admin decision has taken place.')).toBeVisible();
    steps.push(
      'Basic registration reaches Home with operational details entirely omitted; no fake authentication or approval.',
    );
    await page.screenshot({ path: path.join(output, 'home-preview-desktop.png'), fullPage: true });

    await page
      .getByRole('navigation', { name: 'Workspace sections' })
      .getByRole('button', { name: 'Work Locked' })
      .click();
    await expect(page.getByRole('heading', { name: 'Waiting for admin approval' })).toBeVisible();
    await expect(
      page.getByText('This visual preview contains no restricted operational data.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Back to Home', exact: true }).click();
    steps.push('Operational section shows a safe approval lock and returns to Home.');

    await page.getByRole('button', { name: 'Back to registration' }).click();
    await navigate(1);
    const questions = page.locator('.mo-registry-questions details').first();
    await questions.locator('summary').click();
    const booleanQuestion = questions
      .locator('select')
      .filter({ has: page.locator('option[value="false"]') })
      .first();
    await booleanQuestion.selectOption('false');
    await page.getByLabel('Listing name', { exact: false }).fill('Seasonal lunch');
    await navigate(2);
    await page
      .getByLabel('Operating street address / premises', { exact: false })
      .fill('Westlands, Nairobi');
    await navigate(4);
    await page.locator('#upload-owner_id').setInputFiles({
      name: 'owner-id.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\nPreview evidence only'),
    });
    await navigate(1);
    await page.getByLabel('Business category', { exact: false }).selectOption('wellness');
    await page.getByRole('checkbox', { name: 'Spa', exact: true }).check();
    await page.getByLabel('Business category', { exact: false }).selectOption('restaurants_food');
    await expect(page.getByRole('checkbox', { name: 'Restaurant', exact: true })).toBeChecked();
    await expect(page.getByLabel('Listing name', { exact: false })).toHaveValue('Seasonal lunch');
    await questions.locator('summary').click();
    await expect(booleanQuestion).toHaveValue('false');
    await navigate(2);
    await expect(
      page.getByLabel('Operating street address / premises', { exact: false }),
    ).toHaveValue('Westlands, Nairobi');
    await navigate(4);
    await expect(page.getByText('Selected: owner-id.pdf', { exact: true })).toBeVisible();
    steps.push(
      'Captured listing, false specialty answer, location and private in-memory file survive navigation and category restoration.',
    );

    await previewHome();
    await expect(
      page.getByText('1 draft listings retained. Complete the details later.', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Review information supplied' }).click();
    await expect(page.getByText('Seasonal lunch', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: path.join(output, 'home-preview-phone.png'), fullPage: true });
    steps.push('Home reflects captured drafts; phone layout remains within viewport.');

    await page.getByRole('button', { name: 'Back to registration' }).click();
    await navigate(2);
    await expect(page.locator('.mo-panel .mo-required')).toHaveCount(0);
    await navigate(3);
    await expect(page.locator('.mo-panel .mo-required')).toHaveCount(0);
    await navigate(4);
    await expect(page.locator('.mo-panel .mo-required')).toHaveCount(0);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByLabel('Business name', { exact: false })).toHaveValue('');
    expect(
      await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
    ).toEqual({ local: 0, session: 0 });
    expect(writes).toEqual([]);
    expect(pageErrors).toEqual([]);
    steps.push(
      'Pre-auth optional sections have no required markers; no API writes, browser persistence or runtime errors; refresh clears the preview.',
    );
    fs.writeFileSync(
      path.join(output, 'browser-verification.json'),
      JSON.stringify(
        {
          clientDate: '2026-11-02',
          status: 'PASS',
          scope:
            'Standalone frontend preview only. No real OTP, account, backend or admin decision.',
          journeys: steps,
          networkWrites: writes,
          pageErrors,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(JSON.stringify({ status: 'PASS', journeys: steps }, null, 2));
  } catch (error) {
    await page
      .screenshot({ path: path.join(output, 'browser-failure.png'), fullPage: true })
      .catch(() => {});
    fs.writeFileSync(
      path.join(output, 'browser-verification.json'),
      JSON.stringify(
        {
          clientDate: '2026-11-02',
          status: 'FAIL',
          completedJourneys: steps,
          error: String(error),
          pageErrors,
          networkWrites: writes,
        },
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
