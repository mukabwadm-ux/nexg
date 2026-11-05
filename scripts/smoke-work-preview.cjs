const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 630 } });
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  await page.goto('http://localhost:3129/merchant-live-preview', {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.getByRole('link', { name: 'Work', exact: true }).click();
  check(
    page.url().endsWith('/merchant-live-preview/work'),
    'Work did not open in the Home preview workspace',
  );
  await page.getByText('ORD-2048', { exact: true }).first().waitFor();
  check(
    (await page.getByRole('link', { name: 'Work', exact: true }).getAttribute('aria-current')) ===
      'page',
    'The existing navigation did not mark Work active',
  );
  const queueRows = page.getByTestId('work-queue').getByRole('button');
  check((await queueRows.count()) >= 12, 'Fewer than 12 in-progress records are available');
  const twelfthRow = await queueRows.nth(11).boundingBox();
  check(
    twelfthRow && twelfthRow.y >= 0 && twelfthRow.y + twelfthRow.height <= 630,
    'Twelve records do not fit in the desktop viewport',
  );
  const tabOverflow = await page
    .getByRole('tablist', { name: 'Work views' })
    .evaluate((node) => node.scrollHeight > node.clientHeight);
  check(!tabOverflow, 'The Work tab strip has an unwanted vertical scrollbar');
  const detailOverflow = await page
    .locator('.of-editor-body')
    .evaluate((node) => node.scrollHeight > node.clientHeight);
  check(!detailOverflow, 'The sample order detail needs internal scrolling at this desktop size');
  const actionBox = await page.getByRole('button', { name: 'Mark ready for pickup' }).boundingBox();
  check(
    actionBox && actionBox.y >= 0 && actionBox.y + actionBox.height <= 630,
    'The main action is outside the desktop viewport',
  );
  const progress = page.getByRole('list', { name: 'Work progress' });
  check(
    (await progress.locator('[aria-current="step"]').innerText()).includes('Picking'),
    'The progress indicator does not show the current stage',
  );
  for (const field of [
    'Maize flour 2 kg',
    'Cooking oil 1 L',
    'Milk 1 L',
    'Eggs tray',
    'Customer pickup',
    'Supermarket',
  ]) {
    const node = page.locator('.of-editor-body').getByText(field, { exact: true });
    const rect = await node.boundingBox();
    check(
      rect && rect.y >= 0 && rect.y + rect.height <= 630,
      `Order detail is outside the viewport: ${field}`,
    );
  }
  check(
    (await page.getByRole('tab', { name: 'Details' }).getAttribute('aria-selected')) === 'true',
    'Details should open by default',
  );
  await page.getByRole('tab', { name: 'Details' }).focus();
  await page.keyboard.press('ArrowRight');
  check(await page.getByText('Activity history').isVisible(), 'Activity history did not open');
  await page.getByRole('tab', { name: 'Details' }).click();
  await page.getByRole('button', { name: 'Close work details' }).click();
  check(
    !(await page.getByRole('complementary', { name: 'Selected work detail' }).count()),
    'Close did not dismiss the detail panel',
  );
  await page.getByText('ORD-2048', { exact: true }).click();
  check(
    await page.getByText('Confirmed automatically · stock allocated', { exact: true }).isVisible(),
    'Order confirmation is missing',
  );
  await page.getByRole('button', { name: 'Mark ready for pickup' }).click();
  check(
    await page.getByRole('status').filter({ hasText: 'Preview updated: Ready' }).isVisible(),
    'Order action did not update locally',
  );
  check(
    (await progress.locator('[aria-current="step"]').innerText()).includes('Ready'),
    'The progress indicator did not update',
  );
  await page.getByLabel('Search orders').fill('nothing matches');
  check(
    await page.getByText('Try another search or operator.').isVisible(),
    'Filtered empty state is missing',
  );
  await page.getByLabel('Search orders').fill('');
  await page.getByText('Choose sample specialty').click();
  await page.getByLabel('Sample specialty').selectOption('self_drive');
  await page.getByText('Choose sample specialty').click();
  await page.getByText('RNT-2048', { exact: true }).first().waitFor();
  check(
    await page.getByText('Self-drive · 3 days').first().isVisible(),
    'Rental details are missing',
  );
  await page.getByRole('button', { name: 'Record return' }).click();
  check(
    await page.getByRole('status').filter({ hasText: 'Preview updated: Returned' }).isVisible(),
    'Rental action did not update locally',
  );
  check(
    !(await page.getByText('Airport to Westlands').count()),
    'Transfer details appeared in self-drive rental',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText('RNT-2048', { exact: true }).first().click();
  check(
    await page.getByRole('button', { name: 'Back to work' }).isVisible(),
    'Mobile detail navigation is missing',
  );
  await page.getByRole('button', { name: 'Back to work' }).click();
  check(
    await page.getByRole('heading', { name: 'Work', exact: true }).isVisible(),
    'Mobile return to queue failed',
  );
  check(failures.length === 0, `Browser errors: ${failures.join('; ')}`);
  console.log(
    'Work preview: retail, rental, filtering, local actions and mobile navigation passed.',
  );
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
