const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto('http://127.0.0.1:5181/', { waitUntil: 'networkidle' });
    for (const [label, value] of [['Business name', 'Acacia Café'], ['First name', 'Amina'], ['Last name', 'Otieno'], ['Business email', 'amina@example.com'], ['Mobile phone', '0712345678']]) await page.getByLabel(label, { exact: false }).fill(value);
    await page.getByLabel('Business category', { exact: false }).selectOption('restaurants_food');
    await page.getByRole('checkbox', { name: 'Café', exact: true }).check();
    await page.locator('#business-registered').selectOption('false');
    await page.getByRole('checkbox', { name: /I accept/ }).check();
    await page.getByRole('button', { name: 'Preview setup Home', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome, Acacia Café' })).toBeVisible();
    await expect(page.getByText('Café setup', { exact: true })).toBeVisible();
    await expect(page.getByText('Café operating setup', { exact: true })).toBeVisible();
    await expect(page.locator('[aria-label="Selected merchant activities"]')).toContainText('Café:');
    await expect(page.locator('[data-merchant-workspace]')).not.toContainText(/CafÃ|cafã/);
    const result = { clientDate: '2026-11-02', status: 'PASS', scope: 'Targeted check after the shared-Home display adapter changed; IDs and registry rules remain unchanged.', checks: ['Canonical Café display label is consistent across registration, heading, task titles and activity summary.'] };
    fs.writeFileSync(path.join(__dirname, '../docs/merchant-portal-plan/onboarding-integration/implementation/phase-3-label-verification.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
