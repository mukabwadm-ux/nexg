/**
 * Starts the catalog bridge (plan step E1): the demo API's three reads, served from Supabase.
 *
 * Settings, from the environment or discovery-engine/.env.local (git-ignored):
 *   SUPABASE_URL           default http://127.0.0.1:54321, the local Supabase
 *   SUPABASE_ANON_KEY      the project's public anon or publishable key; never the service-role key
 *   DISCOVERY_BRIDGE_PORT  default 3002
 *   DISCOVERY_BRIDGE_HOST  127.0.0.1 (default) or 0.0.0.0 to let a phone on the same Wi-Fi reach it
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { CatalogBridge, SupabaseCatalogReader, demoMediaFromSnapshot, portalMapRows } from '../adapters/supabase/catalogBridge.js';
import { buildBridgeServer } from './server.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const host = process.env.DISCOVERY_BRIDGE_HOST ?? '127.0.0.1';
if (host !== '127.0.0.1' && host !== '0.0.0.0') throw new Error('DISCOVERY_BRIDGE_HOST must be 127.0.0.1 or 0.0.0.0');
const port = Number(process.env.DISCOVERY_BRIDGE_PORT ?? '3002');
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid DISCOVERY_BRIDGE_PORT');
const reader = new SupabaseCatalogReader(process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321', process.env.SUPABASE_ANON_KEY ?? '');
// The reviewed map plus the merchant portal's own spellings of ten subcategory keys.
const map = portalMapRows(JSON.parse(await readFile(join(root, 'demo-seed/subcategory-map.json'), 'utf8')));
const media = demoMediaFromSnapshot(JSON.parse(await readFile(join(root, 'demo-seed/source/demo-api-snapshot.json'), 'utf8')));
const bridge = new CatalogBridge(map, media);
const { app, refresh } = buildBridgeServer({ bridge, load: () => reader.load() });
await refresh();
await app.listen({ host, port });
console.log(JSON.stringify({ event: 'catalog_bridge_started', host, port, loaded: bridge.loadedAt !== undefined, ...bridge.size }));
let closing = false;
async function close() { if (closing) return; closing = true; await app.close(); }
process.once('SIGINT', () => { void close().catch(() => { process.exitCode = 1; }); });
process.once('SIGTERM', () => { void close().catch(() => { process.exitCode = 1; }); });
