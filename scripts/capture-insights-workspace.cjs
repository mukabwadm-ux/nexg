/* One bounded visual evidence batch. Captures local sample routes only. */
const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const base = process.env.INSIGHTS_PREVIEW_URL || 'http://127.0.0.1:3141';
const restOnly = process.env.INSIGHTS_CAPTURE_REST === '1';
const changedOnly = process.env.INSIGHTS_CAPTURE_CHANGED === '1';
const confirm = process.env.INSIGHTS_CAPTURE_CONFIRM === '1' || restOnly || changedOnly;
const output = path.join(
  __dirname,
  '../docs/merchant-portal-plan/insights-implementation/visual',
  changedOnly
    ? 'changed-layout-confirmation'
    : restOnly
      ? 'workspace-confirmation'
      : confirm
        ? 'confirmation'
        : '',
);
const tabs = [
  'overview',
  'orders',
  'menu',
  'customers',
  'operations',
  'promotions',
  'finance',
  'reports',
];
const sections = [
  'home',
  'work',
  'offerings',
  'availability',
  'business',
  'money',
  'promotions',
  'settings',
];

async function main() {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const [device, viewport] of [
      ['desktop', { width: 1440, height: 1000 }],
      ['mobile', { width: 390, height: 844 }],
    ]) {
      if (process.env.INSIGHTS_CAPTURE_MOBILE_ONLY === '1' && device !== 'mobile') continue;
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const routes = [
        ...tabs.map((tab) => [`insights-${tab}`, `/merchant-live-preview/insights?tab=${tab}`]),
        ...sections.map((section) => [
          section,
          `/merchant-live-preview${section === 'home' ? '' : `/${section}`}`,
        ]),
      ];
      if (device === 'desktop')
        routes.push([
          'insights-invalid-profile',
          '/merchant-live-preview/insights?profile=invalid',
        ]);
      for (const [name, route] of routes.filter(([name]) =>
        changedOnly
          ? name === 'availability' ||
            (device === 'mobile' && ['insights-overview', 'insights-finance'].includes(name))
          : !confirm ||
            (restOnly
              ? !name.startsWith('insights-')
              : name.startsWith('insights-') &&
                name !== 'insights-invalid-profile' &&
                (device === 'mobile' ||
                  ['insights-overview', 'insights-finance', 'insights-reports'].includes(name))),
      )) {
        const start = errors.length;
        const response = await page.goto(base + route, {
          waitUntil: 'domcontentloaded',
          timeout: 90000,
        });
        await page.locator('[data-merchant-workspace]').waitFor({ timeout: 30000 });
        if (name.startsWith('insights-'))
          await page
            .locator('[data-insights-workspace][data-ready="true"]')
            .waitFor({ timeout: 90000 });
        await page
          .getByText(
            /Loading sample work|Loading offerings|Loading sample money|Loading promotions|Loading sample schedule/,
          )
          .waitFor({ state: 'hidden', timeout: 90000 });
        await page.evaluate(() => document.fonts.ready);
        const geometry = await page.evaluate(() => ({
          viewport: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          heading: [...document.querySelectorAll('h1')].map((element) => element.textContent),
          dialogs: document.querySelectorAll('[role="dialog"]').length,
          documentHeight: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight,
        }));
        const file = `${device}-${name}.png`;
        await page.screenshot({ path: path.join(output, file), fullPage: !confirm });
        const scrolling = (await page.locator('[data-insights-workspace]').count())
          ? await page.locator('[data-insights-workspace]').evaluate((element) => {
              const before = element.scrollTop;
              element.scrollTop = element.scrollHeight;
              return {
                before,
                after: element.scrollTop,
                clientHeight: element.clientHeight,
                scrollHeight: element.scrollHeight,
              };
            })
          : null;
        if (confirm && device === 'mobile' && scrolling?.after > 0)
          await page.screenshot({
            path: path.join(output, `${device}-${name}-bottom.png`),
            fullPage: false,
          });
        results.push({
          device,
          name,
          route,
          status: response.status(),
          ...geometry,
          scrolling,
          errors: errors.slice(start),
          file,
        });
        process.stdout.write(
          `${device} ${name} ${response.status()} width=${geometry.documentWidth}/${geometry.viewport}\n`,
        );
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  await fs.writeFile(
    path.join(output, 'verification.json'),
    JSON.stringify({ capturedAt: new Date().toISOString(), base, results }, null, 2) + '\n',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
