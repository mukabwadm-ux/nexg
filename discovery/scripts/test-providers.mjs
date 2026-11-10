import { build } from 'esbuild';
import { mkdir, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

await mkdir('.test-dist/providers', { recursive: true });
const files = (await readdir('test')).filter(file => /\.test\.tsx?$/.test(file));
if (!files.length) throw new Error('No provider behavior tests');
await build({ entryPoints: files.map(file => `test/${file}`), outdir: '.test-dist/providers', outExtension: { '.js': '.mjs' },
  platform: 'node', target: 'node24', format: 'esm', bundle: true, packages: 'external', jsx: 'automatic', logLevel: 'warning' });
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files.map(file => `.test-dist/providers/${file.replace(/\.tsx?$/, '.mjs')}`)], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
