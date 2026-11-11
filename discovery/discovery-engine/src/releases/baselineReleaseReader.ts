import { readFile, realpath, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { ContractError } from '../contracts/index.js';
import { policyRegistry } from '../policy/registry.js';
import { sha256 } from '../shared/immutable.js';
import { safeRelativePath, sealRelease, validateReleaseArtifact, type ReleaseArtifact, type ReleaseParts } from './artifact.js';

interface Approval { files: { path: string; sha256: string }[]; assetBindings: { manifestPath: string; assetPath: string }[] }
interface Taxonomy { main_category_count: number; subcategory_count: number; categories: {
  name: string; position: number; icon_reference: string; subcategory_count: number;
  subcategories: { name: string; position: number; icon_reference: string }[];
}[] }
interface Configuration { main_category_count: number; subcategory_count: number; homepage_category_order: string[]; categories: {
  category: string; discovery_key: string; navigation_position: number; main_icon_reference: string; source_category_ids: string[];
  collections: { key: string; title: string }[]; subcategories: {
    name: string; discovery_key: string; icon_reference: string; source_subcategory_ids: string[]; mapping_status: string;
    nested_option_candidates: { id: string; label: string; source_subcategory_ids: string[] }[];
  }[];
}[] }
const taxonomyPath = 'docs/discovery/TAXONOMY_V1.1.json';
const configPath = 'docs/discovery/DISCOVERY_CONFIGURATION_V1.1.json';
// The approved 1254 px originals (ICONS/NexG_Discovery_Icons, 190 MB) are not in the repository. The release
// pins the 256 px WebP copy of each one in assets/icons-web instead; assets/icons-web/manifest.json records the
// SHA-256 of the original each copy was made from. scripts/pin-web-icons.mjs writes the index and the approval.
const manifestPath = 'assets/icons-web/NexG_Discovery_Icons_Manifest.csv';
const assetRoot = 'assets/icons-web/';
const legacyAssetPrefix = 'references/icons-v1.1/NexG_Discovery_Icons/';
function check(condition: unknown, path: string): asserts condition { if (!condition) throw new ContractError('RELEASE_INCOMPATIBLE', [path]); }

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index++; } else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (char === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  check(!quoted, manifestPath);
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

export interface ReleaseReader {
  resolvePublishedRelease(): Promise<Readonly<ReleaseArtifact>>;
  readRelease(releaseId: string): Promise<Readonly<ReleaseArtifact>>;
}

export class BaselineReleaseReader implements ReleaseReader {
  #active?: Readonly<ReleaseArtifact>;
  #validated = new Map<string, Readonly<ReleaseArtifact>>();
  constructor(private readonly workspaceRoot: string) {}

  async #import(): Promise<Readonly<ReleaseArtifact>> {
    const approval = JSON.parse(await readFile(new URL('../../../config/baseline-approval.v1.json', import.meta.url), 'utf8')) as Approval;
    check(Array.isArray(approval.files) && approval.files.length > 0, '/approval');
    const workspace = await realpath(this.workspaceRoot);
    const contents = new Map<string, Buffer>();
    for (const file of approval.files) {
      check(safeRelativePath(file.path) && /^[a-f0-9]{64}$/.test(file.sha256) && !contents.has(file.path), '/approval');
      const path = await realpath(resolve(workspace, file.path));
      const inside = relative(workspace, path);
      check(inside && !inside.startsWith('..') && !isAbsolute(inside), file.path);
      const bytes = await readFile(path);
      check(sha256(bytes) === file.sha256, file.path);
      contents.set(file.path, bytes);
    }
    const getText = (path: string): string => {
      check(contents.has(path), path); return contents.get(path)!.toString('utf8').replace(/^\uFEFF/, '');
    };
    const taxonomy = JSON.parse(getText(taxonomyPath)) as Taxonomy;
    const config = JSON.parse(getText(configPath)) as Configuration;
    const rows = parseCsv(getText(manifestPath));
    check(rows[0]?.join(',') === 'Asset Type,Category No.,Subcategory No.,Category,Asset Label,Relative Path', manifestPath);
    const iconRows = rows.slice(1).filter(row => row[0] === 'Main Category' || row[0] === 'Subcategory');
    const usedIcons = new Set<string>();
    function icon(category: string, label: string, reference: string, type: string): string {
      check(reference.startsWith(legacyAssetPrefix) && reference.endsWith('.png'), reference);
      const expectedPath = assetRoot + reference.slice(legacyAssetPrefix.length).replace(/\.png$/, '.webp');
      const matches = iconRows.filter(row => row[0] === type && row[3] === category && row[4] === label);
      check(matches.length === 1, reference);
      const bindings = approval.assetBindings.filter(binding => binding.manifestPath === matches[0]![5] && binding.assetPath === expectedPath);
      check(bindings.length === 1, reference);
      const path = bindings[0]!.assetPath;
      check(safeRelativePath(path) && contents.has(path) && !usedIcons.has(path), path);
      usedIcons.add(path); return path;
    }
    const parts: ReleaseParts = { schemaVersion: '1', compatibility: { engineSchema: '1', rendererSchema: '1' }, nodes: [], placements: [], mappings: [], collections: [],
      assets: [], sourceFiles: structuredClone(approval.files), policy: policyRegistry, fallback: { unmapped: 'explicit_unmapped', unknownFacts: 'preserve_unknown' } };
    check(Array.isArray(taxonomy.categories) && Array.isArray(config.categories), '/categories');
    check(taxonomy.categories.length === taxonomy.main_category_count && config.categories.length === config.main_category_count
      && taxonomy.categories.length === config.categories.length, '/categories');
    check(new Set(taxonomy.categories.map(category => category.name)).size === taxonomy.categories.length
      && new Set(config.categories.map(category => category.category)).size === config.categories.length, '/categories/name');
    for (const category of taxonomy.categories) {
      const settings = config.categories.find(candidate => candidate.category === category.name);
      check(settings && settings.navigation_position === category.position && settings.main_icon_reference === category.icon_reference, '/categories/alignment');
      const categoryId = settings.discovery_key;
      parts.nodes.push({ id: categoryId, kind: 'category', label: category.name, order: category.position, lifecycle: 'active', assetPath: icon(category.name, category.name, category.icon_reference, 'Main Category') });
      parts.mappings.push({ nodeId: categoryId, sourceCategoryIds: [...settings.source_category_ids], sourceSubcategoryIds: [],
        status: settings.source_category_ids.length ? 'configured_context_only' : 'unmapped', note: 'Configured source groups are discovery context, not live item/workflow certification.' });
      check(category.subcategories.length === category.subcategory_count && settings.subcategories.length === category.subcategories.length
        && new Set(settings.subcategories.map(sub => sub.name)).size === settings.subcategories.length, '/subcategories');
      for (const sub of category.subcategories) {
        const mapping = settings.subcategories.find(candidate => candidate.name === sub.name);
        check(mapping && mapping.icon_reference === sub.icon_reference, '/subcategories/alignment');
        parts.nodes.push({ id: mapping.discovery_key, kind: 'subcategory', parentId: categoryId, label: sub.name, order: sub.position, lifecycle: 'active', assetPath: icon(category.name, sub.name, sub.icon_reference, 'Subcategory') });
        parts.mappings.push({ nodeId: mapping.discovery_key, sourceCategoryIds: [], sourceSubcategoryIds: [...mapping.source_subcategory_ids], status: mapping.source_subcategory_ids.length ? 'configured_context_only' : 'unmapped', note: mapping.mapping_status });
        parts.placements.push({ id: `baseline:L2:${mapping.discovery_key}`, surface: 'L2', contextId: categoryId, nodeId: mapping.discovery_key, order: sub.position });
        for (const [index, option] of mapping.nested_option_candidates.entries()) {
          check(option.source_subcategory_ids.every(id => mapping.source_subcategory_ids.includes(id)), '/options/sourceIds');
          parts.nodes.push({ id: option.id, kind: 'option', parentId: mapping.discovery_key, label: option.label, order: index + 1, lifecycle: 'context_candidate' });
          parts.mappings.push({ nodeId: option.id, sourceCategoryIds: [], sourceSubcategoryIds: [...option.source_subcategory_ids], status: option.source_subcategory_ids.length ? 'configured_context_only' : 'unmapped', note: 'Existing configured nested candidate, not a source capability.' });
        }
      }
      for (const collection of settings.collections) parts.collections.push({ id: collection.key, categoryId, title: collection.title, enabled: false, reason: 'PREDICATE_NOT_IMPLEMENTED' });
    }
    const subCount = parts.nodes.filter(node => node.kind === 'subcategory').length;
    check(subCount === taxonomy.subcategory_count && subCount === config.subcategory_count && usedIcons.size === iconRows.length, '/declaredCounts');
    check(new Set(config.homepage_category_order).size === config.homepage_category_order.length
      && config.homepage_category_order.length === taxonomy.categories.length, '/homepage_category_order');
    for (const [index, id] of config.homepage_category_order.entries()) {
      check(parts.nodes.some(node => node.id === id && node.kind === 'category'), '/homepage_category_order');
      parts.placements.push({ id: `baseline:L1:${id}`, nodeId: id, surface: 'L1', order: index + 1 });
    }
    parts.assets = [...usedIcons].sort().map(path => ({ path, sha256: sha256(contents.get(path)!) }));
    parts.sourceFiles.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    return sealRelease(parts);
  }

  async resolvePublishedRelease(): Promise<Readonly<ReleaseArtifact>> {
    if (!this.#active) {
      try { this.#active = await this.#import(); }
      catch (error) { if (error instanceof ContractError) throw error; throw new ContractError('RELEASE_INCOMPATIBLE', ['/baselineSource']); }
      this.#validated.set(this.#active.releaseId, this.#active);
    }
    return this.#active;
  }
  async readRelease(releaseId: string): Promise<Readonly<ReleaseArtifact>> {
    await this.resolvePublishedRelease();
    const release = this.#validated.get(releaseId);
    if (!release) throw new ContractError('RELEASE_INCOMPATIBLE', ['/releaseId']);
    return release;
  }
  async refresh(): Promise<{ release: Readonly<ReleaseArtifact>; refreshed: boolean; reason?: 'RELEASE_REFRESH_REJECTED' }> {
    try {
      const next = await this.#import();
      const refreshed = next.releaseId !== this.#active?.releaseId;
      this.#active = next; this.#validated.set(next.releaseId, next);
      return { release: next, refreshed };
    } catch (error) {
      if (!this.#active) throw error;
      return { release: this.#active, refreshed: false, reason: 'RELEASE_REFRESH_REJECTED' };
    }
  }
}

export async function exportRelease(release: Readonly<ReleaseArtifact>, directory: string): Promise<string> {
  const validated = validateReleaseArtifact(release);
  const filename = resolve(directory, `${validated.releaseId}.json`);
  const bytes = JSON.stringify(validated, null, 2) + '\n';
  await mkdir(directory, { recursive: true });
  try { await writeFile(filename, bytes, { flag: 'wx' }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || await readFile(filename, 'utf8') !== bytes) throw error;
  }
  return filename;
}
