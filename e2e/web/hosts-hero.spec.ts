import { expect, test } from '@playwright/test';

/**
 * The /hosts hero as rebuilt in #82 (host and guest benefits and
 * packages), on the Design B ("Cream Editorial") layout: one headline,
 * the two links, three stats, the three-panel dashboard card, and no
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
      'List your property free. Run every unit from one place.',
    );

    const list = hero.getByRole('link', { name: /Start your free month/ });
    const how = hero.getByRole('link', { name: 'See how it works' });
    await expect(list).toHaveAttribute('href', '#list');
    await expect(how).toHaveAttribute('href', '#how');

    // The third stat's number is the live city count, so only its caption is fixed.
    for (const term of ['KES 0', '1 month']) {
      await expect(hero.locator('dt', { hasText: term })).toBeVisible();
    }
    await expect(hero.locator('dd', { hasText: 'to list your property' })).toBeVisible();
    await expect(hero.locator('dd', { hasText: 'of management free' })).toBeVisible();
    await expect(hero.locator('dd', { hasText: 'across Kenya & Uganda' })).toBeVisible();

    // The card is aria-hidden, so check its three panels by text.
    for (const text of [
      'Your host dashboard · 3 units',
      'Apartment 4B · Kilimani',
      'Guest ordered dinner to 4B',
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
