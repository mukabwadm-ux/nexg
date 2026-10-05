import { expect, test } from '@playwright/test';

/**
 * The consent rule, proven rather than asserted.
 *
 * One sentence of the spec is load-bearing for the whole
 * feature: the browser's geolocation API is called **only**
 * inside the click handler of "Use my current location". Never
 * on load, never on a route change, never on scroll, never on a
 * timer, never because a modal opened.
 *
 * It is not a privacy nicety. Chrome degrades and then
 * auto-blocks geolocation prompts that arrive without a user
 * gesture, and a Block is close to permanent — most people never
 * find the padlock menu. Getting this wrong once costs the
 * ability to ask at all, for everybody, from then on.
 *
 * A code review cannot keep that true, because the natural thing
 * to write when a page needs a location is to ask for one. So a
 * spy goes in before any script runs, every public route is
 * loaded, and the build fails if anything touched the API.
 */

const PUBLIC_ROUTES = [
  '/',
  '/explore',
  '/help',
  '/careers',
  '/merchants',
  '/riders',
  '/hosts',
  '/stays',
  '/experience',
  '/legal/privacy',
  '/sign-in',
];

/**
 * Installed with `addInitScript`, so it is in place before any
 * application code runs on the page — including anything that
 * might fire during hydration.
 */
const SPY = `
  window.__geoCalls = [];
  if (navigator.geolocation) {
    const real = navigator.geolocation;
    const record = (kind) => (...args) => {
      window.__geoCalls.push({ kind, stack: new Error().stack });
      return kind === 'watchPosition' ? 0 : undefined;
    };
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      get: () => ({
        getCurrentPosition: record('getCurrentPosition'),
        watchPosition: record('watchPosition'),
        clearWatch: () => {},
      }),
    });
  }
`;

test.describe('location is never read without a gesture', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} does not ask for location on load`, async ({ page }) => {
      await page.addInitScript(SPY);
      await page.goto(route);
      /* Long enough to cover hydration, the sheet's own delay,
         and any effect that runs a beat late. A timer-triggered
         prompt is exactly the bug this is looking for. */
      await page.waitForTimeout(3000);

      const calls = await page.evaluate(
        () => (window as unknown as { __geoCalls: { kind: string }[] }).__geoCalls,
      );
      expect(
        calls,
        `${route} touched navigator.geolocation with no user gesture. ` +
          'That is the one thing the location layer must never do: browsers punish it permanently.',
      ).toEqual([]);
    });
  }

  test('scrolling and navigating do not ask either', async ({ page }) => {
    await page.addInitScript(SPY);
    await page.goto('/');
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(500);
    await page.goto('/explore');
    await page.waitForTimeout(1500);

    const calls = await page.evaluate(
      () => (window as unknown as { __geoCalls: { kind: string }[] }).__geoCalls,
    );
    expect(calls).toEqual([]);
  });

  test('opening the sheet does not ask — only the button does', async ({ page }) => {
    await page.addInitScript(SPY);
    await page.goto('/');
    await page.waitForTimeout(3000);

    /* The sheet opens by itself on a first visit. That must not
       be enough to prompt: the visitor has to press the button
       having read what it does. */
    const sheet = page.getByRole('dialog', { name: /where should we deliver/i });
    if (await sheet.isVisible().catch(() => false)) {
      const before = await page.evaluate(
        () => (window as unknown as { __geoCalls: unknown[] }).__geoCalls.length,
      );
      expect(before).toBe(0);

      await page.getByRole('button', { name: /use my current location/i }).first().click();
      await page.waitForTimeout(500);

      const after = await page.evaluate(
        () => (window as unknown as { __geoCalls: { kind: string }[] }).__geoCalls,
      );
      /* And now exactly one read, of a position, not a watch. */
      expect(after).toHaveLength(1);
      expect(after[0]!.kind).toBe('getCurrentPosition');
    }
  });

  test('nothing anywhere starts a watchPosition', async ({ page }) => {
    await page.addInitScript(SPY);
    await page.goto('/explore');
    await page.waitForTimeout(2000);

    const watches = await page.evaluate(() =>
      (window as unknown as { __geoCalls: { kind: string }[] }).__geoCalls.filter(
        (c) => c.kind === 'watchPosition',
      ),
    );
    /* A watch is a location history. Nothing on a public page
       needs one — the guest is choosing a delivery address, not
       being followed. */
    expect(watches).toEqual([]);
  });
});

test.describe('the chip is on every public page', () => {
  for (const route of PUBLIC_ROUTES.filter((r) => r !== '/sign-in')) {
    test(`${route} renders the Deliver to chip`, async ({ page }) => {
      await page.goto(route);
      await page.waitForTimeout(1500);
      /* Two in the DOM — one for wide screens, one for phones —
         and at least one visible at any viewport. */
      const chips = page.getByRole('button', { name: /deliver to/i });
      expect(await chips.count()).toBeGreaterThan(0);
    });
  }
});
