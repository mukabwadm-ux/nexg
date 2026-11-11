import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BaselineReleaseReader, exportRelease } from './releases/baselineReleaseReader.js';

const workspace = fileURLToPath(new URL('../../../', import.meta.url));
const release = await new BaselineReleaseReader(workspace).resolvePublishedRelease();
const outputIndex = process.argv.indexOf('--output');
if (outputIndex !== -1) {
  const output = process.argv[outputIndex + 1];
  if (!output) throw new Error('--output requires a directory');
  await exportRelease(release, resolve(output));
}
console.log(JSON.stringify({ releaseId: release.releaseId, counts: release.declaredCounts, checksum: release.checksum,
  assets: release.assets.length, sourceFiles: release.sourceFiles.length, operationalCapabilities: false }, null, 2));
