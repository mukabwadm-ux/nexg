import { expect, test } from '@playwright/test';

/**
 * Every portal board keeps its frame.
 *
 * This exists because seven merchant boards and five rider
 * boards shipped with no sidebar at all — bare content on a
 * blank page, no navigation, no way to sign out. Each one
 * returned HTTP 200. Nothing failed, nothing was logged, and
 * the only way anybody found out was by opening them.
 *
 * The cause was a frame that each page had to remember to
 * render; the fix moved it into the layout. This is the part
 * that stops it coming back, because the next portal will be
 * built the same way and the same thing will be forgotten.
 *
 * It asserts the three things whose absence made those pages
 * useless rather than merely ugly: navigation, a way out, and
 * content that reaches the width of the frame.
 *
 * Credentials are the ones `supabase/seed.sql` creates locally
 * and are only valid against a local Supabase. Override with
 * E2E_*_EMAIL / E2E_PARTNER_PASSWORD elsewhere.
 */
const PASSWORD = process.env.E2E_PARTNER_PASSWORD ?? 'devpassword';

interface Portal {
  name: string;
  email: string;
  boards: string[];
}

const PORTALS: Portal[] = [
  {
    name: 'merchant',
    email: process.env.E2E_MERCHANT_EMAIL ?? 'merchant.live@nexgapp.com',
    boards: [
      '/merchant',
      '/merchant/orders',
      '/merchant/menu',
      '/merchant/hours',
      '/merchant/stores',
      '/merchant/money',
      '/merchant/analytics',
      '/merchant/featured',
      '/merchant/messages',
      '/merchant/disputes',
      '/merchant/reviews',
      '/merchant/team',
      '/merchant/documents',
      '/merchant/settings',
      '/merchant/support',
    ],
  },
  {
    name: 'rider',
    email: process.env.E2E_RIDER_EMAIL ?? 'rider.active@nexgapp.com',
    boards: [
      '/rider',
      '/rider/jobs',
      '/rider/earnings',
      '/rider/shifts',
      '/rider/cash',
      '/rider/documents',
      '/rider/messages',
      '/rider/health',
      '/rider/incidents',
      '/rider/profile',
      '/rider/refer',
      '/rider/support',
    ],
  },
  {
    name: 'host',
    email: process.env.E2E_HOST_EMAIL ?? 'host.live@nexgapp.com',
    boards: [
      '/host',
      '/host/bookings',
      '/host/properties',
      '/host/units',
      '/host/qr',
      '/host/requests',
      '/host/packages',
      '/host/deliveries',
      '/host/operations',
      '/host/analytics',
      '/host/earnings',
      '/host/messages',
      '/host/refer',
      '/host/team',
      '/host/settings',
      '/host/support',
      '/host/privacy',
    ],
  },
];

for (const portal of PORTALS) {
  test.describe(`${portal.name} portal keeps its chrome`, () => {
    test.beforeEach(async ({ page }) => {
      /* The location sheet is a full-screen modal on a first
         visit and will swallow the sign-in click. */
      await page.addInitScript(() => {
        try {
          sessionStorage.setItem('nexg.loc.asked', '1');
        } catch {
          /* private window: the sheet is the least of it */
        }
      });
      await page.goto('/sign-in');
      await page.fill('#email', portal.email);
      await page.fill('#password', PASSWORD);
      await page.click('button[type="submit"]');
      await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 30_000 });
    });

    for (const path of portal.boards) {
      test(`${path} has navigation, a way out, and content`, async ({ page }) => {
        await page.goto(path);

        /* Still on the board. A redirect to the homepage is how
           a missing membership looks, and it would make every
           other assertion here pass against the wrong page. */
        await expect(page).toHaveURL(new RegExp(`${path}(\\?|$)`));

        await expect(
          page.locator('nav[aria-label]').first(),
          `${path} rendered without navigation — this is the bare-page bug.`,
        ).toBeAttached();

        /* A way out. The merchant and rider portals put it
           behind an account menu; the host hero shows it
           directly. Either is fine; neither is not. */
        const accountMenu = page.locator('button[aria-haspopup="menu"]');
        const directSignOut = page.getByRole('button', { name: /sign out/i });
        const ways = (await accountMenu.count()) + (await directSignOut.count());
        expect(ways, `${path} offers no way to sign out.`).toBeGreaterThan(0);

        /* And something on it. A framed page with an empty main
           is the same dead end wearing a sidebar. */
        const chars = await page.evaluate(
          () => (document.querySelector('main')?.innerText ?? '').trim().length,
        );
        expect(chars, `${path} rendered a frame around nothing.`).toBeGreaterThan(200);
      });
    }
  });
}
