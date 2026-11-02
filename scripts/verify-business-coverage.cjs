const { chromium } = require('@playwright/test');
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const config = JSON.parse(
  readFileSync(resolve(__dirname, '../apps/web/components/merchant/business/config.json'), 'utf8'),
);
(async () => {
  const browser = await chromium.launch({ headless: true });
  const passed = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 850 } });
    await page.goto('http://localhost:3129/merchant-live-preview/business', {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    await page.getByRole('heading', { name: 'Your activities', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Choose sample state' }).click();
    for (const profile of config.profiles) {
      await page.getByLabel('Sample specialty', { exact: true }).selectOption(profile.id);
      const expected =
        profile.id === 'haircare' ? 'Nairobi Collective' : `${profile.name} Collective`;
      await page.waitForFunction(
        (name) => document.querySelector('.bu-subtitle')?.textContent === name,
        expected,
      );
      const text = await page.locator('.bu-table').first().innerText();
      if (!text.includes(profile.id === 'haircare' ? 'Salon services' : profile.name))
        throw new Error(`Activity was not rendered for ${profile.id}`);
      passed.push(profile.id);
    }
    const report = {
      date: '2026-10-31',
      sourceRevision: config.revision,
      sourceSha256: config.sourceSha256,
      profileCount: passed.length,
      categoryCount: new Set(config.profiles.map((p) => p.categoryId)).size,
      passed: passed.length === 128,
      profiles: passed,
      scope:
        'Browser sample-selection and Business activity rendering for every baseline specialty. Separate unit and browser journey checks cover selected state and answer branches. This is not backend or all-combinations certification.',
    };
    writeFileSync(
      resolve(__dirname, '../docs/merchant-portal-plan/business-adaptation/frontend-coverage.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    console.log(
      `Business browser coverage: ${passed.length} / ${config.profiles.length} specialties rendered.`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
