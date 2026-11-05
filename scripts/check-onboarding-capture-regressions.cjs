const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('http://127.0.0.1:5181/', { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      const React = (await import('/node_modules/.vite/deps/react.js')).default;
      const reactDom = await import('/node_modules/.vite/deps/react-dom_client.js');
      const createRoot = reactDom.createRoot || reactDom.default.createRoot;
      const { default: Form } = await import('/src/MerchantOnboarding.jsx');
      document.getElementById('root').remove();
      const fixture = document.createElement('div');
      document.body.append(fixture);
      createRoot(fixture).render(
        React.createElement(Form, {
          previewMode: true,
          initialData: {
            business: {
              name: 'Acacia Assistance',
              firstName: 'Amina',
              lastName: 'Otieno',
              email: 'amina@example.com',
              phone: '0712345678',
              registered: false,
            },
            categoryId: 'vehicle_services',
            subcategories: ['vehicle_assistance'],
            offers: [
              {
                id: 'unassigned',
                name: 'New service draft',
                description: '',
                subcategory: '',
                priceMode: 'fixed',
                price: '',
                attributes: {},
              },
              {
                id: 'inactive',
                name: 'Car wash draft',
                description: '',
                subcategory: 'car_wash',
                priceMode: 'fixed',
                price: '',
                attributes: {},
              },
            ],
          },
          onSubmit: async (payload) => {
            window.captureResult = payload;
            return { preview: true };
          },
        }),
      );
    });
    const nav = page.getByRole('navigation', { name: 'Onboarding steps' });
    await nav.getByRole('button').nth(1).click();
    const details = page.locator('.mo-registry-questions details').first();
    await details.locator('summary').click();
    await details.getByRole('checkbox', { name: 'breakdown', exact: true }).check();
    await details.getByRole('checkbox', { name: 'breakdown', exact: true }).uncheck();
    await expect(details.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Skip extra setup and review' }).click();
    await page.getByRole('checkbox', { name: /I confirm/ }).check();
    await page.getByRole('checkbox', { name: /I accept/ }).check();
    await page.getByRole('button', { name: 'Preview setup Home', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome, Acacia Assistance' })).toBeVisible();
    expect(
      await page.evaluate(() =>
        window.captureResult.offers.map(({ name, price, activityState }) => ({
          name,
          price,
          activityState,
        })),
      ),
    ).toEqual([
      { name: 'New service draft', price: null, activityState: 'unassigned' },
      { name: 'Car wash draft', price: null, activityState: 'inactive' },
    ]);
    expect(await page.evaluate(() => window.captureResult.answersBySubcategory)).toEqual({});
    await expect(
      page.getByText(
        '2 draft listings retained. Complete the details later. 2 need an activity selection.',
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Review information supplied' }).click();
    await expect(
      page.getByText('New service draft, Car wash draft', { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    const result = {
      clientDate: '2026-11-02',
      status: 'PASS',
      scope: 'Targeted checks after RegistryQuestions, payload and Home draft handling changed.',
      checks: [
        'Clearing the last optional choice removes the answer and permits continuing.',
        'Unassigned and inactive captured listings survive the submit callback without zero-priced defaults.',
        'Home shows retained drafts that still need activity selection.',
      ],
      pageErrors: errors,
    };
    fs.writeFileSync(
      path.join(
        __dirname,
        '../docs/merchant-portal-plan/onboarding-integration/implementation/capture-regressions.json',
      ),
      JSON.stringify(result, null, 2) + '\n',
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
