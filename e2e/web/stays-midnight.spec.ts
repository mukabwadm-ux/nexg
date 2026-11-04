import { expect, test } from '@playwright/test';

/**
 * The /stays page after the Design A ("Midnight Hero") restyle: the
 * same copy, the same three-step form behaving as before, and no
 * sideways scroll down to a 360px phone. Screenshots land in
 * docs/design-refs/stays/implementation/ for comparison with the
 * reference.
 */

const WIDTHS = [1440, 1024, 768, 390, 360];

for (const width of WIDTHS) {
  test(`stays page at ${width}px`, async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    // Mark the first-visit preference prompt as already answered.
    await context.addCookies([
      { name: 'nexg_asked', value: '1', url: baseURL ?? 'http://localhost:3000' },
    ]);
    await page.goto('/stays');

    // The location sheet can open a moment after load; close it if it does.
    const skip = page.getByRole('button', { name: /Skip for now/ }).first();
    await skip
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => skip.click())
      .catch(() => undefined);

    await expect(page.locator('h1')).toHaveText('Tell us what you need. We’ll find the place.');
    for (const point of ['A person, not a filter', 'Concierge included', 'Nothing to pay to ask']) {
      await expect(page.getByText(point, { exact: true })).toBeVisible();
    }
    await expect(page.getByText('Listed now', { exact: true })).toBeVisible();

    // The four step-one fields are labelled and usable.
    for (const label of ['Check in', 'Check out', 'Guests', 'Bedrooms']) {
      await expect(page.getByLabel(label, { exact: true })).toBeEditable();
    }
    await page.getByLabel('Guests', { exact: true }).fill('3');
    await expect(page.getByLabel('Guests', { exact: true })).toHaveValue('3');

    // Continue validates the dates exactly as before, then moves on.
    await page.getByLabel('Check in', { exact: true }).fill('2026-12-10');
    await page.getByLabel('Check out', { exact: true }).fill('2026-12-05');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('The second date needs to be after the first.')).toBeVisible();
    await page.getByLabel('Check out', { exact: true }).fill('2026-12-14');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText(/Step 2 of 3/)).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);

    if (width !== 360) {
      await page.goto('/stays');
      await page.screenshot({
        path: `docs/design-refs/stays/implementation/stays-${width}.png`,
        fullPage: true,
      });
    }
  });
}
