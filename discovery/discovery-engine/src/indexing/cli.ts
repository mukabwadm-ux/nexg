import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { TypesenseIndexAdapter } from '../adapters/typesense/indexAdapter.js';
import { TypesenseCandidateReader } from '../adapters/typesense/candidateReader.js';
import { PlatformDiscoveryProvider } from '../adapters/platform/serverDiscoveryProvider.js';
import { PlatformCatalogPreviewSource } from '../adapters/platform/catalogPreviewSource.js';
import { BaselineReleaseReader } from '../releases/baselineReleaseReader.js';
import { CatalogIndexCoordinator } from './coordinator.js';
import { FileWriterLock } from './writerLock.js';
import { IndexingError, parseIndexInput, requireIndex, type IndexPurpose } from './contracts.js';

const engineRoot = new URL('../../../', import.meta.url);
const workspace = fileURLToPath(new URL('../', engineRoot));
const [command, first, second, third, fourth] = process.argv.slice(2);
try {
  const key = process.env.DISCOVERY_SEARCH_API_KEY ?? (await readFile(new URL('artifacts/local/typesense.key', engineRoot), 'utf8')).trim();
  const index = new TypesenseIndexAdapter({ origin: process.env.DISCOVERY_SEARCH_ORIGIN ?? 'http://127.0.0.1:8108', apiKey: key });
  const release = await new BaselineReleaseReader(workspace).resolvePublishedRelease();
  const coordinator = new CatalogIndexCoordinator(index, new FileWriterLock(fileURLToPath(new URL('artifacts/local/', engineRoot))), release);
  const purpose = (value: string | undefined): IndexPurpose => { requireIndex(['preview', 'serving', 'evaluation'].includes(value!), 'PURPOSE_REQUIRED'); return value as IndexPurpose; };
  let result: unknown;
  if (command === 'health') result = { ok: await index.health() };
  else if (command === 'preview') {
    requireIndex(first && process.env.DISCOVERY_SOURCE_API_ORIGIN, 'SOURCE_ORIGIN_AND_CATEGORY_REQUIRED');
    result = await coordinator.build(new PlatformCatalogPreviewSource(new PlatformDiscoveryProvider({ origin: process.env.DISCOVERY_SOURCE_API_ORIGIN }), release, first), 'preview');
  } else if (command === 'build') {
    requireIndex(first && (await stat(first)).size <= 32 * 1024 * 1024, 'INVALID_EXPORT_FILE');
    const input = parseIndexInput(JSON.parse(await readFile(first, 'utf8')));
    result = await coordinator.build({ read: async () => input }, purpose(second));
  } else if (command === 'inspect') {
    requireIndex(first, 'GENERATION_REQUIRED'); result = await index.inspect(first, AbortSignal.timeout(5000));
  } else if (command === 'lookup') {
    requireIndex(first && second && third, 'GENERATION_SELECTION_QUERY_REQUIRED');
    result = await new TypesenseCandidateReader(index, release).search(first, { query: third, selectionId: second, mode: 'merchant', limit: 24 }, purpose(fourth));
  } else if (command === 'rollback') {
    const target = purpose(second); requireIndex(first && target !== 'preview', 'INVALID_ROLLBACK'); result = await coordinator.rollback(first, target);
  } else throw new IndexingError('Use health, preview, build, inspect, lookup or rollback');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({ code: error instanceof IndexingError ? error.code : 'INDEX_OPERATION_FAILED', applied: 'unknown_or_none' }));
  process.exitCode = 1;
}
