import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { ContractError } from '../src/contracts/index.js';
import { BaselineReleaseReader, exportRelease } from '../src/releases/baselineReleaseReader.js';
import { resolveSelection, sealRelease, validateReleaseArtifact, safeRelativePath, type ReleaseParts } from '../src/releases/artifact.js';
import { release, releaseWithUnmappedSubcategory, workspace } from './helpers.js';

test('B00 imports approved identities, dynamic counts and separate L1 order', () => {
  assert.deepEqual(release.declaredCounts, { categories: 18, subcategories: 115, options: 37 });
  assert.deepEqual(release.nodes.filter(node => node.kind === 'category').slice(0, 2).map(node => node.id), ['adults-only', 'airport-transfers']);
  assert.equal(release.placements.find(placement => placement.surface === 'L1' && placement.order === 1)?.nodeId, 'restaurants-food');
  assert.deepEqual(release.mappings.find(mapping => mapping.nodeId === 'adults-only:tobacco-smoking:cigarettes')?.sourceSubcategoryIds, ['adults-only_cigarettes']);
  assert.equal(release.assets.find(asset => asset.path.includes('03_alcohol_beverages.png'))?.path, 'ICONS/NexG_Discovery_Icons/00_Main_Category_Icons/03_alcohol_beverages.png');
});
test('unmapped branches stay explicit and collections cannot execute prose predicates', () => {
  const unmappedIn = (selected: typeof release) => selected.nodes.filter(node => node.kind === 'subcategory'
    && selected.mappings.find(mapping => mapping.nodeId === node.id)?.status === 'unmapped');
  // Every baseline subcategory is mapped since the owner's 8 Nov 2026 decision, except Flights (owner, 9 Nov 2026), which
  // waits for a flights category in Derrick NexG. An isolated copy keeps one more unmapped.
  const flights = ['flights:helicopter-charters', 'flights:scenic-flights', 'flights:safari-flights', 'flights:private-charters'];
  assert.deepEqual(unmappedIn(release).map(node => node.id), flights);
  assert.equal(release.mappings.find(mapping => mapping.nodeId === 'flights')?.status, 'unmapped');
  const variant = releaseWithUnmappedSubcategory();
  const unmapped = unmappedIn(variant).filter(node => !flights.includes(node.id));
  assert.deepEqual(unmapped.map(node => node.id), ['beauty-wellness:salon-barber']);
  const node = unmapped[0]!;
  assert.deepEqual(resolveSelection(variant, { categoryId: node.parentId!, subcategoryId: node.id }), { state: 'unmapped', nodeId: node.id });
  assert.equal(release.collections.every(collection => collection.enabled === false && collection.reason === 'PREDICATE_NOT_IMPLEMENTED'), true);
});
test('validated artifacts reject count/hash/compatibility/hierarchy and dangling placement corruption', () => {
  assert.equal(validateReleaseArtifact(release).checksum, release.checksum);
  for (const change of [
    (value: typeof release) => { value.declaredCounts.subcategories = 99; },
    (value: typeof release) => { value.compatibility.engineSchema = '2' as '1'; },
    (value: typeof release) => { value.nodes[0]!.id = value.nodes[1]!.id; },
    (value: typeof release) => { value.nodes.find(node => node.kind === 'subcategory')!.parentId = 'missing'; },
    (value: typeof release) => { value.placements[0]!.nodeId = 'missing'; },
    (value: typeof release) => { value.nodes[0]!.label = 'tampered'; },
    (value: typeof release) => { const categories = value.nodes.filter(node => node.kind === 'category'); categories[1]!.order = categories[0]!.order; },
  ]) assert.throws(() => { const copy = structuredClone(release); change(copy); validateReleaseArtifact(copy); }, ContractError);
});
test('future compatible taxonomy counts are derived while existing IDs and source mappings survive', () => {
  const parts = structuredClone(release) as ReleaseParts;
  parts.nodes.push({ id: 'reviewed-future-node', kind: 'category', label: 'Reviewed future context', lifecycle: 'active', order: 19, assetPath: parts.assets[0]!.path });
  parts.mappings.push({ nodeId: 'reviewed-future-node', sourceCategoryIds: [], sourceSubcategoryIds: [], status: 'unmapped', note: 'Isolated release validation control.' });
  // sealRelease consumes concern payloads, not the metadata of a prior artifact.
  const { nodes, placements, mappings, collections, assets, sourceFiles, policy, fallback, schemaVersion, compatibility } = parts;
  const next = sealRelease({ nodes, placements, mappings, collections, assets, sourceFiles, policy, fallback, schemaVersion, compatibility });
  assert.deepEqual(next.declaredCounts, { categories: 19, subcategories: 115, options: 37 });
  assert.deepEqual(next.mappings[0], release.mappings[0]);
  assert.deepEqual(resolveSelection(next, { categoryId: 'reviewed-future-node' }), { state: 'unmapped', nodeId: 'reviewed-future-node' });
  const incompatible = structuredClone(next);
  const option = incompatible.nodes.find(node => node.kind === 'option')!;
  const mapping = incompatible.mappings.find(entry => entry.nodeId === option.id)!;
  option.id = 'x'.repeat(257); mapping.nodeId = option.id;
  assert.throws(() => sealRelease(incompatible), error => error instanceof ContractError && error.fieldPaths.includes('/nodes/id'));
});
test('resealing a prior artifact recalculates metadata from concern records', () => {
  const next = sealRelease(release);
  assert.equal(next.releaseId, release.releaseId);
  assert.equal(next.checksum, release.checksum);
});
test('release snapshots are deeply immutable and unknown release IDs are rejected', async () => {
  const reader = new BaselineReleaseReader(workspace);
  const current = await reader.resolvePublishedRelease();
  assert.throws(() => { current.nodes[0]!.label = 'changed'; }, TypeError);
  assert.equal((await reader.readRelease(current.releaseId)).nodes[0]!.label, 'Adults Only');
  await assert.rejects(reader.readRelease('unknown-release'), error => error instanceof ContractError && error.code === 'RELEASE_INCOMPATIBLE');
});
test('bad baseline refresh retains the prior validated release; bad startup has no fallback', async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'nexg-discovery-foundation-'));
  try {
    for (const file of release.sourceFiles) {
      const destination = join(temporaryRoot, file.path); await mkdir(dirname(destination), { recursive: true });
      await cp(join(workspace, file.path), destination);
    }
    const reader = new BaselineReleaseReader(temporaryRoot);
    const initial = await reader.resolvePublishedRelease();
    const config = join(temporaryRoot, 'docs/discovery/DISCOVERY_CONFIGURATION_V1.1.json');
    await writeFile(config, '{}');
    const failedRefresh = await reader.refresh();
    assert.deepEqual({ id: failedRefresh.release.releaseId, refreshed: failedRefresh.refreshed, reason: failedRefresh.reason },
      { id: initial.releaseId, refreshed: false, reason: 'RELEASE_REFRESH_REJECTED' });
    await assert.rejects(new BaselineReleaseReader(temporaryRoot).resolvePublishedRelease(), ContractError);
    const exported = await exportRelease(initial, join(temporaryRoot, 'artifacts'));
    assert.equal(JSON.parse(await readFile(exported, 'utf8')).releaseId, initial.releaseId);
    assert.equal(await exportRelease(initial, join(temporaryRoot, 'artifacts')), exported);
    await writeFile(exported, 'corrupt');
    await assert.rejects(exportRelease(initial, join(temporaryRoot, 'artifacts')));
  } finally {
    assert.equal(dirname(resolve(temporaryRoot)), resolve(tmpdir()));
    assert.equal(temporaryRoot.startsWith(join(tmpdir(), 'nexg-discovery-foundation-')), true);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
test('asset paths reject traversal, absolute paths and alternate separators', () => {
  assert.equal(safeRelativePath('ICONS/pack/icon.png'), true);
  assert.deepEqual(['../icon.png', '/icon.png', 'C:/icon.png', 'ICONS/../icon.png', 'ICONS\\icon.png'].map(safeRelativePath), [false, false, false, false, false]);
});
