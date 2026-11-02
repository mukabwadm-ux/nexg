const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.AVAILABILITY_URL || 'http://localhost:3131';
const out = path.resolve(
  __dirname,
  '../docs/merchant-portal-plan/availability-concept/implementation',
);
const check = (v, m) => {
  if (!v) throw new Error(m);
};
(async () => {
  const browser = await chromium.launch({ headless: true }),
    ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }),
    page = await ctx.newPage();
  const errors = [],
    writes = [],
    result = { status: 'RUNNING', flows: [], viewports: [], errors, writes };
  page.setDefaultNavigationTimeout(90000);
  ctx.on('page', (p) => {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('request', (r) => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method())) writes.push(r.method() + ' ' + r.url());
    });
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method())) writes.push(r.method() + ' ' + r.url());
  });
  const open = async (id, p = page) => {
    await p.goto(base + '/merchant-live-preview/availability?profile=' + id, {
      waitUntil: 'domcontentloaded',
    });
    await p
      .locator('[data-availability-workspace][data-profile="' + id + '"][aria-busy="false"]')
      .waitFor();
  };
  const close = async (p = page) =>
    p.getByRole('button', { name: 'Close dialog', exact: true }).click();
  const sample = async () => {
    await page.getByRole('button', { name: 'Sample specialty', exact: true }).click();
    return page.getByRole('dialog');
  };
  try {
    await open('makeup');
    await page
      .getByRole('button', { name: /^BK-1048 / })
      .first()
      .click();
    for (const dim of [
      { width: 1920, height: 1080 },
      { width: 1440, height: 900 },
      { width: 1280, height: 720 },
      { width: 390, height: 844 },
      { width: 960, height: 540 },
    ]) {
      await page.setViewportSize(dim);
      const box = await page.evaluate(() => {
        const a = document
            .querySelector('.av-inspector-actions .av-primary')
            ?.getBoundingClientRect(),
          f = document.querySelector('.av-workspace-footer')?.getBoundingClientRect();
        return {
          width: innerWidth,
          height: innerHeight,
          documentWidth: document.documentElement.scrollWidth,
          documentHeight: document.documentElement.scrollHeight,
          action: a ? { top: a.top, bottom: a.bottom } : null,
          footer: f ? { top: f.top, bottom: f.bottom } : null,
        };
      });
      check(
        box.documentWidth <= box.width && box.documentHeight <= box.height,
        'Body does not fit viewport ' + dim.width,
      );
      check(
        box.action && box.action.bottom <= box.height && box.action.top >= 0,
        'Inspector action clipped ' + dim.width,
      );
      check(
        box.footer && box.footer.bottom <= box.height && box.footer.top >= 0,
        'Footer clipped ' + dim.width,
      );
      result.viewports.push(box);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: 'Close schedule detail', exact: true }).click();
    const slot = page.getByRole('button', { name: 'Plan time for Amina W.', exact: true });
    check((await slot.count()) === 1, 'Blank resource time has nested controls');
    await slot.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog', { name: 'Time block' }).waitFor();
    check(
      (await page.getByLabel('Starts (EAT)', { exact: true }).inputValue()) === '2026-11-03T09:00',
      'Keyboard slot did not preserve date/resource',
    );
    await page.getByLabel('Reason', { exact: true }).fill('Keyboard local draft');
    await close();
    await page.getByRole('heading', { name: 'Keep your local changes?', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
    check(
      (await page.getByLabel('Reason', { exact: true }).inputValue()) === 'Keyboard local draft',
      'Dirty input lost',
    );
    await close();
    await page.getByRole('button', { name: 'Discard and continue', exact: true }).click();
    result.flows.push('Keyboard empty-slot proposal, focus, dirty-close keep/discard');
    await page.getByRole('button', { name: 'Week', exact: true }).click();
    check(
      (await page.locator('.av-week-time-column').count()) === 7,
      'Week must contain seven days',
    );
    const event = page.getByRole('button', { name: /Occasion makeup.*Confirmed/i }).first();
    const eventId = await event.evaluate((el) => {
      const transfer = new DataTransfer();
      el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
      return transfer.getData('application/x-nexg-event');
    });
    check(eventId, 'Booking is not draggable in current manager context');
    const target = page.locator('.av-week-time-column').nth(3),
      b = await target.boundingBox();
    await target.evaluate(
      (el, p) => {
        const transfer = new DataTransfer();
        transfer.setData('application/x-nexg-event', p.id);
        el.dispatchEvent(
          new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
            clientY: p.y,
          }),
        );
      },
      { id: eventId, y: b.y + b.height * 0.7 },
    );
    await page
      .getByRole('heading', { name: 'Review proposed calendar move', exact: true })
      .waitFor();
    const link = page.getByRole('link', { name: 'Review reschedule in Work', exact: true }),
      href = await link.getAttribute('href');
    check(
      href.includes('proposedStart=') && href.includes('referenceEvent='),
      'Move context missing',
    );
    const before = await page.evaluate(() =>
      localStorage.getItem('nexg.availability.preview.v1.makeup'),
    );
    await link.click();
    await page.getByLabel('New start (EAT)', { exact: true }).waitFor();
    check(
      (await page.getByLabel('New start (EAT)', { exact: true }).inputValue()) ===
        new URL(href, base).searchParams.get('proposedStart').slice(0, 16),
      'Proposed time not carried to Work',
    );
    check(
      (await page.evaluate(() => localStorage.getItem('nexg.availability.preview.v1.makeup'))) ===
        before,
      'Drag proposal changed applied schedule',
    );
    await page.getByRole('link', { name: 'Back to Availability', exact: true }).click();
    await page.locator('[data-availability-workspace][aria-busy="false"]').waitFor();
    result.flows.push(
      'Seven-day time grid; drag only proposes, same Work identity and times retained',
    );
    var d = await sample();
    await d.getByLabel('Sample role', { exact: true }).selectOption('viewer');
    await close();
    await page.getByRole('button', { name: 'Day', exact: true }).click();
    check(
      await page.getByRole('button', { name: 'Plan time for Amina W.', exact: true }).isDisabled(),
      'Viewer can create a time block',
    );
    await page
      .getByRole('button', { name: /^BK-1048 / })
      .first()
      .click();
    check(
      await page.getByRole('link', { name: 'Open in Work', exact: false }).isVisible(),
      'Viewer cannot inspect existing booking',
    );
    result.flows.push('Read-only role blocks edits while preserving booking inspection');
    await open('classes');
    await page.getByRole('button', { name: 'Month', exact: true }).click();
    await page.locator('.av-month-card .av-calendar-chip').first().click();
    await page
      .getByRole('complementary', { name: 'Selected occurrence detail', exact: true })
      .waitFor();
    check(
      (
        await page
          .getByRole('complementary', { name: 'Selected occurrence detail', exact: true })
          .locator('.av-capacity')
          .innerText()
      ).includes('Remaining'),
      'Session breakdown missing',
    );
    await page.getByRole('button', { name: 'Close occurrence detail', exact: true }).click();
    await page.getByRole('button', { name: 'Day', exact: true }).click();
    check(
      (await page.locator('.av-week-time-column').count()) === 1,
      'Day grid contains extra days',
    );
    result.flows.push('Dated session month and one-day views; occurrence capacity inspector');
    await open('restaurant');
    for (const state of ['stale', 'unknown', 'partial', 'external', 'offline', 'unconfigured']) {
      d = await sample();
      await d.getByLabel('Simulated source state', { exact: true }).selectOption(state);
      await page.getByRole('button', { name: 'Edit hours', exact: true }).first().waitFor();
      if (state !== 'unconfigured')
        check(
          await page.getByRole('button', { name: 'Edit hours', exact: true }).first().isDisabled(),
          'Source state permits write ' + state,
        );
      await page.getByRole('button', { name: 'Check sample availability', exact: true }).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Check sample availability', exact: true })
        .click();
      check(
        (await page.getByRole('heading', { name: /Unknown|Unavailable/i }).count()) > 0,
        'Unknown source appears available ' + state,
      );
      await close();
    }
    result.flows.push(
      'Stale, unknown, partial, external, offline and missing-setup states never promise capacity',
    );
    await open('restaurant');
    const second = await ctx.newPage();
    await open('restaurant', second);
    await page.getByRole('button', { name: 'Edit hours', exact: true }).first().click();
    await page.getByLabel('Reason', { exact: true }).fill('Retain first tab inputs');
    await page.getByRole('button', { name: 'Review change', exact: true }).click();
    check(
      await page.getByRole('button', { name: 'Apply in preview', exact: true }).isEnabled(),
      'Initial review was not eligible',
    );
    await second.getByRole('button', { name: 'Edit hours', exact: true }).first().click();
    await second.getByLabel('Reason', { exact: true }).fill('Another tab update');
    await second.getByLabel('Monday end 1', { exact: true }).fill('20:45');
    await second.getByRole('button', { name: 'Review change', exact: true }).click();
    await second.getByRole('button', { name: 'Apply in preview', exact: true }).click();
    await page
      .locator('.av-notice')
      .filter({ hasText: 'This schedule changed in another tab' })
      .waitFor();
    check(
      await page.getByRole('button', { name: 'Apply in preview', exact: true }).isDisabled(),
      'Stale impact still enables Apply',
    );
    check(
      (await page.getByLabel('Reason', { exact: true }).inputValue()) === 'Retain first tab inputs',
      'Concurrent revision lost input',
    );
    await page.getByRole('button', { name: 'Review change', exact: true }).click();
    await page
      .getByText('No conflicting sample work. This change is ready to apply locally.', {
        exact: true,
      })
      .waitFor();
    await page.getByText('Before and after', { exact: true }).click();
    check(
      (await page.locator('.av-comparison').innerText()).includes('20:45'),
      'Fresh comparison omits the other tab change',
    );
    await second.close();
    result.flows.push(
      'Cross-tab change invalidates reviewed impact, retains inputs and requires a fresh comparison',
    );
    const denied = await ctx.newPage();
    await denied.addInitScript(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k.startsWith('nexg.availability.preview.'))
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        return set.call(this, k, v);
      };
    });
    await open('restaurant', denied);
    await denied.getByRole('button', { name: 'Edit hours', exact: true }).first().click();
    await denied.getByLabel('Reason', { exact: true }).fill('Inputs survive storage error');
    await denied.getByRole('button', { name: 'Review change', exact: true }).click();
    await denied.getByRole('button', { name: 'Apply in preview', exact: true }).click();
    await denied
      .getByRole('alert')
      .filter({ hasText: /could not be saved locally/ })
      .waitFor();
    check(
      (await denied.getByLabel('Reason', { exact: true }).inputValue()) ===
        'Inputs survive storage error',
      'Storage denial lost draft',
    );
    await denied.close();
    result.flows.push('Denied local storage reports failure and preserves input');
    check(errors.length === 0, 'Browser errors: ' + errors.join(';'));
    check(writes.length === 0, 'Network writes observed');
    result.status = 'PASS';
  } catch (e) {
    result.status = 'FAIL';
    result.failure = e.stack || String(e);
    await page.screenshot({ path: path.join(out, 'states-failure.png') }).catch(() => {});
    throw e;
  } finally {
    await fs.writeFile(
      path.join(out, 'interaction-verification.json'),
      JSON.stringify(result, null, 2),
    );
    await browser.close();
  }
  console.log(JSON.stringify(result));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
