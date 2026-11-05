const { chromium } = require('@playwright/test');
const os = require('node:os');
const path = require('node:path');
const config = require('../apps/web/components/merchant/offerings/config.json');

const base = process.env.PROMOTIONS_PREVIEW_URL || 'http://localhost:3129';
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const waitForProfile = (page, id) =>
  page.waitForFunction((profileId) => {
    const el = document.querySelector('[data-promotions-workspace]');
    return (
      el?.getAttribute('data-profile') === profileId && el.getAttribute('aria-busy') === 'false'
    );
  }, id);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(90_000);
  const failures = [],
    unexpectedRequests = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('request', (request) => {
    if (/\/api\/(merchant\/booking|booking-workspace)|\/rest\/v1/.test(request.url()))
      unexpectedRequests.push(request.url());
  });
  try {
    await page.goto(`${base}/merchant-live-preview/promotions`, { waitUntil: 'domcontentloaded' });
    await waitForProfile(page, 'makeup');
    check(
      (await page.getByRole('tab', { name: 'Campaigns' }).count()) === 1,
      'Campaigns tab missing',
    );
    check((await page.getByRole('tab', { name: 'History' }).count()) === 1, 'History tab missing');
    check((await page.getByRole('tab').count()) === 2, 'Unexpected extra Promotions tab');
    check(
      (await page
        .getByRole('link', { name: 'Promotions', exact: true })
        .getAttribute('aria-current')) === 'page',
      'Promotions navigation not active',
    );
    await page.screenshot({
      path: path.join(os.tmpdir(), 'nexg-promotions-desktop.png'),
      fullPage: true,
    });
    const compactCheck = async (label) => {
      const size = await page.locator('[data-promotions-workspace]').evaluate((element) => ({
        visible: element.clientHeight,
        content: element.scrollHeight,
      }));
      check(
        size.content <= size.visible + 1,
        `${label} does not fit compact desktop: ${JSON.stringify(size)}`,
      );
    };
    await page.setViewportSize({ width: 1280, height: 632 });
    await compactCheck('Campaigns');
    await page.screenshot({
      path: path.join(os.tmpdir(), 'nexg-promotions-compact.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Create promotion', exact: true }).click();
    await compactCheck('Create promotion');
    await page.getByRole('button', { name: 'Back to campaigns' }).click();
    await page.getByRole('tab', { name: 'History' }).click();
    await page.getByRole('heading', { name: 'Promotion history' }).waitFor();
    check(
      (await page.getByText('Weekend essentials - October').count()) > 0,
      'Example history is missing',
    );
    await compactCheck('History');
    await page.screenshot({
      path: path.join(os.tmpdir(), 'nexg-promotions-history.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Preview in app', exact: true }).click();
    await page.getByRole('heading', { name: 'Discovery', exact: true }).waitFor();
    await page.screenshot({
      path: path.join(os.tmpdir(), 'nexg-promotions-app-compact.png'),
      fullPage: true,
    });
    await compactCheck('Customer preview');
    await page.getByRole('button', { name: 'Back to History' }).click();
    await page.getByRole('tab', { name: 'Campaigns' }).click();
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.getByRole('button', { name: 'Create promotion', exact: true }).click();
    await page.getByLabel('Promotion name').fill('Verified sample offer');
    await page
      .getByLabel('Offering', { exact: true })
      .selectOption({ label: 'Bridal makeup · published' });
    await page.getByLabel('Discount (%)').fill('10');
    await page.getByRole('button', { name: 'Preview in app', exact: true }).click();
    await page.getByRole('heading', { name: 'Discovery', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Offering details', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Back to promotion' }).click();
    check(
      (await page.getByLabel('Promotion name').inputValue()) === 'Verified sample offer',
      'Preview lost unsaved form data',
    );
    await page.getByRole('button', { name: 'Review promotion' }).click();
    await page.getByRole('button', { name: 'Activate in sample' }).click();
    await page.getByRole('heading', { name: 'Verified sample offer' }).waitFor();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('nexg.offerings.preview.v1.makeup')),
    );
    const offering = saved.offerings.find((o) => o.name === 'Bridal makeup');
    check(
      offering.discount?.enabled && offering.discount.value === '10',
      'Offerings did not receive the same discount',
    );
    check(
      (await page.getByText('KES 7,650', { exact: true }).count()) > 0,
      'Customer preview price is wrong',
    );

    await page.getByRole('link', { name: 'Offerings', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Bridal makeup', exact: true }).click();
    await page.getByRole('tab', { name: 'Pricing', exact: true }).click();
    check(
      await page.getByLabel('Apply a discount to this offering').isChecked(),
      'Discount does not appear in Offerings',
    );
    await page.getByRole('link', { name: 'Promotions', exact: true }).click();
    await waitForProfile(page, 'makeup');
    await page
      .getByRole('button', { name: 'Open Verified sample offer', exact: true })
      .first()
      .click();
    await page.getByRole('button', { name: 'Pause promotion', exact: true }).click();
    await page.getByText('Paused', { exact: true }).first().waitFor();
    await page.getByText(/Offer paused/).waitFor();
    check(
      (await page.getByText('KES 8,500', { exact: true }).count()) > 0,
      'A paused campaign still shows the discounted customer price',
    );
    check(
      !(await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('nexg.offerings.preview.v1.makeup')).offerings.find(
            (o) => o.name === 'Bridal makeup',
          ).discount.enabled,
      )),
      'Pause did not update the offering',
    );
    await page.getByRole('button', { name: 'Resume promotion', exact: true }).click();
    await page.getByLabel('More promotion actions').click();
    await page.getByRole('button', { name: 'End promotion', exact: true }).click();
    await page.getByRole('tab', { name: 'History', selected: true }).waitFor();
    await page.getByRole('button', { name: 'Preview in app', exact: true }).click();
    check(
      (await page.getByLabel('Version').inputValue()).includes('Archived'),
      'History preview is not marked archived',
    );
    check(
      (await page.getByText('Duration (minutes)', { exact: true }).count()) > 0,
      'Archived customer preview lost the service duration',
    );
    await page.getByRole('button', { name: 'Back to History' }).click();
    await page.getByRole('button', { name: 'Duplicate as draft' }).click();
    check(
      (await page.getByLabel('Promotion name').inputValue()).includes('copy'),
      'Duplicate did not create an editable draft',
    );
    await page.getByRole('button', { name: 'Review promotion' }).click();
    await page.getByRole('button', { name: 'Activate in sample' }).click();
    await page.getByRole('heading', { name: 'Verified sample offer copy' }).waitFor();

    await page.getByRole('button', { name: 'Create promotion', exact: true }).click();
    await page.getByLabel('Promotion name').fill('Featured sample');
    await page.getByLabel('Promotion type').selectOption('featured');
    await page.getByLabel('Offering', { exact: true }).selectOption('');
    await page.getByLabel('Placement', { exact: true }).selectOption('category');
    await page.getByRole('button', { name: 'Preview in app', exact: true }).click();
    check(
      (await page.getByText('Sponsored', { exact: true }).count()) > 0,
      'Featured storefront preview lacks the sponsored label',
    );
    await page.getByRole('button', { name: 'Back to promotion' }).click();
    check(
      (await page.getByLabel('Placement', { exact: true }).inputValue()) === 'category',
      'Placement selection was not preserved',
    );
    await page.getByRole('button', { name: 'Review promotion' }).click();
    await page.getByRole('button', { name: 'Submit sample request' }).click();
    await page.getByText('Awaiting confirmation', { exact: true }).first().waitFor();
    await page.getByRole('button', { name: 'Withdraw sample request' }).click();
    await page.getByRole('tab', { name: 'History', selected: true }).waitFor();
    await page.getByText('Cancelled', { exact: true }).first().waitFor();

    await page.getByRole('tab', { name: 'Campaigns' }).click();
    for (const profile of config.profiles) {
      await page.getByText('Choose sample state', { exact: true }).click();
      await page.getByLabel('Sample specialty').selectOption(profile.id);
      await waitForProfile(page, profile.id);
      check(
        (await page.getByRole('heading', { name: 'Your campaigns' }).count()) === 1,
        `${profile.id}: campaign screen missing`,
      );
    }
    await page.getByText('Choose sample state', { exact: true }).click();
    await page.getByLabel('Sample specialty').selectOption('makeup');
    await waitForProfile(page, 'makeup');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(os.tmpdir(), 'nexg-promotions-mobile.png'),
      fullPage: true,
    });
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      outliers: [...document.querySelectorAll('main *')]
        .map((element) => ({
          tag: element.tagName,
          className: String(element.className),
          right: Math.round(element.getBoundingClientRect().right),
        }))
        .filter((entry) => entry.right > innerWidth + 2)
        .slice(0, 8),
    }));
    check(
      overflow.scroll <= overflow.width + 1,
      `Mobile document overflows: ${JSON.stringify(overflow)}`,
    );

    const original = await page.evaluate(() =>
      localStorage.getItem('nexg.offerings.preview.v1.makeup'),
    );
    await page.evaluate(() => {
      const key = 'nexg.offerings.preview.v1.makeup';
      const value = JSON.parse(localStorage.getItem(key));
      value.promotionsPreview = { broken: true };
      localStorage.setItem(key, JSON.stringify(value));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    try {
      await page
        .getByText('Saved promotions could not be read.', { exact: false })
        .waitFor({ timeout: 8000 });
    } catch (error) {
      console.error('Recovery diagnostic:', page.url(), await page.locator('main').innerText());
      throw error;
    }
    const retained = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('nexg.offerings.preview.v1.makeup')),
    );
    check(
      retained.offerings.length === JSON.parse(original).offerings.length,
      'Invalid promotion state erased offerings',
    );
    check(failures.length === 0, `Browser errors: ${failures.join('; ')}`);
    check(
      unexpectedRequests.length === 0,
      `Sample unexpectedly contacted production sources: ${unexpectedRequests.join('; ')}`,
    );
    console.log(
      JSON.stringify(
        {
          status: 'PASSED',
          profiles: config.profiles.length,
          categories: new Set(config.profiles.map((p) => p.categoryId)).size,
          lifecycle: 'activate/pause/resume/end/duplicate',
          featured: 'sample request/withdraw',
          preview: 'draft/current/archived',
          sharedOfferingDiscount: true,
          mobileOverflow: false,
          malformedDataPreserved: true,
          unexpectedRequests: unexpectedRequests.length,
          browserErrors: failures.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
