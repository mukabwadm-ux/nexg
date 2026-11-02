const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises'),
  path = require('node:path');
const base = process.env.AVAILABILITY_URL || 'http://localhost:3131';
const out = path.resolve(
  __dirname,
  '../docs/merchant-portal-plan/availability-concept/implementation',
);
const check = (v, m) => {
  if (!v) throw Error(m);
};
(async () => {
  const browser = await chromium.launch({ headless: true }),
    result = { status: 'RUNNING', cases: [], errors: [], writes: [] };
  try {
    for (const size of [
      { width: 1920, height: 1080 },
      { width: 1672, height: 941 },
      { width: 1440, height: 900 },
      { width: 1280, height: 720 },
      { width: 1280, height: 633 },
    ]) {
      const ctx = await browser.newContext({
          viewport: size,
          deviceScaleFactor: size.height === 633 ? 1.5 : 1,
          serviceWorkers: 'block',
        }),
        page = await ctx.newPage();
      page.setDefaultNavigationTimeout(90000);
      page.on('pageerror', (e) => result.errors.push(e.message));
      page.on('request', (r) => {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method()))
          result.writes.push(r.method() + ' ' + r.url());
      });
      const open = async (id) => {
        await page.goto(base + '/merchant-live-preview/availability?profile=' + id, {
          waitUntil: 'domcontentloaded',
        });
        await page.locator('[data-availability-workspace][aria-busy="false"]').waitFor();
      };
      const measure = async (name, kind) => {
        const metrics = await page.evaluate((kind) => {
          const q = (s) => {
            const e = document.querySelector(s),
              r = e?.getBoundingClientRect();
            return r
              ? {
                  top: r.top,
                  right: r.right,
                  bottom: r.bottom,
                  height: r.height,
                  width: r.width,
                  clientH: e.clientHeight,
                  scrollH: e.scrollHeight,
                  clientW: e.clientWidth,
                  scrollW: e.scrollWidth,
                }
              : null;
          };
          const clip =
            kind === 'hours'
              ? '.av-main .av-table-wrap'
              : kind === 'assets'
                ? '.av-timeline-card .av-table-wrap'
                : '.av-calendar-scroll';
          return {
            viewport: { width: innerWidth, height: innerHeight },
            document: {
              width: document.documentElement.scrollWidth,
              height: document.documentElement.scrollHeight,
            },
            card: q(
              kind === 'hours'
                ? '.av-main > .av-card'
                : kind === 'assets'
                  ? '.av-timeline-card'
                  : '.av-calendar-card',
            ),
            content: q(clip),
            inspector: q('.av-inspector'),
            action: q('.av-inspector-actions .av-primary'),
            footer: q('.av-workspace-footer'),
            days: document.querySelectorAll('.av-days>span').length,
            drawer: q('[role="dialog"]'),
            impact: q('.av-impact'),
            dialogBody: q('.av-dialog-body'),
            lastAffected: q('.av-impact-records article:last-child'),
          };
        }, kind);
        result.cases.push({ name, ...metrics });
        check(
          metrics.document.width <= size.width && metrics.document.height <= size.height,
          name + ': page overflow',
        );
        check(metrics.card && metrics.card.height >= 240, name + ': schedule squeezed');
        check(
          metrics.content.scrollH <= metrics.content.clientH + 1,
          name + ': sample rows/time range clipped',
        );
        check(
          metrics.content.scrollW <= metrics.content.clientW + 1,
          name + ': horizontal schedule scroll',
        );
        check(metrics.footer.bottom <= size.height, name + ': footer clipped');
        if (metrics.action)
          check(metrics.action.bottom <= size.height, name + ': inspector action clipped');
        if (kind === 'assets') check(metrics.days === 7, name + ': whole week missing');
        return metrics;
      };
      await open('restaurant');
      await measure(size.width + 'x' + size.height + ' hours', 'hours');
      if (size.height === 633)
        await page.screenshot({ path: path.join(out, 'availability-hours-short-viewport.png') });
      await open('self_drive');
      await page
        .getByRole('button', { name: /^RNT-2070 / })
        .first()
        .click();
      await measure(size.width + 'x' + size.height + ' rental selected', 'assets');
      if (size.height === 633)
        await page.screenshot({ path: path.join(out, 'availability-rental-short-viewport.png') });
      await open('makeup');
      await page
        .getByRole('button', { name: /^BK-1048 / })
        .first()
        .click();
      await measure(size.width + 'x' + size.height + ' appointments selected', 'calendar');
      if (size.height === 633)
        await page.screenshot({ path: path.join(out, 'availability-calendar-short-viewport.png') });
      if (size.height === 633 || size.height === 941) {
        await open('self_drive');
        await page.getByRole('button', { name: 'Add time block', exact: true }).click();
        await page.getByLabel('Change name', { exact: true }).fill('Maintenance block');
        await page.getByLabel('Reason', { exact: true }).fill('Scheduled service');
        await page.getByLabel('Starts (EAT)', { exact: true }).fill('2026-11-04T08:00');
        await page.getByLabel('Ends (EAT)', { exact: true }).fill('2026-11-05T18:00');
        await page.getByRole('button', { name: 'Review change', exact: true }).click();
        await page.getByRole('link', { name: /BK-2071/ }).waitFor();
        const m = await measure(size.width + 'x' + size.height + ' docked maintenance', 'assets');
        check(m.card.right < m.drawer.right - m.drawer.width, 'Editor covers calendar');
        check(
          m.lastAffected.bottom <= m.dialogBody.bottom + 1,
          'Affected bookings hidden below editor',
        );
        check(
          await page.getByRole('button', { name: 'Apply in preview', exact: true }).isDisabled(),
          'Conflict can apply',
        );
        await page.screenshot({
          path: path.join(
            out,
            size.height === 633
              ? 'availability-rental-docked-short-viewport.png'
              : 'availability-rental-conflict-desktop.png',
          ),
        });
      }
      await ctx.close();
      console.log('Layout verified:', size.width, size.height);
    }
    check(!result.errors.length, 'Browser errors');
    check(!result.writes.length, 'Network write');
    result.status = 'PASS';
  } catch (e) {
    result.status = 'FAIL';
    result.failure = e.stack || String(e);
    throw e;
  } finally {
    await fs.writeFile(path.join(out, 'layout-verification.json'), JSON.stringify(result, null, 2));
    await browser.close();
  }
  console.log(
    JSON.stringify({
      status: result.status,
      cases: result.cases.length,
      errors: result.errors,
      writes: result.writes,
    }),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
