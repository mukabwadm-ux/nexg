import { buildReadOnlyServer } from './buildServer.js';
import { readServerConfig } from './config.js';

const config = readServerConfig();
const { app, sourceStatus } = await buildReadOnlyServer({ config });
await app.listen({ host: config.host, port: config.port });
const source = config.supabase ? 'supabase' : config.sourceOrigin ? 'platform' : 'none';
// Counts and the last read error only: never catalog rows, URLs with credentials or keys.
console.log(JSON.stringify({ event: 'discovery_read_service_started', host: config.host, port: config.port, sourceConfigured: source !== 'none', source,
  ...(sourceStatus() ? { catalog: sourceStatus() } : {}) }));
let closing = false;
async function close() { if (closing) return; closing = true; await app.close(); }
process.once('SIGINT', () => { void close().catch(() => { process.exitCode = 1; }); });
process.once('SIGTERM', () => { void close().catch(() => { process.exitCode = 1; }); });
