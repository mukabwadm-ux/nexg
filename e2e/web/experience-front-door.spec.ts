import { expect, test } from '@playwright/test';

/**
 * The /experience front door after the Design B ("Cream Editorial")
 * restyle: same copy, same two links, three promise cards, and no
 * sideways scroll down to a 360px phone. Screenshots land in
 * docs/design-refs/experience/implementation/ for comparison with the
 * reference.
 */

const WIDTHS = [1440, 1024, 768, 390, 360];

for (const width of WIDTHS) {
  test(`experience front door at ${width}px`, async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    // Mark the first-visit preference prompt as already answered.
    await context.addCookies([
      { name: 'nexg_asked', value: '1', url: baseURL ?? 'http://localhost:3000' },
    ]);
    await page.goto('/experience');

    const skip = page.getByRole('button', { name: /Skip for now/ });
    if (await skip.count()) await skip.first().click();

    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('Customize your experience.');

    const build = page.getByRole('link', { name: /Build my day/ });
    const tell = page.getByRole('link', { name: 'Or just tell us what you need' });
    await expect(build).toHaveAttribute('href', '/experience/build');
    await expect(tell).toHaveAttribute('href', '/help#concierge');

    for (const title of ['Your budget', 'One concierge', 'Pay once']) {
      await expect(page.getByRole('listitem').filter({ hasText: title }).first()).toBeVisible();
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);

    if (width !== 360) {
      await page.screenshot({
        path: `docs/design-refs/experience/implementation/experience-${width}.png`,
        fullPage: true,
      });
    }
  });
}
