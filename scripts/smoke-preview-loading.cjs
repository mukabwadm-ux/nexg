const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const requests = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (
        url.origin === 'http://127.0.0.1:3000' &&
        /^\/merchant-live-preview\/[^/]+/.test(url.pathname)
      )
        requests.push(url.pathname);
    });
    const response = await page.goto('http://127.0.0.1:3000/merchant-live-preview?state=setup', {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    if (response?.status() !== 200) throw new Error('The demo did not load.');
    await page.waitForTimeout(2500);
    if (requests.length)
      throw new Error('The demo loaded other workspace pages without an interaction.');
    const workRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname === '/merchant-live-preview/work',
      { timeout: 20000 },
    );
    await page
      .getByRole('navigation', { name: 'Merchant preview navigation' })
      .getByRole('link', { name: 'Work', exact: true })
      .hover();
    await workRequest;
    console.log('Demo pages stay idle until a merchant points to a destination.');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
