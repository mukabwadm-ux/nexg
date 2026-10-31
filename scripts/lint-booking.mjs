import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const web = resolve(root, 'apps/web');
const configuration = resolve(root, 'packages/config');
const webRequire = createRequire(resolve(web, 'package.json'));
const configurationRequire = createRequire(resolve(configuration, 'package.json'));
const { ESLint } = webRequire('eslint');
const appRules = webRequire('./.eslintrc.cjs');

// Shared configurations own their plugins; Next owns its framework preset.
// Resolve both explicitly under pnpm without changing or disabling app rules.
const eslint = new ESLint({
  cwd: web,
  useEslintrc: false,
  resolvePluginsRelativeTo: configuration,
  baseConfig: {
    ...appRules,
    parser: configurationRequire.resolve('@typescript-eslint/parser'),
    extends: appRules.extends.map((preset) =>
      preset === 'prettier'
        ? configurationRequire.resolve('eslint-config-prettier')
        : preset === 'next/core-web-vitals'
          ? webRequire.resolve('eslint-config-next/core-web-vitals')
          : preset,
    ),
  },
});
const results = await eslint.lintFiles([
  'components/merchant/booking/**/*.{ts,tsx}',
  'lib/booking/**/*.ts',
  'components/location/provider.tsx',
  'components/location/chrome.tsx',
  'components/consent/personalized-chrome.tsx',
  '../../packages/location/src/store.tsx',
  'app/merchant/calendar/**/*.tsx',
  'app/book/**/*.tsx',
  'app/booking-workspace/**/*.tsx',
  'app/api/booking-workspace/**/*.ts',
  'app/api/merchant/booking/**/*.ts',
  'app/api/public/booking/**/*.ts',
]);
const formatter = await eslint.loadFormatter('stylish');
const report = formatter.format(results);
if (report) console.log(report);
const errors = results.reduce((count, result) => count + result.errorCount, 0);
const warnings = results.reduce((count, result) => count + result.warningCount, 0);
console.log(`Booking lint: ${results.length} files, ${errors} errors, ${warnings} warnings.`);
await mkdir(resolve(root, '.booking-local'), { recursive: true });
await writeFile(
  resolve(root, '.booking-local/lint-verification.json'),
  JSON.stringify(
    { completedAt: new Date().toISOString(), files: results.length, errors, warnings },
    null,
    2,
  ),
);
if (errors || warnings) process.exitCode = 1;
