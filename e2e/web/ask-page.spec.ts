import { expect, test } from '@playwright/test';

/**
 * The /ask page after its 17 Nov 2026 redesign: the site's current look, and
 * the request form in the merchant and rider forms' style (numbered sections,
 * one open at a time) with "What you need" as a dropdown of NexG's
 * categories. Every field is labelled, the required ones stay required, and
 * nothing scrolls sideways down to 360px.
 *
 * It does not send the request: that raises a real support ticket.
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

    // 1. What you need: a category, and the request in their own words.
    const category = page.getByLabel(/^Category/);
    await expect(category).toHaveAttribute('required', '');
    // NexG's 21 categories, after the "Choose a category" placeholder.
    await expect(category.locator('option')).toHaveCount(22);
    await category.selectOption('airport_transfers');
    await page.getByLabel(/Tell us more/).fill('KQ 101 lands at 6am, two bags');
    await page.getByRole('button', { name: 'Continue' }).click();

    // 2. Where and when. Typing opens the place search, so step out of it
    //    (a click elsewhere closes it) before choosing a time.
    const staying = page.getByLabel(/Where are you staying/);
    await expect(staying).toBeVisible();
    await expect(staying).toHaveAttribute('required', '');
    await staying.fill('Riverside Drive, Kilimani');
    await page.getByRole('heading', { name: 'Where and when' }).click();
    await page.getByText('Pick a time').click();
    await expect(page.getByLabel(/What time suits you/)).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();

    // 3. How we reach you.
    const phone = page.getByLabel(/WhatsApp number/);
    await expect(phone).toBeVisible();
    await expect(phone).toHaveAttribute('required', '');
    await phone.fill('0712345678');
    await page.getByLabel(/Your name/).fill('Amina');

    // The folded sections read back what was chosen.
    await expect(page.getByText('Airport Transfers · KQ 101 lands at 6am, two bags')).toBeVisible();
    await expect(page.getByText('Riverside Drive, Kilimani · At a time to arrange')).toBeVisible();
    await expect(page.getByText('3 of 3 complete')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send request' })).toBeVisible();

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

test('a link names the category', async ({ page, context, baseURL }) => {
  await context.addCookies([
    { name: 'nexg_asked', value: '1', url: baseURL ?? 'http://localhost:3000' },
  ]);

  await page.goto('/ask?category=laundry_cleaning');
  await expect(page.getByLabel(/^Category/)).toHaveValue('laundry_cleaning');

  // The older links named one of the chips the form used to have.
  await page.goto('/ask?need=Airport%20Transfer');
  await expect(page.getByLabel(/^Category/)).toHaveValue('airport_transfers');

  // Anything else in ?need= is the request itself, in their words.
  await page.goto('/ask?need=Two%20pizzas%20and%20a%20cake');
  await expect(page.getByLabel(/^Category/)).toHaveValue('');
  await expect(page.getByLabel(/Tell us more/)).toHaveValue('Two pizzas and a cake');
});
