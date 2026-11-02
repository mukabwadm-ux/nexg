const { chromium } = require('@playwright/test');
const { mkdir } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const assert = (value, message) => {
      if (!value) throw new Error(message);
    };
    const folder = join(tmpdir(), 'nexg-business-verification');
    await mkdir(folder, { recursive: true });
    await page.goto('http://localhost:3129/merchant-live-preview/business', {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    await page.getByRole('heading', { name: 'Your activities', exact: true }).waitFor();
    assert(
      (await page
        .getByRole('link', { name: 'Business', exact: true })
        .getAttribute('aria-current')) === 'page',
      'Business navigation is not active',
    );
    for (const [name, key] of [
      ['Profile', 'profile'],
      ['Activities & setup', 'activities'],
      ['Locations & coverage', 'locations'],
      ['Team', 'team'],
      ['Documents', 'documents'],
      ['Customer feedback', 'feedback'],
    ]) {
      await page.getByRole('tab', { name, exact: true }).click();
      if (key === 'profile') {
        const image = page.getByAltText('Business banner photo', { exact: true });
        await image.evaluate(async (node) => {
          await node.decode();
        });
        const save = await page
          .getByRole('button', { name: 'Save profile', exact: true })
          .boundingBox();
        assert(save && save.y + save.height <= 864, 'Profile actions are outside the viewport');
      }
      await page.screenshot({ path: join(folder, `${key}.png`) });
    }
    await page.getByRole('tab', { name: 'Profile', exact: true }).click();
    await page.getByRole('button', { name: 'Remove banner', exact: true }).click();
    assert(
      await page.getByText('No banner photo', { exact: true }).isVisible(),
      'Banner removal did not update the customer preview',
    );
    await page
      .getByLabel('Upload banner photo', { exact: true })
      .setInputFiles({
        name: 'not-an-image.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('not an image'),
      });
    assert(
      await page.getByRole('status').filter({ hasText: 'Choose a PNG, JPEG or WebP' }).isVisible(),
      'Unsupported banner files were not rejected',
    );
    const png = Buffer.from(
      await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 900;
        c.height = 300;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#367a63';
        ctx.fillRect(0, 0, 900, 300);
        return c.toDataURL('image/png').split(',')[1];
      }),
      'base64',
    );
    await page
      .getByLabel('Upload banner photo', { exact: true })
      .setInputFiles({ name: 'banner.png', mimeType: 'image/png', buffer: png });
    await page.waitForFunction(() =>
      document
        .querySelector('img[alt="Business banner photo"]')
        ?.getAttribute('src')
        ?.startsWith('data:image/'),
    );
    await page.getByLabel('Trading name', { exact: true }).fill('Recovered sample name');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Profile', exact: true }).click();
    assert(
      (await page.getByLabel('Trading name', { exact: true }).inputValue()) ===
        'Recovered sample name',
      'Profile draft was not recovered',
    );
    assert(
      (
        await page.getByAltText('Business banner photo', { exact: true }).getAttribute('src')
      ).startsWith('data:image/'),
      'Banner draft was not recovered',
    );
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm preview changes', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Public profile updated' }).waitFor();
    await page.getByRole('tab', { name: 'Activities & setup', exact: true }).click();
    await page.getByRole('button', { name: 'Set coverage', exact: true }).click();
    await page.getByLabel('Service coverage', { exact: true }).fill('Westlands and Parklands');
    await page.getByLabel('Enable after business setup validation').check();
    await page.getByRole('button', { name: 'Review changes', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm preview changes', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Activities & setup updated' }).waitFor();
    assert(
      await page.getByText('3 configured activities', { exact: true }).isVisible(),
      'Hybrid activity setup was not saved',
    );
    await page.getByRole('tab', { name: 'Locations & coverage', exact: true }).click();
    await page.getByRole('button', { name: 'Edit location', exact: true }).click();
    await page.getByLabel('Publish this sample location').uncheck();
    await page.getByRole('button', { name: 'Review changes', exact: true }).click();
    assert(
      await page.getByRole('button', { name: 'Confirm preview changes', exact: true }).isDisabled(),
      'A location with commitments can be closed',
    );
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
    await page.getByRole('tab', { name: 'Team', exact: true }).click();
    await page.getByRole('button', { name: 'Invite member', exact: true }).click();
    await page.getByLabel('Member name', { exact: true }).fill('Preview colleague');
    await page.getByLabel('Invitation email', { exact: true }).fill('preview@example.test');
    await page.getByRole('button', { name: 'Review changes', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm preview changes', exact: true }).click();
    await page.getByRole('button', { name: 'Preview colleague', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Documents', exact: true }).click();
    await page.getByLabel('Replacement file', { exact: true }).setInputFiles({
      name: 'replacement.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF sample preview'),
    });
    await page.getByRole('button', { name: 'Replace document', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Replacement document submitted' }).waitFor();
    assert(
      await page.getByText('Current v1 verified', { exact: true }).isVisible(),
      'Replacing a document changed confirmed evidence',
    );
    await page.getByRole('tab', { name: 'Customer feedback', exact: true }).click();
    await page
      .getByLabel('Reply as Recovered sample name', { exact: true })
      .fill('A local sample reply.');
    await page.getByRole('button', { name: 'Post reply', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm preview changes', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Reply posted in local preview' }).waitFor();
    await page.getByRole('button', { name: 'Choose sample state' }).click();
    await page.getByLabel('Source and access state').selectOption('viewer');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    assert(
      await page.getByRole('button', { name: 'Post reply', exact: true }).isDisabled(),
      'Viewer can edit feedback',
    );
    await page.getByRole('button', { name: 'Choose sample state' }).click();
    await page.getByLabel('Source and access state').selectOption('normal');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('button', { name: 'Choose sample state' }).click();
    await page.getByLabel('Source and access state').selectOption('conflict');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('tab', { name: 'Profile', exact: true }).click();
    await page.getByLabel('Trading name', { exact: true }).fill('Conflict draft');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm preview changes', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'another tab' }).waitFor();
    await page.getByRole('button', { name: 'Reload current', exact: true }).click();
    await page.getByLabel('Trading name', { exact: true }).waitFor();
    assert(
      (await page.getByLabel('Trading name', { exact: true }).inputValue()) === 'Conflict draft',
      'Conflict recovery lost the profile draft',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('tab', { name: 'Team', exact: true }).click();
    assert(
      await page.getByRole('heading', { name: 'Team members', exact: true }).isVisible(),
      'Mobile section is unreachable',
    );
    assert(errors.length === 0, errors.join('\n'));
    console.log(
      'Business: all six screens, draft recovery, local revisions, hybrid setup, commitment protection, invitation preview, evidence replacement, feedback, permissions and mobile passed.',
    );
    console.log(`Screenshots: ${folder}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
