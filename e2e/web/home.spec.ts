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
 * What is worth asserting is the accessible name: the headline is
 * two lines styled apart ("Everything You Need." / "Wherever You
 * Stay."), and the aria-label is what makes a screen reader say
 * them as one sentence rather than run them together.
 */
test('the homepage headline has a stable accessible name', async ({ page }) => {
  await page.goto('/');
  const heading = page.getByRole('heading', { level: 1 }).first();
  await expect(heading).toBeVisible();
  await expect(heading).toHaveAttribute('aria-label', 'Everything You Need. Wherever You Stay.');
});

/**
 * A first visit opens on the page, not on a question.
 *
 * No precision banner over the hero and no location sheet over it; the
 * question is a small prompt beside the location pill, a moment later.
 */
test('a first visit sees the homepage, then a prompt at the location pill', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2500);

  await expect(page.getByRole('dialog', { name: /where should we deliver/i })).toHaveCount(0);
  await expect(page.getByText(/from your internet connection/i)).toHaveCount(0);

  const prompt = page.getByRole('status').filter({ hasText: 'Where should we deliver?' });
  await expect(prompt).toBeVisible();

  await prompt.getByRole('button', { name: 'Set my delivery spot' }).click();
  await expect(page.getByRole('dialog', { name: /where should we deliver/i })).toBeVisible();
});
