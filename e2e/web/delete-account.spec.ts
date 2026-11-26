import { expect, test } from '@playwright/test';

/**
 * The account deletion link the app stores ask for: it must open signed out,
 * name who runs NexG, say how to delete and what is kept, and be linked from
 * the Privacy Policy.
 */

test('the deletion page works signed out', async ({ page }) => {
  await page.goto('/account/delete');
  await expect(page).toHaveURL(/\/account\/delete$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Delete your NexG account');
  await expect(page.getByText('NexGenius Concierge Limited').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in to delete your account' })).toHaveAttribute(
    'href',
    '/sign-in?next=%2Faccount%2Fdelete',
  );
  await expect(page.getByRole('heading', { name: 'What is deleted' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'derrick@nexgapp.com' })).toBeVisible();
});

test('the short address leads there', async ({ page }) => {
  await page.goto('/delete-account');
  await expect(page).toHaveURL(/\/account\/delete$/);
});

test('the Privacy Policy links to it', async ({ page }) => {
  await page.goto('/legal/privacy');
  await page.getByRole('link', { name: 'Delete your account' }).click();
  await expect(page).toHaveURL(/\/account\/delete$/);
});
