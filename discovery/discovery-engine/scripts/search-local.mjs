import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = new URL('../artifacts/local/', import.meta.url);
const secret = new URL('typesense.key', directory);
await mkdir(directory, { recursive: true });
try { await writeFile(secret, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
catch (error) { if (error.code !== 'EEXIST') throw error; }
const key = (await readFile(secret, 'utf8')).trim();
if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid local search secret');
const action = process.argv[2];
if (!['up', 'down', 'status'].includes(action)) throw new Error('Use up, down or status');
const args = action === 'up' ? ['up', '-d'] : action === 'down' ? ['down'] : ['ps'];
const child = spawn('docker', ['compose', '-f', 'compose.search.yaml', ...args], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true, stdio: 'inherit', env: { ...process.env, DISCOVERY_SEARCH_API_KEY: key },
});
child.once('error', () => { console.error('Docker could not start'); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
