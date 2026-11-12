import { expect, test } from '@playwright/test';

/**
 * Discovery's top bar is the site header (owner, 12 Nov 2026): the same logo, Deliver to chip,
 * theme toggle and menu as every other page, without the account icon. Discovery's own bar
 * (catalog area and search) sits under it and stays pinned under it while the page scrolls.
 *
 * Discovery is a separate app that /discover mounts under the header
 * (apps/web/components/discovery/discovery-app.tsx), so these also prove it renders there.
 */

test.describe('Discovery has the site header', () => {
  test('the site header, without the account icon', async ({ page }) => {
    await page.goto('/discover');
    const header = page.getByRole('banner');

    await expect(header.getByRole('link', { name: 'NexG Concierge, home' })).toBeVisible();
    await expect(header.getByRole('button', { name: /deliver to/i })).toBeVisible();
    await expect(
      header.getByRole('button', { name: /switch to (light|dark) mode/i }),
    ).toBeVisible();
    await expect(header.getByRole('button', { name: 'Open menu' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Your account' })).toHaveCount(0);

    /* Discovery itself, with its search, and none of its old account links. */
    await expect(page.getByRole('combobox', { name: 'Search merchants' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^sign (in|up)$/i })).toHaveCount(0);
  });

  test("Discovery's search stays pinned under the header", async ({ page }) => {
    await page.goto('/discover');
    const search = page.getByRole('combobox', { name: 'Search merchants' });
    await expect(search).toBeVisible();
    /* Room to scroll whatever the seed data, so the test is about pinning and not page length.
       Inside the bar's parent, which a sticky bar never leaves. */
    await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>('#discovery-root main');
      if (main) main.style.minHeight = '3000px';
    });

    await page.mouse.wheel(0, 1500);
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { message: 'the page scrolled' })
      .toBeGreaterThan(200);
    await expect
      .poll(async () => {
        const header = await page.getByRole('banner').boundingBox();
        const field = await page.locator('form[role="search"]').first().boundingBox();
        return header && field ? Math.round(field.y - (header.y + header.height)) : null;
      })
      .toBeGreaterThanOrEqual(0);
    const header = await page.getByRole('banner').boundingBox();
    const field = await page.locator('form[role="search"]').first().boundingBox();
    expect(header?.y).toBe(0);
    /* Right under the header: the bar's padding at most. */
    expect((field?.y ?? 999) - ((header?.y ?? 0) + (header?.height ?? 0))).toBeLessThanOrEqual(20);
  });

  test('the menu is the site menu', async ({ page }) => {
    await page.goto('/discover');
    await page.getByRole('banner').getByRole('button', { name: 'Open menu' }).click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await expect(menu.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  test('other pages keep the account icon', async ({ page }) => {
    await page.goto('/help');
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'Your account' }),
    ).toBeVisible();
  });
});
