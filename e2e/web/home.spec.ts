import { expect, test } from '@playwright/test';

/**
 * The homepage headline.
 *
 * This lived in the admin suite as "the public site boots",
 * asserting that the `h1` contained the words "public site" —
 * true of a scaffold, never true of the real page, and pointed
 * at a hardcoded 127.0.0.1:3000 from a project whose baseURL
 * was the admin app. It had been failing for as long as the
 * suite had been unable to start a browser.
 *
 * What is worth asserting is the accessible name. The headline
 * animates a rotating word through its text, so its text
 * content is whatever frame you caught; `aria-label` is the
 * fixed sentence a screen reader reads, and an animation that
 * broke it would be a real regression.
 */
test('the homepage headline has a stable accessible name', async ({ page }) => {
  await page.goto('/');
  const heading = page.getByRole('heading', { level: 1 }).first();
  await expect(heading).toBeVisible();
  await expect(heading).toHaveAttribute('aria-label', 'Everything at your Doorstep');
});
