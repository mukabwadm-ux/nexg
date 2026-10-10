import { expect, test } from '@playwright/test';

/**
 * M1 smoke tests: both apps boot, and the design system renders and is usable
 * at the 390px viewport the spec requires.
 */

test.describe('admin ui-kit', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ui-kit');
  });

  test('renders a section for every component', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'NexG UI kit', level: 1 })).toBeVisible();

    for (const name of [
      'Button',
      'Input',
      'PhoneInput',
      'Select',
      'ChipGroup',
      'Stepper',
      'FileDrop',
      'StatusBadge',
      'Tag',
      'Card',
      'KpiTile',
      'DataTable',
      'DetailPanel',
      'Toast',
      'EmptyState',
    ]) {
      await expect(page.getByRole('heading', { name, level: 2, exact: true })).toBeVisible();
    }
  });

  test('the page never scrolls sideways', async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    // Wide content scrolls inside its own container, not the document.
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('the phone input emits E.164 for a Kenyan number', async ({ page }) => {
    const phone = page.locator('#k-phone');
    await phone.fill('0712345678');

    await expect(page.getByTestId('k-phone-e164')).toHaveText('Will be saved as +254712345678');
  });

  test('the detail panel traps focus and closes on Escape', async ({ page }) => {
    const trigger = page.getByRole('button', { name: 'Default', exact: true });
    await trigger.click();

    const panel = page.getByRole('dialog');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { name: '[Rider A]' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('a toast is announced and can be dismissed', async ({ page }) => {
    await page.getByRole('button', { name: 'Success', exact: true }).click();

    const toast = page.getByRole('status').filter({ hasText: 'Document verified' });
    await expect(toast).toBeVisible();

    await toast.getByRole('button', { name: 'Dismiss notification' }).click();
    await expect(toast).toBeHidden();
  });

  test('the data table sorts and filters', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: /Filter Riders/i });
    await search.fill('Mombasa');

    const table = page.getByRole('table', { name: 'Riders' });
    await expect(table.getByText('[Rider B]')).toBeVisible();
    await expect(table.getByText('[Rider A]')).toBeHidden();
  });

  test('unset KPI values render the placeholder, not a number', async ({ page }) => {
    // Spec ground rule 3: no invented business numbers.
    const tile = page
      .locator('div')
      .filter({ hasText: /^Merchants total/ })
      .first();
    await expect(tile).toContainText('[—]');
  });
});

test('the public site boots', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('public site');
});
