import { buildReadOnlyServer } from '../server/buildServer.js';
import { PlatformDiscoveryProvider } from '../adapters/platform/serverDiscoveryProvider.js';
import { fileURLToPath } from 'node:url';

/** Internal benchmark process/IPC only. No new public application endpoint. */
const root = fileURLToPath(new URL('../../../../', import.meta.url));
let sourceCalls = 0; const sourceMethods = new Set<string>();
const provider = new PlatformDiscoveryProvider({ origin: 'http://127.0.0.1:3001', fetcher: async (url, init) => {
  sourceCalls++; sourceMethods.add(init.method); return fetch(url, init);
} });
const server = await buildReadOnlyServer({ workspaceRoot: root, provider, config: { host: '127.0.0.1', port: 5190 } });
const origin = await server.app.listen({ host: '127.0.0.1', port: 0 });
let peakRss = process.memoryUsage().rss; const startedCpu = process.cpuUsage();
const sample = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 20); sample.unref();
let closing = false;
const snapshot = () => ({ peakRssBytes: peakRss, cpuMicroseconds: process.cpuUsage(startedCpu), sourceCalls, sourceMethods: [...sourceMethods],
  telemetry: server.telemetryStats(), service: server.stats() });
async function close() { if (closing) return; closing = true; clearInterval(sample); await server.app.close(); process.send?.({ kind: 'closed', snapshot: snapshot() }); process.disconnect?.(); }
process.on('message', message => {
  if (message === 'snapshot') process.send?.({ kind: 'snapshot', snapshot: snapshot() });
  if (message === 'close') void close();
});
process.once('SIGTERM', () => { void close(); });
process.once('disconnect', () => { void close(); });
process.send?.({ kind: 'ready', origin, releaseId: server.release.releaseId });
