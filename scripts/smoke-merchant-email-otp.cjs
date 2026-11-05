const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 720 } });
    const signIn = await page.goto('http://127.0.0.1:3000/merchants/sign-in/email', {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    if (
      signIn?.status() !== 200 ||
      !(await page.getByRole('heading', { name: 'Sign in with email' }).isVisible())
    )
      throw new Error('The merchant email sign-in screen did not load.');
    if (!(await page.getByLabel('Email').isVisible()))
      throw new Error('The email field is missing.');
    await page.goto('http://127.0.0.1:3000/merchants/verify-email', {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });
    if (!page.url().includes('/sign-in?'))
      throw new Error('An unsigned visitor was not sent to sign in.');
    console.log('Merchant email sign-in loads and verification requires an applicant session.');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
