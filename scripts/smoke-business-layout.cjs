const { chromium } = require('@playwright/test');
const { mkdir, writeFile } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');

const tabs = [
  ['Profile', 'profile'],
  ['Activities & setup', 'activities'],
  ['Locations & coverage', 'locations'],
  ['Team', 'team'],
  ['Documents', 'documents'],
  ['Customer feedback', 'feedback'],
];
const sizes = [
  { width: 1280, height: 633 }, // The supplied 1920 x 950 browser area at 150% zoom.
  { width: 1440, height: 800 },
  { width: 1536, height: 864 },
  { width: 1672, height: 941 }, // Generated reference dimensions.
  { width: 1920, height: 950 },
];
function measure() {
  const regions = [
    ...document.querySelectorAll('.bu-left,.bu-detail-body,.bu-profile-right>.bu-card'),
  ];
  return regions.map((e) => ({
    region: e.className,
    availableHeight: e.clientHeight,
    contentHeight: e.scrollHeight,
    availableWidth: e.clientWidth,
    contentWidth: e.scrollWidth,
    bottom: Math.round(e.getBoundingClientRect().bottom),
  }));
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const report = [];
  const folder = join(tmpdir(), 'nexg-business-compact');
  await mkdir(folder, { recursive: true });
  try {
    const page = await browser.newPage();
    for (const viewport of sizes) {
      await page.setViewportSize(viewport);
      await page.goto('http://localhost:3129/merchant-live-preview/business?tab=profile', {
        waitUntil: 'networkidle',
        timeout: 90000,
      });
      await page.getByRole('heading', { name: 'Public profile', exact: true }).waitFor();
      for (const [name, key] of tabs) {
        await page.getByRole('tab', { name, exact: true }).click();
        await page.waitForLoadState('networkidle');
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        });
        const regions = await page.evaluate(measure);
        const overflow = regions.filter(
          (r) =>
            r.contentHeight > r.availableHeight + 1 ||
            r.contentWidth > r.availableWidth + 1 ||
            r.bottom > viewport.height,
        );
        const footer = page.locator('.bu-profile-actions,.bu-detail-footer');
        const footerBox = await footer.boundingBox();
        if (viewport.width === 1280 || viewport.width === 1672 || overflow.length)
          await page.screenshot({ path: join(folder, `${viewport.width}-${key}.png`) });
        if (overflow.length || !footerBox || footerBox.y + footerBox.height > viewport.height)
          throw new Error(
            `${viewport.width}x${viewport.height} ${name} requires scrolling: ${JSON.stringify(overflow)}`,
          );
        report.push({ viewport, section: key, regions, passed: true });
      }
    }
    // An edited/recovered profile must also keep the same height when its notice appears.
    await page.setViewportSize(sizes[0]);
    await page.getByRole('tab', { name: 'Profile', exact: true }).click();
    await page.getByLabel('Trading name', { exact: true }).fill('Recovered profile');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('status').filter({ hasText: 'Recovered your unsaved' }).waitFor();
    const recovered = await page.evaluate(measure);
    if (recovered.some((r) => r.contentHeight > r.availableHeight + 1))
      throw new Error('A profile recovery notice pushes fields below the visible area.');
    await writeFile(
      resolve(__dirname, '../docs/merchant-portal-plan/business-adaptation/frontend-layout.json'),
      JSON.stringify(
        {
          date: '2026-10-31',
          scope:
            'All six baseline Business tabs, including banner controls, desktop default state and recovered-profile notice. Overflow is measured, not hidden. Mobile and unbounded lists use their own responsive behavior.',
          checks: report,
          recoveredProfile: true,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      `Business layout: ${report.length} screen/viewport checks passed without panel scrolling; recovered-profile notice passed.`,
    );
    console.log(`Screenshots: ${folder}`);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
