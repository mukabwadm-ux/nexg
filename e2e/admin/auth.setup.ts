import { expect, test as setup } from '@playwright/test';

import { ADMIN_STATE } from '../auth-state';

/**
 * Signs in once; every admin spec reuses the session.
 *
 * The admin middleware guards everything except `/sign-in`, so
 * the ui-kit spec had been redirecting to a login page and
 * failing on a heading that was never going to render. It did
 * not look like a stale test because the whole e2e suite could
 * not launch a browser at all, so nobody saw the seven
 * assertions behind the redirect.
 *
 * The credentials are the ones `supabase/seed.sql` creates on a
 * local database. They are already in the repository, they are
 * only ever valid against a local Supabase, and that seed must
 * never be run against the hosted project. Override them with
 * E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD when pointing this suite
 * at anything that is not localhost.
 */
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'dev.admin@nexgapp.com';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'devpassword';

setup('authenticate as staff', async ({ page }) => {
  await page.goto('/sign-in');
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');

  /* Landing anywhere that is not /sign-in is the signal. Which
     board staff land on depends on the roles they hold, so
     asserting a particular one would break the first time
     somebody changes a seed. */
  await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 30_000 });

  await page.context().storageState({ path: ADMIN_STATE });
});
