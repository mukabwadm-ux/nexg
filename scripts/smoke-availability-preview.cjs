const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const config = require('../apps/web/components/merchant/offerings/config.json');
const base = process.env.AVAILABILITY_URL || 'http://localhost:3129';
const out = path.resolve(
  __dirname,
  '../docs/merchant-portal-plan/availability-concept/implementation',
);
const check = (value, message) => {
  if (!value) throw new Error(message);
};
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage(),
    errors = [],
    writes = [];
  page.setDefaultNavigationTimeout(90000);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method())) writes.push(r.method() + ' ' + r.url());
  });
  const ready = async (id) => {
    await page
      .locator('[data-availability-workspace][data-profile="' + id + '"][aria-busy="false"]')
      .waitFor();
  };
  const open = async (id) => {
    await page.goto(base + '/merchant-live-preview/availability?profile=' + id, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    await ready(id);
  };
  const sample = async () => {
    await page.getByRole('button', { name: 'Sample specialty', exact: true }).click();
    return page.getByRole('dialog');
  };
  const switchTo = async (id) => {
    const dialog = await sample();
    await dialog.getByLabel('Sample specialty', { exact: true }).selectOption(id);
    await dialog.getByRole('button', { name: 'Open specialty', exact: true }).click();
    await ready(id);
  };
  const close = async () => {
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  };
  const result = {
    route: base + '/merchant-live-preview/availability',
    flows: [],
    profiles: [],
    bindings: [],
    schemas: [],
    errors,
    writes,
  };
  try {
    await open('restaurant');
    check(
      (await page
        .getByRole('link', { name: 'Availability', exact: true })
        .getAttribute('aria-current')) === 'page',
      'Availability not active in shared navigation',
    );
    check(
      (await page.getByRole('dialog').count()) === 0,
      'Consumer location/onboarding prompt appeared',
    );
    check(
      (await page.getByRole('row').filter({ hasText: 'Friday' }).innerText()).includes(
        '08:00–18:00',
      ),
      'Dated early-close hours not effective',
    );
    await page.screenshot({
      path: path.join(out, 'availability-hours-desktop.png'),
      fullPage: false,
    });
    await page.getByRole('button', { name: 'Edit hours', exact: true }).first().click();
    await page.getByLabel('Reason', { exact: true }).fill('Browser verification hours change');
    await page.getByLabel('Monday end 1', { exact: true }).fill('20:30');
    await page.getByRole('button', { name: 'Review change', exact: true }).click();
    await page
      .getByText('No conflicting sample work. This change is ready to apply locally.', {
        exact: true,
      })
      .waitFor();
    await page.getByRole('button', { name: 'Apply in preview', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Saved in this preview' }).waitFor();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready('restaurant');
    await page.getByLabel('Selected date', { exact: true }).fill('2026-11-10');
    check(
      (await page.getByRole('row').filter({ hasText: 'Monday' }).innerText()).includes('20:30'),
      'Hours did not survive reload',
    );
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await page.getByRole('button', { name: 'Review resume', exact: true }).click();
    await page.getByRole('button', { name: 'Review change', exact: true }).click();
    await page.getByRole('button', { name: 'Apply in preview', exact: true }).click();
    await page.getByText('New intake follows its rules', { exact: true }).waitFor();
    result.flows.push('Hours persist; dated exception effective; scoped collection resume');
    await page.getByRole('button', { name: 'Check sample availability', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Check sample availability', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Available in sample', exact: true }).waitFor();
    await close();
    await page.getByRole('button', { name: 'Sample specialty', exact: true }).click();
    await page.getByLabel('Next apply result', { exact: true }).selectOption('unknown');
    await close();
    await page.getByRole('button', { name: 'Edit hours', exact: true }).first().click();
    await page.getByLabel('Reason', { exact: true }).fill('Unknown operation recovery');
    await page.getByRole('button', { name: 'Review change', exact: true }).click();
    await page.getByRole('button', { name: 'Apply in preview', exact: true }).click();
    await page.getByRole('heading', { name: 'History and pending changes' }).waitFor();
    await close();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready('restaurant');
    await page.getByRole('button', { name: /^History/ }).click();
    await page.getByRole('button', { name: 'Check saved operation result', exact: true }).click();
    await page
      .getByRole('button', { name: 'Check saved operation result', exact: true })
      .waitFor({ state: 'detached' });
    await close();
    await page.getByRole('status').filter({ hasText: 'Pending change saved' }).waitFor();
    await sample();
    await page.getByLabel('Next apply result', { exact: true }).selectOption('normal');
    await close();
    result.flows.push('Unknown apply survives refresh and reconciles once');
    console.log('Passed: hours, intake, reload and unknown-operation reconciliation.');
    await switchTo('makeup');
    await page.getByRole('button', { name: 'Day', exact: true }).click();
    await page
      .getByRole('button', { name: /^BK-1048 / })
      .first()
      .click();
    check(
      await page
        .getByRole('complementary', { name: 'Selected schedule detail' })
        .getByText('Treatment Room 1', { exact: true })
        .isVisible(),
      'Joint room claim missing',
    );
    await page.getByText('Capacity held; not confirmed.', { exact: true }).waitFor();
    await page.screenshot({
      path: path.join(out, 'availability-appointments-desktop.png'),
      fullPage: false,
    });
    await page.getByRole('button', { name: 'Close schedule detail', exact: true }).click();
    await page.getByRole('tab', { name: 'Rules', exact: true }).click();
    await page
      .getByRole('link', { name: 'Edit service definition in Offerings', exact: true })
      .click();
    await page
      .getByRole('complementary', { name: 'Offering editor' })
      .getByRole('tab', { name: 'Availability', exact: true })
      .waitFor();
    check((await page.url()).includes('profile=makeup'), 'Offerings lost specialty');
    await page.getByRole('tab', { name: 'Pricing', exact: true }).click();
    await page.getByLabel('Reservation fee policy', { exact: true }).selectOption('fixed');
    await page.getByLabel('Reservation fee (KES)', { exact: true }).fill('500');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.getByText('Changes saved in this browser.', { exact: true }).waitFor();
    await page.getByRole('link', { name: 'Back to Availability', exact: true }).click();
    await ready('makeup');
    await page.getByRole('tab', { name: 'Rules', exact: true }).click();
    await page.getByText('KES 500 reservation fee', { exact: true }).waitFor();
    result.flows.push('Actual offering handoff, optional fee policy save and contextual return');
    console.log('Passed: Offerings and fee-policy handoff.');
    await switchTo('self_drive');
    await page.getByRole('button', { name: 'Add time block', exact: true }).click();
    await page.getByLabel('Reason', { exact: true }).fill('Scheduled service');
    await page.getByLabel('Starts (EAT)', { exact: true }).fill('2026-11-04T08:00');
    await page.getByLabel('Ends (EAT)', { exact: true }).fill('2026-11-05T18:00');
    await page.getByRole('button', { name: 'Review change', exact: true }).click();
    check(
      await page.getByRole('button', { name: 'Apply in preview', exact: true }).isDisabled(),
      'Conflicting maintenance allowed',
    );
    check(
      (await page.getByRole('link', { name: /BK-2071/ }).count()) === 1,
      'Affected booking missing',
    );
    await page.screenshot({
      path: path.join(out, 'availability-rental-conflict-desktop.png'),
      fullPage: false,
    });
    await page.getByRole('button', { name: 'Save draft locally', exact: true }).click();
    await close();
    await page
      .getByRole('button', { name: /^RNT-2070 / })
      .first()
      .click();
    await page.getByRole('link', { name: 'Open in Work', exact: false }).click();
    await page.getByRole('button', { name: 'Record actual sample return', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Work record updated' }).waitFor();
    await page.getByRole('link', { name: 'Back to Availability', exact: true }).click();
    await ready('self_drive');
    await page
      .getByRole('button', { name: /^BK-2071 / })
      .first()
      .click();
    await page.getByRole('link', { name: 'Open in Work', exact: false }).click();
    await page
      .getByLabel('Replacement asset', { exact: true })
      .selectOption({ label: 'Toyota Hiace · HIA-03' });
    check(
      (await page.getByLabel('Replacement asset', { exact: true }).inputValue()).includes('hiace'),
      'Replacement choice was not applied',
    );
    await page.getByRole('button', { name: 'Reassign this sample booking', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Work record updated' }).waitFor();
    await page.getByRole('link', { name: 'Back to Availability', exact: true }).click();
    await ready('self_drive');
    await page.getByRole('button', { name: 'Resume draft', exact: true }).click();
    await page.getByRole('button', { name: 'Review change', exact: true }).click();
    await page.getByRole('button', { name: 'Apply in preview', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Saved in this preview' }).waitFor();
    result.flows.push(
      'Maintenance blocked, same-record Work return/reassignment, draft restored and applied',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    check(dimensions.width <= dimensions.viewport, 'Mobile body overflows horizontally');
    await page.getByLabel('Selected date', { exact: true }).fill('2026-11-05');
    await page
      .locator('.av-mobile-agenda')
      .getByRole('button', { name: /BK-2071/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Close schedule detail', exact: true }).click();
    await page.screenshot({ path: path.join(out, 'availability-mobile.png'), fullPage: false });
    await page.setViewportSize({ width: 1600, height: 1000 });
    result.flows.push('Mobile agenda and detail return; no body overflow');
    const observedSchemas = new Set(),
      observedBindings = new Set();
    for (const profile of config.profiles) {
      await switchTo(profile.id);
      await page
        .locator(
          '[data-availability-workspace][data-schema="' + profile.schema + '"][aria-busy="false"]',
        )
        .waitFor();
      const model = await page.locator('[data-availability-workspace]').getAttribute('data-model');
      check(profile.models.includes(model), profile.id + ': wrong model');
      observedSchemas.add(profile.schema);
      observedBindings.add(profile.id + ':' + model);
      await page.getByRole('tab', { name: 'Rules', exact: true }).click();
      await page.getByRole('heading', { name: 'Specialty requirements', exact: true }).waitFor();
      await page.getByRole('tab', { name: 'Schedule', exact: true }).click();
      const d = await sample();
      const choices = await d
        .getByLabel('Candidate offering type', { exact: true })
        .locator('option')
        .evaluateAll((options) =>
          options.map((o) => ({ value: o.value, text: o.textContent })).filter((o) => o.value),
        );
      await close();
      for (const choice of choices) {
        const candidateModel = choice.text.split(' · ').pop();
        if (observedBindings.has(profile.id + ':' + candidateModel)) continue;
        const panel = await sample();
        await panel
          .getByLabel('Candidate offering type', { exact: true })
          .selectOption(choice.value);
        await panel.getByRole('button', { name: 'Create sample activity', exact: true }).click();
        await page
          .locator(
            '[data-availability-workspace][data-schema="' + choice.value + '"][aria-busy="false"]',
          )
          .waitFor();
        observedBindings.add(profile.id + ':' + candidateModel);
        observedSchemas.add(choice.value);
      }
      result.profiles.push(profile.id);
      if (result.profiles.length % 16 === 0)
        console.log('Availability specialties exercised:', result.profiles.length);
    }
    check(result.profiles.length === 128, 'All128 profiles not exercised');
    check(
      observedBindings.size === 193,
      'All193 configured model bindings not exercised: ' + observedBindings.size,
    );
    check(
      observedSchemas.size === 18,
      'All18 registered editor variants not exercised: ' + observedSchemas.size,
    );
    result.bindings = [...observedBindings];
    result.schemas = [...observedSchemas];
    check(errors.length === 0, 'Browser errors: ' + errors.join('; '));
    check(writes.length === 0, 'Unexpected network writes: ' + writes.join('; '));
    result.status = 'PASS';
  } catch (e) {
    result.status = 'FAIL';
    result.failure = e.stack || String(e);
    await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: false }).catch(() => {});
    throw e;
  } finally {
    await fs.writeFile(
      path.join(out, 'browser-verification.json'),
      JSON.stringify(result, null, 2),
    );
    await browser.close();
  }
  console.log(
    JSON.stringify({
      status: result.status,
      flows: result.flows,
      profiles: result.profiles.length,
      bindings: result.bindings.length,
      schemas: result.schemas.length,
      networkWrites: writes.length,
      errors: errors.length,
    }),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
