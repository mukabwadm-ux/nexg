import { expect, test, type Locator } from '@playwright/test';

/**
 * The floating WhatsApp button, on Help and contact.
 *
 * Since 14 Nov 2026 (c59a5f3) the button shows on /help only. Scrolled to
 * the end of the page it must not cover the footer's last row: the
 * copyright line, or the language switcher beside it, down to a 360px phone.
 * While the button is on the page, the footer ends that row above it
 * (packages/ui globals.css, `[data-footer-end]`).
 *
 * The /ask spec used to check the copyright line, but it measured while the
 * page was still scrolling smoothly to the bottom, so it never caught the
 * overlap this one found on phones.
 */

const WIDTHS = [1440, 1024, 768, 390, 360];

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  expect(found, 'Not on the page.').not.toBeNull();
  return found!;
}

for (const width of WIDTHS) {
  test(`help page WhatsApp button at ${width}px`, async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    // Mark the first-visit preference prompt as already answered.
    await context.addCookies([
      { name: 'nexg_asked', value: '1', url: baseURL ?? 'http://localhost:3000' },
    ]);
    await page.goto('/help');

    const whatsapp = page.getByRole('link', { name: 'Chat with us on WhatsApp' });
    await expect(whatsapp).toBeVisible();

    // `instant`, because the page scrolls smoothly and would be measured part-way.
    await page.evaluate(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
    );
    const footer = page.locator('footer');
    const copyright = footer.getByText(/All rights reserved/);
    await expect(copyright).toBeInViewport();

    const button = await box(whatsapp);
    const row = [copyright, ...(await footer.locator('button[lang]').all())];
    for (const item of row) {
      const it = await box(item);
      const overlaps =
        it.x < button.x + button.width &&
        button.x < it.x + it.width &&
        it.y < button.y + button.height &&
        button.y < it.y + it.height;
      expect(overlaps, `The WhatsApp button covers "${await item.innerText()}".`).toBe(false);
    }
  });
}
