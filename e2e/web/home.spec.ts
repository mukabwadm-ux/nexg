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
 * two lines styled apart ("Everything You Need." / "Right Where You
 * Are."), and the aria-label is what makes a screen reader say
 * them as one sentence rather than run them together.
 */
test('the homepage headline has a stable accessible name', async ({ page }) => {
  await page.goto('/');
  const heading = page.getByRole('heading', { level: 1 }).first();
  await expect(heading).toBeVisible();
  await expect(heading).toHaveAttribute('aria-label', 'Everything You Need. Right Where You Are.');
});

/**
 * A first visit opens on the page, not on a question.
 *
 * No precision banner over the hero, no location sheet over it, and since
 * 14 Nov 2026 (c59a5f3) no prompt beside the location pill either. The
 * question comes with the first search: without an exact spot, the hero
 * search asks "Where should we deliver?" first, then searches once the
 * sheet is answered or skipped.
 */
test('a first visit sees the homepage; the first search asks where to deliver', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForTimeout(2500);

  const sheet = page.getByRole('dialog', { name: /where should we deliver/i });
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText(/from your internet connection/i)).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: 'Where should we deliver?' }),
  ).toHaveCount(0);

  const search = page.getByRole('search');
  await search.getByRole('searchbox').fill('pizza');
  await search.getByRole('button', { name: 'Search' }).click();
  await expect(sheet).toBeVisible();

  await sheet.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page).toHaveURL(/\/discover\?q=pizza$/);
});
