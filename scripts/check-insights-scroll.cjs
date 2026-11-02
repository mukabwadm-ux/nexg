/* Targeted check after changing the Insights scroll containing block. */
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto('http://127.0.0.1:3141/merchant-live-preview/insights', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.locator('[data-insights-workspace][data-ready="true"]').waitFor({ timeout: 90000 });
    const result = await page.evaluate(() => {
      const element = document.querySelector('[data-insights-workspace]');
      const values = [...element.querySelectorAll('.in-metric strong')].map((value) => {
        const range = document.createRange();
        range.selectNodeContents(value);
        return { text: value.textContent, lines: range.getClientRects().length };
      });
      element.scrollTop = element.scrollHeight;
      return { documentHeight: document.documentElement.scrollHeight, viewportHeight: innerHeight, documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, innerScrollTop: element.scrollTop, values };
    });
    assert.ok(result.documentHeight <= result.viewportHeight, 'The outer page must not scroll into blank space');
    assert.equal(result.documentWidth, result.viewportWidth);
    assert.ok(result.innerScrollTop > 0, 'All report content remains reachable inside Insights');
    assert.ok(result.values.every(value => value.lines === 1), 'Metric values remain on one readable line');
    await fs.writeFile('docs/merchant-portal-plan/insights-implementation/scroll-verification.json', JSON.stringify({ checkedAt: new Date().toISOString(), status: 'passed', ...result }, null, 2));
    process.stdout.write(JSON.stringify(result));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
