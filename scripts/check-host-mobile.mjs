import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NEXG_PLAYWRIGHT_MODULE || '@playwright/test');
const base = process.env.HOST_PREVIEW_URL || 'http://127.0.0.1:4178/nexg-hosts-workspace/';
const output = process.env.HOST_SCREENSHOT_DIR || 'hosts-workspace/test-results/mobile';
// Start Vite from hosts-workspace/: npx vite --host 127.0.0.1 --port 4178
// All requests below are fulfilled locally. Never use real host records for screenshot fixtures.
await fs.mkdir(output, { recursive: true });
const today = '2026-11-09';
const property = {
  id: 'property-a',
  name: 'Demo Stays Kilimani',
  description: '',
  area: 'Kilimani, Nairobi',
  image: '',
  status: 'Active',
};
const unit = {
  id: 'unit-a',
  propertyId: property.id,
  name: 'A1204',
  capacity: 4,
  bedrooms: 2,
  bathrooms: 2,
  nightlyMinor: 850000,
  readiness: 'Ready',
  image: '',
  deliveryRule: 'Meet at reception',
  contact: 'Reception',
  hours: '08:00–20:00',
  access: 'Reception desk',
  status: 'Active',
};
const stay = {
  id: 'stay-a',
  ref: 'NXG-1042',
  unitId: unit.id,
  guest: 'Alex Morgan',
  start: today,
  end: '2026-11-12',
  status: 'Confirmed',
  kind: 'Short stay',
  guests: 2,
  totalMinor: 2550000,
  arrivalTime: '15:00',
};
const actor = {
  id: 'owner-a',
  name: 'Demo Host',
  email: 'demo@example.test',
  role: 'Owner',
  propertyIds: [],
};
const snapshot = {
  actor,
  today,
  propertyWrites: true,
  setup: {
    live: true,
    status: 'verified',
    verificationCode: null,
    verificationMethod: null,
    submittedAt: null,
    verifiedAt: null,
    steps: { profile: true, unit: true, handoff: true, packages: true, verification: true },
    readiness: [],
  },
  data: {
    properties: [
      property,
      { ...property, id: 'property-b', name: 'Garden Residence', area: 'Westlands' },
    ],
    units: [unit, { ...unit, id: 'unit-b', name: 'B0710', readiness: 'Cleaning' }],
    stays: [stay],
    tasks: [
      {
        id: 'task-a',
        unitId: 'unit-b',
        title: 'Prepare guest room',
        type: 'Cleaning',
        assigneeId: actor.id,
        due: today + 'T14:00',
        priority: 'Normal',
        status: 'To do',
        checklist: 'Fresh linen\nCheck amenities',
        workspaceTask: true,
      },
    ],
    payments: [],
    expenses: [],
    articles: [],
    qrCards: [],
    packages: [],
    packageJobs: [],
    deliveries: [],
    team: [{ ...actor, status: 'Active' }],
    invoices: [],
    referrals: [],
    devices: [],
    audit: [],
    feedback: [],
    versions: [],
    calendarConnections: [],
    priorityRules: [],
    settings: {
      workspace: 'Demo Stays',
      business: 'Demo Stays',
      currency: 'KES',
      timezone: 'Africa/Nairobi',
      checkIn: '15:00',
      checkOut: '11:00',
      language: 'English',
      signature: 'The Demo Stays team',
      folioEnabled: false,
      settingsWritable: true,
    },
  },
};
const thread = {
  id: 'thread-a',
  subject: 'Preparing for our next arrival',
  topic: 'other',
  status: 'open',
  unread: 0,
  lastMessage: 'Your guest guide is ready to share.',
  lastAt: '2026-11-09T09:00:00Z',
};
const inbox = { threads: [thread], topics: [{ value: 'other', label: 'General support' }] };
const conversation = {
  thread,
  messages: [
    {
      id: 'message-a',
      body: 'Your guest guide is ready to share. Open the QR cards section to preview it before your next arrival.',
      mine: false,
      author: 'NexG support',
      at: '2026-11-09T09:00:00Z',
      redacted: false,
    },
  ],
  earlierBefore: null,
};
const browser = await chromium.launch({
  headless: true,
  channel: process.env.HOST_BROWSER_CHANNEL || 'chrome',
});
const failures = [],
  results = [],
  errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.clock.install({ time: new Date('2026-11-09T12:00:00Z') });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(
    (url) => url.pathname.startsWith('/api/host-workspace'),
    async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/support'))
        return route.fulfill({ json: url.searchParams.has('thread') ? conversation : inbox });
      if (route.request().method() !== 'GET')
        return route.fulfill({ status: 400, json: { error: 'Read-only local test fixture' } });
      return route.fulfill({ json: snapshot });
    },
  );
  async function go(section) {
    await page.goto(base + '#' + section, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('.page-content').waitFor();
    await page.waitForTimeout(180);
    await page.locator('.page-content').evaluate((e) => (e.scrollTop = 0));
  }
  async function check(label, fn) {
    try {
      await fn();
      results.push(label);
      console.log('PASS', label);
    } catch (e) {
      failures.push(label + ': ' + e.message);
      console.log('FAIL', label, e.message);
    }
  }
  async function noOverflow() {
    const value = await page.evaluate(() => ({
      viewport: innerWidth,
      doc: document.documentElement.scrollWidth,
      content: document.querySelector('.page-content').clientWidth,
      scroll: document.querySelector('.page-content').scrollWidth,
    }));
    assert.ok(
      value.doc <= value.viewport + 1 && value.scroll <= value.content + 1,
      JSON.stringify(value),
    );
  }
  for (const width of process.env.HOST_CHECK_FOCUS ? [] : [320, 360, 390, 430, 768, 800, 1440]) {
    await page.setViewportSize({ width, height: width > 800 ? 1000 : 844 });
    for (const section of [
      'overview',
      'properties',
      'calendar',
      'inbox',
      'operations',
      'finances',
      'reports',
      'settings',
    ]) {
      await check(`${width}px ${section} fits`, async () => {
        await go(section);
        await noOverflow();
        assert.equal(await page.locator('.page-header h1, .overview-header h1').count(), 1);
      });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await check('Mobile navigation closes, traps focus and preserves routing', async () => {
    await go('overview');
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.getByRole('button', { name: 'Close navigation', exact: true }).waitFor();
    await page.keyboard.press('Shift+Tab');
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent?.trim()),
      'Sign out',
    );
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
      'Close navigation',
    );
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.sidebar').evaluate((e) => e.inert), true);
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await page.getByRole('heading', { name: 'Calendar', exact: true }).waitFor();
    assert.equal(await page.locator('.sidebar').evaluate((e) => e.inert), true);
  });
  await check('Agenda defaults on phones; dates, grid and modal remain usable', async () => {
    await go('calendar');
    assert.equal(
      await page.getByRole('tab', { name: 'Agenda', exact: true }).getAttribute('aria-selected'),
      'true',
    );
    await page
      .getByRole('button', { name: /Alex Morgan/ })
      .first()
      .click();
    await page.locator('.record-dialog').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.record-dialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Next period', exact: true }).click();
    assert.ok((await page.locator('.agenda-day').first().textContent()).includes('16 Nov'));
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await page.getByRole('tab', { name: 'Week', exact: true }).click();
    const before = await page.locator('.unit-grid-label').first().boundingBox();
    await page.locator('.calendar-scroll').evaluate((e) => (e.scrollLeft = 250));
    const after = await page.locator('.unit-grid-label').first().boundingBox();
    assert.ok(Math.abs(before.x - after.x) < 2, 'Unit column should stay visible');
    await page.getByRole('tab', { name: 'Agenda', exact: true }).click();
    await page.getByRole('button', { name: 'Add reservation on 2026-11-09', exact: true }).click();
    await page.locator('.record-dialog').waitFor();
    await page.keyboard.press('Escape');
  });
  await check('Property section selector and search retain workflows', async () => {
    await go('properties');
    await page.getByRole('textbox', { name: 'Search properties', exact: true }).fill('Garden');
    assert.equal(await page.locator('.property-card').count(), 1);
    await page.getByRole('textbox', { name: 'Search properties', exact: true }).fill('');
    await page
      .getByRole('combobox', { name: 'Property section', exact: true })
      .selectOption('reservations');
    await page.getByRole('heading', { name: 'Reservations', exact: true }).waitFor();
  });
  await check('Inbox open, return and browser history', async () => {
    await go('inbox');
    await page.getByRole('link', { name: /Preparing for our next arrival/ }).click();
    await page.locator('.nxops-conversation').waitFor({ state: 'visible' });
    await page.getByRole('link', { name: 'Conversations', exact: true }).click();
    await page.locator('.nxops-thread-list').waitFor({ state: 'visible' });
    await page.goBack();
    await page.locator('.nxops-conversation').waitFor({ state: 'visible' });
    await page.goForward();
    await page.locator('.nxops-thread-list').waitFor({ state: 'visible' });
  });
  await check('Reports show full phone performance cards', async () => {
    await go('reports');
    assert.ok((await page.locator('.mg-performance-card').count()) > 0);
    await page.locator('.mg-performance-card').first().scrollIntoViewIfNeeded();
    await noOverflow();
  });
  await check('Settings fields stack and Save is reachable', async () => {
    await go('settings');
    assert.equal(
      await page
        .locator('.mg-form-grid')
        .first()
        .evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length),
      1,
    );
    const save = page.getByRole('button', { name: /Save/ }).first();
    await save.scrollIntoViewIfNeeded();
    assert.ok(await save.isVisible());
  });
  await check('Empty finance is honest', async () => {
    await go('finances');
    assert.ok((await page.locator('.mg-chart-empty').count()) > 0);
  });
  await check('Finance dates honor period and single-day records', async () => {
    snapshot.data.payments = [
      {
        id: 'payment-a',
        stayId: stay.id,
        amountMinor: 150000,
        type: 'Receipt',
        status: 'Recorded',
        date: today,
        reference: 'LOCAL-TEST',
      },
    ];
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('.page-content').waitFor();
    await page.locator('.mg-chart svg').first().waitFor();
    const chart = page.locator('.mg-chart svg').first();
    assert.deepEqual(
      (await chart.getAttribute('aria-label')).split('; ').map((bucket) => bucket.split(':')[0]),
      ['11 Oct', '19 Oct', '26 Oct', '3 Nov'],
    );
    await page.getByRole('combobox', { name: 'Report period', exact: true }).selectOption('7');
    assert.deepEqual(
      (await chart.getAttribute('aria-label')).split('; ').map((bucket) => bucket.split(':')[0]),
      ['3 Nov', '5 Nov', '7 Nov', '9 Nov'],
    );
    await page.getByRole('combobox', { name: 'Report period', exact: true }).selectOption('all');
    assert.ok((await chart.getAttribute('aria-label')).startsWith('9 Nov:'));
    assert.equal(
      (await chart.locator('text').allTextContents()).filter((t) => t.includes('Nov')).length,
      1,
    );
    snapshot.data.payments = [];
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('.page-content').waitFor();
    await page.locator('.mg-chart-empty').first().waitFor();
  });
  await check('Long names and larger text remain usable', async () => {
    property.name = 'Demo Stays Kilimani Apartment Collection With A Very Long Property Name';
    snapshot.actor.name = 'Alexandria Montgomery';
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('.page-content').waitFor();
    await go('properties');
    await noOverflow();
    await page.locator('html').evaluate((e) => e.style.setProperty('font-size', '20px'));
    await noOverflow();
    await page.locator('html').evaluate((e) => e.style.removeProperty('font-size'));
    property.name = 'Demo Stays Kilimani';
    snapshot.actor.name = 'Demo Host';
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('.page-content').waitFor();
  });
  await page.setViewportSize({ width: 390, height: 520 });
  for (const section of ['calendar', 'inbox/new', 'settings'])
    await check(`Short phone ${section}`, async () => {
      await go(section);
      await noOverflow();
    });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const section of [
    'overview',
    'properties',
    'calendar',
    'inbox',
    'operations',
    'finances',
    'reports',
    'settings',
  ]) {
    await go(section);
    await page.screenshot({ path: path.join(output, `mobile-${section}.png`) });
    const content = page.locator('.page-content');
    if (await content.evaluate((e) => e.scrollHeight > e.clientHeight + 20)) {
      await content.evaluate((e) => (e.scrollTop = e.scrollHeight));
      await page.screenshot({ path: path.join(output, `mobile-${section}-lower.png`) });
    }
  }
  await go('calendar');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.screenshot({ path: path.join(output, 'mobile-menu.png') });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const section of ['overview', 'calendar', 'reports', 'settings']) {
    await go(section);
    await page.screenshot({ path: path.join(output, `desktop-${section}.png`) });
  }
  await check('Desktop calendar retains week grid', async () => {
    await go('calendar');
    assert.equal(
      await page.getByRole('tab', { name: 'Week', exact: true }).getAttribute('aria-selected'),
      'true',
    );
  });
  await check('No uncaught browser errors', async () => assert.deepEqual(errors, []));
  await fs.writeFile(
    path.join(output, 'results.json'),
    JSON.stringify({ passed: results.length, failures, errors, results }, null, 2),
  );
  console.log(JSON.stringify({ passed: results.length, failures, output }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
