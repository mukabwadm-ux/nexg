import { expect, test } from '@playwright/test';

/**
 * The /hosts hero after the Design B ("Cream Editorial") restyle: same
 * copy, same two links, three stats, the three-panel unit card, and no
 * sideways scroll down to a 360px phone. Screenshots land in
 * docs/design-refs/hosts/implementation/ for comparison with the reference.
 */

const WIDTHS = [1440, 1024, 768, 390, 360];

for (const width of WIDTHS) {
  test(`hosts hero at ${width}px`, async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    // Mark the first-visit preference prompt as already answered.
    await context.addCookies([
      { name: 'nexg_asked', value: '1', url: baseURL ?? 'http://localhost:3000' },
    ]);
    await page.goto('/hosts');

    const skip = page.getByRole('button', { name: /Skip for now/ });
    await skip
      .first()
      .waitFor({ timeout: 5000 })
      .then(() => skip.first().click())
      .catch(() => {});

    const hero = page.locator('main section').first();

    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText(
      'Give your guests a concierge. Without hiring one.',
    );

    const list = hero.getByRole('link', { name: /List Your Airbnb/ });
    const how = hero.getByRole('link', { name: 'See how it works' });
    await expect(list).toHaveAttribute('href', '#list');
    await expect(how).toHaveAttribute('href', '#how');

    for (const term of ['KES 0', '10 min']) {
      await expect(hero.locator('dt', { hasText: term })).toBeVisible();
    }
    await expect(hero.locator('dd', { hasText: 'to list · guests pay per order' })).toBeVisible();
    await expect(hero.locator('dd', { hasText: 'to set up a unit' })).toBeVisible();
    await expect(hero.locator('dd', { hasText: 'across Kenya & Uganda' })).toBeVisible();

    // The card is aria-hidden, so check its three panels by text.
    for (const text of [
      '[Apartment 4B, Kilimani]',
      'Tonight · your guests',
      '[Review placeholder]',
    ]) {
      await expect(hero.getByText(text, { exact: false })).toBeVisible();
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);

    if (width !== 360) {
      await hero.screenshot({
        path: `docs/design-refs/hosts/implementation/hosts-hero-en-${width}.png`,
      });
    }

    // The links go where they always went.
    await list.click();
    await expect(page).toHaveURL(/#list$/);
    await how.click();
    await expect(page).toHaveURL(/#how$/);
  });
}
