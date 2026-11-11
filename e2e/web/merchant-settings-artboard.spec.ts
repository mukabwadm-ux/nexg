import { expect, test } from '@playwright/test';

/*
 * The settings preview only renders under `next dev`, so this spec runs with its own config:
 *   pnpm --filter @nexg/web exec next dev --port 3141
 *   pnpm exec playwright test -c playwright.settings-artboard.config.ts
 * The main config skips it, because the production build it starts answers this page with a 404.
 */
const preview = '/merchant-live-preview/settings';
test.beforeEach(async ({ page }) => {
  await page.goto(preview, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Personal profile', exact: true })).toBeVisible();
});

test('every section is reachable and the intended selected state is preserved', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [id, heading] of [
    ['account', 'Personal profile'],
    ['notifications', 'Choose your alerts'],
    ['preferences', 'Language and regional settings'],
    ['connections', 'Connections'],
    ['api', 'API credentials'],
    ['privacy', 'Review your data request'],
  ]) {
    await page.goto(`${preview}?section=${id}`);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    if (info.project.name === 'settings-desktop')
      await expect(
        page
          .getByRole('navigation', { name: 'Settings sections' })
          .locator('a[aria-current="page"]'),
      ).toHaveCount(1);
    else await expect(page.getByLabel('Settings section', { exact: true })).toHaveValue(id);
    await page.screenshot({ path: info.outputPath(`${id}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('preferences persist while Kenya time remains fixed; unsaved changes can be retained or discarded', async ({
  page,
}) => {
  await page.goto(`${preview}?section=preferences`);
  await page.getByRole('button', { name: '12-hour', exact: true }).click();
  await expect(page.getByText('2:30 PM EAT', { exact: true })).toBeVisible();
  await expect(page.getByText('Africa/Nairobi · EAT', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Preferences saved');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: '12-hour', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '24-hour', exact: true }).click();
  await page.getByLabel('Search settings', { exact: true }).fill('privacy');
  await page.getByRole('button', { name: 'Data & privacy Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay here' }).click();
  await expect(page.getByRole('button', { name: '24-hour', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Data & privacy Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Discard and continue' }).click();
  await expect(page.getByRole('heading', { name: 'Review your data request' })).toBeVisible();
});

test('personal alerts do not change business routing, and routing survives reload', async ({
  page,
}) => {
  await page.goto(`${preview}?section=notifications`);
  const personal = page.getByRole('switch', { name: 'New appointment request Email', exact: true });
  await personal.click();
  await expect(personal).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Personal notification preferences saved');
  await page.getByRole('button', { name: 'Business routing', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Business routing', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'New appointment request Email', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .getByLabel('New appointment request recipient', { exact: true })
    .selectOption('Branch manager');
  await page.getByRole('button', { name: 'Save routing', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Kilimani routing saved');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('New appointment request recipient', { exact: true })).toHaveValue(
    'Branch manager',
  );
});

test('connection recovery and read-only setup preserve independent booking ownership', async ({
  page,
}) => {
  await page.goto(`${preview}?section=connections`);
  await expect(page.getByText('Catalogue updates paused', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reconnect fleet catalogue', exact: true }).click();
  await page.getByRole('button', { name: 'Authorize sample connection', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Sample connection access restored');
  await expect(
    page.getByText('Ready for the supported sample operations.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add connection', exact: true }).click();
  await page.getByLabel('Connection name', { exact: true }).fill('Test catalogue');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Authorize sample read access', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Finish sample setup', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Test catalogue', exact: true })).toBeVisible();
  await expect(
    page.getByText('This connection does not write bookings or availability.', { exact: true }),
  ).toBeVisible();
});

test('credential creation requires review and revocation affects only that credential', async ({
  page,
}) => {
  await page.goto(`${preview}?section=api`);
  await page.getByRole('button', { name: 'Create key', exact: true }).click();
  await page.getByLabel('Credential name', { exact: true }).fill('Review-only key');
  await page.getByRole('button', { name: 'Review access', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('This preview creates a sample label only');
  await page.getByRole('button', { name: 'Create sample credential', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'Review-only key' });
  await row.getByRole('button', { name: 'Manage', exact: true }).click();
  await page.getByRole('button', { name: 'Revoke key', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm revoke', exact: true }).click();
  await expect(row).toContainText('Revoked');
  await expect(page.getByRole('row').filter({ hasText: 'Stock reader' })).toContainText('Active');
  await expect(
    page.getByRole('heading', { name: 'Latest delivery', exact: true }).locator('..'),
  ).toContainText('Failed');
});

test('webhook validation rejects unsafe endpoints and new signing is pending', async ({ page }) => {
  await page.goto(`${preview}?section=api`);
  await page.getByRole('button', { name: 'Add webhook', exact: true }).click();
  await page.getByLabel('Subscription name', { exact: true }).fill('New subscriber');
  await page.getByLabel('HTTPS destination', { exact: true }).fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Review subscription', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Use an HTTPS destination');
  await page
    .getByLabel('HTTPS destination', { exact: true })
    .fill('https://new.example.test/events');
  await page.getByRole('button', { name: 'Review subscription', exact: true }).click();
  await page.getByRole('button', { name: 'Add sample webhook', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'New subscriber' })).toContainText(
    'Verification pending',
  );
});

test('data request submission is distinct from completion, and sample closure does not erase history', async ({
  page,
}) => {
  await page.goto(`${preview}?section=privacy`);
  await page.getByRole('button', { name: 'Submit request', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Request submitted', exact: true })).toBeVisible();
  await expect(page.getByText('Submitted', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('DR-0142', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review account closure', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Submit closure request', exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel('Type CLOSE to request sample account closure', { exact: true })
    .fill('CLOSE');
  await page.getByRole('button', { name: 'Submit closure request', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Account closure request');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByText('DR-0142', { exact: true })).toBeVisible();
});

test('dialogs trap focus, close with Escape, and return focus to the initiating control', async ({
  page,
}) => {
  const edit = page.getByRole('button', { name: 'Edit profile', exact: true });
  await edit.click();
  const dialog = page.getByRole('dialog', { name: 'Edit personal profile' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(edit).toBeFocused();
});

test('Offerings renders its shared table without an undefined component', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/merchant-live-preview/offerings', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Offerings', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Edit Occasion makeup', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: /catalogue/i }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
