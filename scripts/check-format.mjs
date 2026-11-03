import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const formatExtensions = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|css|yml|yaml)$/i;
const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).split('\0').filter(Boolean);

const baseRef = process.env.FORMAT_BASE_REF?.trim();
let changedFiles;
if (baseRef) {
  if (/^0+$/.test(baseRef)) {
    throw new Error('FORMAT_BASE_REF must identify a commit to compare.');
  }
  execFileSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', baseRef], {
    stdio: 'inherit',
  });
  changedFiles = git(['diff', '--name-only', '-z', '--diff-filter=ACMR', `${baseRef}...HEAD`]);
} else {
  changedFiles = [
    ...git(['diff', '--name-only', '-z', '--diff-filter=ACMR', 'HEAD']),
    ...git(['ls-files', '--others', '--exclude-standard', '-z']),
  ];
}

const files = [...new Set(changedFiles.filter((file) => formatExtensions.test(file)))];
if (files.length === 0) {
  console.log('No changed files require formatting checks.');
  process.exit(0);
}

const prettier = fileURLToPath(
  new URL('../node_modules/prettier/bin/prettier.cjs', import.meta.url),
);
const result = spawnSync(process.execPath, [prettier, '--check', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
