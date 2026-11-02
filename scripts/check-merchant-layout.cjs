/* Checks only the changed shell, table viewport and Insights composition. */
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const output = path.join(__dirname, '../docs/audits/merchant-layout-2026-11-01');
const resultFile = path.join(output, 'results.json');
const base = process.env.INSIGHTS_PREVIEW_URL || 'http://127.0.0.1:3141';
const requested = new Set((process.env.LAYOUT_CASES || '').split(',').filter(Boolean));

async function main() {
  await fs.mkdir(output, { recursive: true });
  let report;
  try {
    report = JSON.parse(await fs.readFile(resultFile, 'utf8'));
  } catch {
    report = {
      policy:
        'Keep passing checks. Run a passed case again only after its part changes, by explicitly selecting its id in LAYOUT_CASES.',
      cases: [],
    };
  }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 633 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  async function visit(route) {
    await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.locator('[data-merchant-workspace]').waitFor({ timeout: 90000 });
    if (route.includes('/insights'))
      await page
        .locator('[data-insights-workspace][data-ready="true"]')
        .waitFor({ timeout: 90000 });
    await page
      .getByText(
        /Loading sample work|Loading offerings|Loading sample money|Loading promotions|Loading sample schedule/,
      )
      .waitFor({ state: 'hidden', timeout: 90000 });
    await page.evaluate(() => document.fonts.ready);
  }
  async function check(id, run) {
    const previous = report.cases.find((item) => item.id === id);
    if (
      (requested.size && !requested.has(id)) ||
      (!requested.size && previous?.status === 'passed')
    )
      return;
    const start = errors.length;
    let entry = { id, checkedAt: new Date().toISOString() };
    try {
      entry.evidence = await run();
      assert.deepEqual(errors.slice(start), [], 'No browser runtime errors');
      entry.status = 'passed';
    } catch (error) {
      entry.status = 'failed';
      entry.error = error.message;
      entry.diagnostics = await dimensions();
    }
    entry.runtimeErrors = errors.slice(start);
    await page.screenshot({ path: path.join(output, id + '.png'), fullPage: false });
    const index = report.cases.findIndex((item) => item.id === id);
    if (index >= 0) {
      report.history ??= [];
      report.history.push(report.cases[index]);
      report.cases[index] = entry;
    } else report.cases.push(entry);
    await fs.writeFile(resultFile, JSON.stringify(report, null, 2));
    process.stdout.write(`${id}: ${entry.status}${entry.error ? '\n' + entry.error : ''}\n`);
  }
  async function dimensions() {
    return page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      root: [
        ...document.querySelectorAll(
          '[data-insights-workspace], [data-work-main], [data-workspace-content]',
        ),
      ].map((element) => ({
        name:
          element.getAttribute('data-active-tab') ||
          element.getAttribute('data-work-main') ||
          element.tagName,
        client: element.clientHeight,
        scroll: element.scrollHeight,
        overflow: getComputedStyle(element).overflowY,
      })),
      tableAreas: [...document.querySelectorAll('[data-table-viewport]')].map((element) => ({
        name: element.getAttribute('aria-label'),
        client: element.clientHeight,
        scroll: element.scrollHeight,
        bottom: element.getBoundingClientRect().bottom,
      })),
      metrics: [...document.querySelectorAll('.in-metric strong')].map((element) => ({
        text: element.textContent,
        width: element.clientWidth,
        scroll: element.scrollWidth,
      })),
      panels: [
        ...document.querySelectorAll(
          '.in-content[role="tabpanel"] > .in-grid, .in-content[role="tabpanel"] > .in-evidence, .in-content[role="tabpanel"] > .in-report-collection',
        ),
      ].map((element) => ({
        title: element.textContent.slice(0, 80),
        height: element.clientHeight,
        bottom: element.getBoundingClientRect().bottom,
      })),
      pagination: [...document.querySelectorAll('[data-table-pagination]')].map((element) => ({
        text: element.textContent,
        bottom: element.getBoundingClientRect().bottom,
      })),
    }));
  }
  try {
    await check('work-local-scroll-and-fade', async () => {
      await page.setViewportSize({ width: 1280, height: 633 });
      await visit('/merchant-live-preview/work');
      const sidebar = page.getByRole('complementary', { name: 'Workspace sidebar' });
      await expect(sidebar.getByRole('link', { name: 'Merchant workspace Home' })).toContainText(
        'Business workspace',
        { timeout: 90000 },
      );
      await expect(sidebar.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
      const settings = await sidebar
        .getByRole('link', { name: 'Settings', exact: true })
        .boundingBox();
      assert.ok(settings.y + settings.height <= 633);
      const queue = page.getByTestId('work-queue');
      const headingTop = await page
        .locator('[data-work-main] h1')
        .evaluate((element) => element.getBoundingClientRect().top);
      const thumb = () =>
        queue.evaluate(
          (element) => getComputedStyle(element, '::-webkit-scrollbar-thumb').backgroundColor,
        );
      await queue.click({ position: { x: 25, y: 10 } });
      await expect
        .poll(async () => ['rgb(184, 176, 159)', 'rgb(149, 139, 120)'].includes(await thumb()))
        .toBe(true);
      await expect.poll(thumb, { timeout: 5000 }).toBe('rgba(0, 0, 0, 0)');
      const scroll = await queue.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
        return element.scrollTop;
      });
      assert.ok(scroll > 0, 'Work rows scroll locally');
      assert.equal(
        await page
          .locator('[data-work-main] h1')
          .evaluate((element) => element.getBoundingClientRect().top),
        headingTop,
      );
      const result = await dimensions();
      assert.equal(result.documentHeight, result.height);
      assert.equal(result.documentWidth, result.width);
      assert.ok(
        result.root.every((item) => item.scroll <= item.client + 1),
        'Work page and queue heading do not scroll',
      );
      return { ...result, localScrollTop: scroll };
    });
    for (const tab of [
      'overview',
      'orders',
      'menu',
      'customers',
      'operations',
      'promotions',
      'finance',
      'reports',
    ]) {
      await check('insights-' + tab + '-compact', async () => {
        await page.setViewportSize({ width: 1280, height: 633 });
        await visit('/merchant-live-preview/insights?tab=' + tab);
        await expect
          .poll(
            async () =>
              (await dimensions()).tableAreas.every((item) => item.scroll <= item.client + 1),
            { timeout: 15000 },
          )
          .toBe(true);
        const result = await dimensions();
        assert.equal(result.documentHeight, result.height);
        assert.equal(result.documentWidth, result.width);
        assert.ok(
          result.root.every((item) => item.scroll <= item.client + 1),
          'Insights stays inside one desktop view',
        );
        assert.ok(
          result.panels.every((item) => item.bottom <= result.height + 1 && item.height > 70),
          'Chart and table areas are visible above the fold',
        );
        assert.ok(
          result.pagination.every((item) => item.bottom <= result.height + 1),
          'Table pagination stays visible',
        );
        assert.ok(
          result.tableAreas.every((item) => item.scroll <= item.client + 1),
          'Summary rows fit without vertical table scrolling',
        );
        assert.ok(
          result.metrics.every((item) => item.scroll <= item.width + 1),
          'Metric values fit in their cards',
        );
        if (tab === 'overview') {
          await expect(page.locator('[data-metric="order_completed"] > strong')).toHaveText(
            '1,176',
          );
          await expect(page.locator('.in-donut')).toBeVisible();
        }
        if (tab === 'menu')
          assert.equal(result.metrics.length, 4, 'Menu retains the four-metric reference row');
        if (tab === 'reports') {
          const first = await page.locator('.in-library-row strong').allTextContents();
          await page.getByRole('button', { name: 'Next collection page' }).click();
          assert.notDeepEqual(
            await page.locator('.in-library-row strong').allTextContents(),
            first,
          );
        }
        return result;
      });
    }
    await check('insights-overview-wide', async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await visit('/merchant-live-preview/insights');
      const result = await dimensions();
      assert.equal(result.documentHeight, 900);
      assert.ok(result.root.every((item) => item.scroll <= item.client + 1));
      assert.ok(result.panels.every((item) => item.bottom <= 900));
      return result;
    });
    await check('offerings-shared-table', async () => {
      await page.setViewportSize({ width: 1280, height: 633 });
      await visit('/merchant-live-preview/offerings');
      await expect
        .poll(() =>
          page
            .getByRole('region', { name: 'Scrollable offering list' })
            .evaluate((element) => element.hasAttribute('data-table-viewport')),
        )
        .toBe(true);
      const result = await dimensions();
      assert.equal(result.documentWidth, 1280);
      assert.equal(result.documentHeight, 633);
      return result;
    });
    await check('work-mobile-navigation', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await visit('/merchant-live-preview/work');
      await page.getByRole('button', { name: 'Open workspace navigation' }).click();
      await expect(
        page.getByRole('dialog').getByRole('link', { name: 'Merchant workspace', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Close workspace navigation' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const result = await dimensions();
      assert.equal(result.documentWidth, 390);
      assert.equal(result.documentHeight, 844);
      return result;
    });
    for (const section of ['money', 'promotions'])
      await check(section + '-shared-table', async () => {
        await page.setViewportSize({ width: 1280, height: 633 });
        await visit('/merchant-live-preview/' + section);
        await page.locator('[data-table-viewport]').first().waitFor({ timeout: 90000 });
        const result = await dimensions();
        assert.equal(result.documentWidth, 1280);
        return result;
      });
    await check('insights-chart-table-view', async () => {
      await page.setViewportSize({ width: 1280, height: 633 });
      await visit('/merchant-live-preview/insights?tab=menu');
      for (const button of await page.locator('.in-grid .in-table-toggle').all())
        await button.click();
      await expect(page.locator('.in-chart-table')).toHaveCount(2);
      await expect
        .poll(async () =>
          (await dimensions()).tableAreas.every((item) => item.scroll <= item.client + 1),
        )
        .toBe(true);
      const result = await dimensions();
      assert.equal(result.documentHeight, 633);
      assert.ok(result.root.every((item) => item.scroll <= item.client + 1));
      return result;
    });
  } finally {
    await context.close();
    await browser.close();
  }
  process.exitCode = report.cases.some((item) => item.status === 'failed') ? 1 : 0;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
