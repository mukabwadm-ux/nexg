import { expect, test } from '@playwright/test';

/**
 * The /hosts hero as rebuilt from the owner's "List Your Property" mockup
 * (e23578d1): one headline over the dusk photo, the "List My Property"
 * button that brings the form card into view, four benefits, the form card,
 * and "What can you list on NEXG?" whose cards fill the form's Property
 * Type. No sideways scroll down to a 360px phone. Screenshots land in
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

    const hero = page.locator('main section').first();

    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('List Your Property on NEXG');
    await expect(hero.getByText('NEXG Stay Partners')).toBeVisible();

    for (const benefit of [
      'Increase occupancy & revenue',
      'Access a global base of quality guests',
      'Secure & reliable payments',
      'Dedicated partner support',
    ]) {
      await expect(hero.getByText(benefit)).toBeVisible();
    }

    // The form card: the host application, under the hero on a phone and over it from lg up.
    const form = page.locator('form#list');
    await expect(form.getByRole('heading', { name: 'List Your Property' })).toBeVisible();
    await expect(form.getByRole('button', { name: 'Submit & Get Started' })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);

    if (width !== 360) {
      await hero.screenshot({
        path: `docs/design-refs/hosts/implementation/hosts-hero-en-${width}.png`,
      });
    }

    // "List My Property" brings the form into view and puts the cursor in it.
    await hero.getByRole('button', { name: 'List My Property' }).click();
    await expect(page.locator('#list_name')).toBeFocused();
    await expect(form).toBeInViewport();

    // Choosing what to list marks the card chosen (and fills Property Type).
    const apartments = page
      .locator('section[aria-labelledby="what-to-list-title"]')
      .getByRole('button', { name: /Apartments/ });
    await expect(apartments).toHaveAttribute('aria-pressed', 'false');
    await apartments.click();
    await expect(apartments).toHaveAttribute('aria-pressed', 'true');

    // The page's other way in still goes where it always went.
    await expect(page.locator('section#how')).toHaveCount(1);
  });
}
