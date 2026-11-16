import { expect, test } from '@playwright/test';

/**
 * The /ask page after the Design B ("Cream Editorial") restyle: same copy,
 * same form behaviour, and no sideways scroll down to 360px.
 *
 * It also checked that the floating WhatsApp button stayed clear of the
 * footer's copyright line. Since 14 Nov 2026 (c59a5f3) that button shows on
 * Help and contact only, so the check is in help-whatsapp.spec.ts: here,
 * reading the position of a button /ask no longer has waited until every
 * test timed out.
 */

const WIDTHS = [1440, 1024, 768, 390, 360];

for (const width of WIDTHS) {
  test(`ask page at ${width}px`, async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    await context.addCookies([
      { name: 'nexg_asked', value: '1', url: baseURL ?? 'http://localhost:3000' },
    ]);
    await page.goto('/ask');

    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('Ask a concierge');

    // Every field is labelled and usable; the required ones stay required.
    await expect(page.getByLabel(/Where are you staying/)).toHaveAttribute('required', '');
    await expect(page.getByLabel(/WhatsApp number/)).toHaveAttribute('required', '');
    await page.getByLabel(/WhatsApp number/).fill('0712345678');
    await page.getByLabel('Your name').fill('Amina');
    await page.getByLabel('Anything else we should know?').fill('Room 12');

    // Chips behave as before: one pressed at a time.
    const drinks = page.getByRole('button', { name: 'Drinks', exact: true });
    await drinks.click();
    await expect(drinks).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Food', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    // "Pick a time" still reveals the time field.
    await page.getByRole('button', { name: 'Pick a time' }).click();
    await expect(page.getByLabel('What time suits you?')).toBeVisible();

    await expect(page.getByRole('button', { name: /Place your Order/ })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);

    if (width !== 360) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `docs/design-refs/ask/implementation/ask-${width}.png`,
        fullPage: true,
      });
    }
  });
}
