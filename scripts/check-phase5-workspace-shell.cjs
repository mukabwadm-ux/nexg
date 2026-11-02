/* Actual shared frame/mobile drawer with an in-memory Next router fixture. No service is started. */
const { chromium, expect } = require('@playwright/test');
const { createRequire } = require('node:module');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/merchant-portal-plan/onboarding-integration/implementation');
const fromVite = createRequire(
  require.resolve('vite/package.json', { paths: [path.join(root, 'merchant-onboarding')] }),
);
const { build } = fromVite('esbuild');
const requested = new Set((process.env.PHASE5_SHELL_CASES || '').split(',').filter(Boolean));

const fixture = `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MerchantWorkspaceShell} from './components/merchant/workspace/merchant-workspace-shell';
window.fixturePath = '/merchant';
function Fixture() {
  const [approved,setApproved] = useState(false);
  const [,setVersion] = useState(0);
  window.fixtureApprove = () => setApproved(true);
  window.fixtureReset = () => { window.fixturePath='/merchant';setApproved(false);setVersion(n=>n+1); };
  window.fixtureNavigate = href => { window.fixturePath=href;setVersion(n=>n+1); };
  return <MerchantWorkspaceShell businessName="Acacia Kitchen" accountInitials="AK"
    approvalLabel={approved?'Workspace approved':'Waiting for admin approval'}
    setupDestinations={['/merchant/menu','/merchant/stores','/merchant/hours','/merchant/documents']}
    nav={[
      {label:'Home',href:'/merchant'},
      {label:'Work',href:'/merchant/orders',locked:!approved},
      {label:'Offerings',href:'/merchant/menu',locked:!approved},
      {label:'Availability',href:'/merchant/hours',locked:!approved},
      {label:'Business',href:'/merchant/stores',locked:!approved},
      {label:'Money',href:'/merchant/money',locked:!approved},
      {label:'Promotions',href:'/merchant/featured',locked:!approved},
      {label:'Insights',href:'/merchant/analytics',locked:!approved},
      {label:'Settings',href:'/merchant/settings',locked:!approved},
    ]} headerEnd={<button>Account</button>}>
    <main style={{padding:24}} data-testid="saved-home"><h1>{window.fixturePath==='/merchant/menu'?'Saved offering editor':'Saved Home'}</h1><p>Committed setup facts appear here.</p></main>
  </MerchantWorkspaceShell>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;

async function main() {
  await fs.mkdir(output, { recursive: true });
  const compiled = await build({
    stdin: { contents: fixture, resolveDir: path.join(root, 'apps/web'), loader: 'tsx' },
    bundle: true,
    write: false,
    outdir: 'phase5-shell-fixture',
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    loader: { '.css': 'local-css' },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'next-router-fixture',
        setup(builder) {
          builder.onResolve({ filter: /^next\/(link|navigation)$/ }, (args) => ({
            path: args.path,
            namespace: 'next-fixture',
          }));
          builder.onLoad({ filter: /.*/, namespace: 'next-fixture' }, (args) => ({
            loader: 'jsx',
            resolveDir: path.join(root, 'apps/web'),
            contents:
              args.path === 'next/link'
                ? `import React from 'react';export default function Link({href,prefetch,children,onClick,...props}) {return <a {...props} href={href} data-prefetch={String(prefetch)} onClick={event=>{event.preventDefault();onClick?.(event);window.fixtureNavigate(href)}}>{children}</a>}`
                : `export function usePathname(){return window.fixturePath;}`,
          }));
        },
      },
    ],
  });
  const javascript = compiled.outputFiles.find((file) => file.path.endsWith('.js')).text;
  const css = compiled.outputFiles.find((file) => file.path.endsWith('.css')).text;
  const font = await fs.readFile(
    path.join(root, 'apps/web/public/fonts/manrope/v1/manrope-latin.woff2'),
    'base64',
  );
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    reducedMotion: 'reduce',
  });
  const errors = [],
    requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  let previous;
  try {
    previous = JSON.parse(
      await fs.readFile(path.join(output, 'phase-5-shell-browser-verification.json'), 'utf8'),
    );
  } catch {}
  const cases = requested.size ? (previous?.cases ?? []) : [];
  let checked = 0;
  async function check(id, run) {
    if (requested.size && !requested.has(id)) return;
    await run();
    expect(errors).toEqual([]);
    const result = { id, status: 'passed', checkedAt: new Date().toISOString() };
    const index = cases.findIndex((item) => item.id === id);
    if (index < 0) cases.push(result);
    else cases[index] = result;
    checked += 1;
  }
  try {
    await page.setContent(
      `<html><head><style>@font-face{font-family:Manrope;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:200 800}:root{--font-manrope:Manrope}*{box-sizing:border-box}body{margin:0}${css}</style></head><body><div id="root"></div></body></html>`,
    );
    await page.addScriptTag({ content: javascript });
    await expect(page.getByRole('heading', { name: 'Saved Home' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await check('pending-nav-shows-generic-lock-without-child-records-or-requests', async () => {
      await page.getByRole('button', { name: 'Work, approval required' }).click();
      await expect(page.getByRole('heading', { name: 'Waiting for admin approval' })).toBeVisible();
      await expect(page.getByTestId('saved-home')).toHaveCount(0);
      await expect(page.locator('a[href="/merchant/orders"]')).toHaveCount(0);
      await expect(page.locator('a[href^="/merchant-live-preview"]')).toHaveCount(0);
      expect(requests).toEqual([]);
      await page.screenshot({ path: path.join(output, 'phase-5-shell-pending-desktop.png') });
      await page.getByRole('link', { name: 'Back to Home' }).click();
      await expect(page.getByRole('heading', { name: 'Saved Home' })).toBeVisible();
    });
    await check('pending-setup-route-renders-editor-with-nav-still-locked', async () => {
      await page.evaluate(() => window.fixtureNavigate('/merchant/menu'));
      await expect(page.getByRole('heading', { name: 'Saved offering editor' })).toBeVisible();
      await expect(page.locator('a[href="/merchant/menu"]')).toHaveCount(0);
      await page.getByRole('button', { name: 'Offerings, approval required' }).click();
      await expect(page.getByRole('heading', { name: 'Waiting for admin approval' })).toBeVisible();
      await expect(page.getByTestId('saved-home')).toHaveCount(0);
      await page.getByRole('link', { name: 'Back to Home' }).click();
      await expect(page.getByRole('heading', { name: 'Saved Home' })).toBeVisible();
      for (const href of ['/merchant/menu/nested', '/merchant/orders']) {
        await page.evaluate((href) => window.fixtureNavigate(href), href);
        await expect(
          page.getByRole('heading', { name: 'Waiting for admin approval' }),
        ).toBeVisible();
        await expect(page.getByTestId('saved-home')).toHaveCount(0);
      }
      await page.evaluate(() => window.fixtureNavigate('/merchant/menu'));
      await expect(page.getByRole('heading', { name: 'Saved offering editor' })).toBeVisible();
      expect(requests).toEqual([]);
      await page.screenshot({ path: path.join(output, 'phase-5-shell-pending-setup-editor.png') });
      await page.evaluate(() => window.fixtureNavigate('/merchant'));
      await expect(page.getByRole('heading', { name: 'Saved Home' })).toBeVisible();
    });
    await check('approved-nav-uses-actual-routes-without-activation-controls', async () => {
      await page.evaluate(() => window.fixtureApprove());
      await expect(page.getByRole('link', { name: 'Work', exact: true })).toHaveAttribute(
        'href',
        '/merchant/orders',
      );
      await expect(page.getByRole('link', { name: 'Work', exact: true })).toHaveAttribute(
        'data-prefetch',
        'false',
      );
      await expect(page.getByText('Workspace approved', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /Go live|Accepting work/ })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Saved Home' })).toBeVisible();
    });
    await check('mobile-locked-selection-closes-drawer-and-home-restores-setup', async () => {
      await page.evaluate(() => window.fixtureReset());
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'Open workspace navigation' }).click();
      const drawer = page.getByRole('dialog', { name: 'Merchant workspace' });
      await drawer.getByRole('button', { name: 'Offerings, approval required' }).click();
      await expect(drawer).toBeHidden();
      await expect(page.getByRole('heading', { name: 'Waiting for admin approval' })).toBeVisible();
      await expect(page.getByTestId('saved-home')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
      expect(requests).toEqual([]);
      await page.screenshot({ path: path.join(output, 'phase-5-shell-pending-mobile.png') });
      await page.getByRole('link', { name: 'Back to Home' }).click();
      await expect(page.getByRole('heading', { name: 'Saved Home' })).toBeVisible();
    });
    const report = {
      checkedAt: new Date().toISOString(),
      boundary:
        'Actual WorkspaceFrame, managed shell and Radix mobile drawer; in-memory Next pathname/link and fixed setup fixture. No Auth, backend, live records or whole service startup.',
      cases,
      checkedThisRun: checked,
      runtimeErrors: errors,
      requests,
    };
    await fs.writeFile(
      path.join(output, 'phase-5-shell-browser-verification.json'),
      JSON.stringify(report, null, 2),
    );
    process.stdout.write(
      `PASS: ${checked} changed-shell browser cases, no page errors or network requests.\n`,
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  process.stderr.write(String(error) + '\n');
  process.exitCode = 1;
});
