import type { CatalogIndexSource } from '../../indexing/ports.js';
import type { CatalogSnapshot } from '../../indexing/contracts.js';
import { requireIndex } from '../../indexing/contracts.js';
import type { ServerDiscoveryProvider } from '../../providers/DiscoveryProvider.js';
import type { ReleaseArtifact } from '../../releases/artifact.js';
import { ReadBudget } from '../../orchestrator/readBudget.js';
import type { CatalogProjection } from '../../contracts/ownerProjection.js';

/** Bounded legacy merchant observations. Never a versioned/full source snapshot. */
export class PlatformCatalogPreviewSource implements CatalogIndexSource {
  constructor(private readonly provider: ServerDiscoveryProvider, private readonly release: Readonly<ReleaseArtifact>, private readonly categoryId: string) {}
  async read(signal: AbortSignal): Promise<CatalogSnapshot> {
    requireIndex(this.release.nodes.some(node => node.id === this.categoryId && node.kind === 'category'), 'INVALID_PREVIEW_SELECTION');
    const groups = [...new Set(this.release.nodes.filter(node => node.kind === 'subcategory' && node.parentId === this.categoryId)
      .flatMap(node => this.release.mappings.find(mapping => mapping.nodeId === node.id)!.sourceSubcategoryIds))];
    requireIndex(groups.length > 0 && groups.length <= 16, 'PREVIEW_SCOPE_UNAVAILABLE');
    const budget = new ReadBudget({ signal });
    try {
      const pages = await Promise.all(groups.map(async group => ({ group, rows: await this.provider.getMerchants({ sourceSubcategoryIds: [group], limit: 48 }, budget) })));
      const state = new Map<string, CatalogProjection>();
      const unknown = { state: 'unknown', reason: 'not_exposed' } as const;
      for (const { group, rows } of pages) for (const row of rows) {
        const merchant = row.presentation; const prior = state.get(merchant.ref.id);
        requireIndex(!prior || prior.label === merchant.name, 'PREVIEW_OBSERVATIONS_CHANGED');
        if (prior?.classification.state === 'known') {
          prior.classification.value.sourceSubcategoryRefs.push({ ownerId: this.provider.ownerId, id: group }); continue;
        }
        state.set(merchant.ref.id, { entityKind: 'merchant', ownerId: this.provider.ownerId, id: merchant.ref.id, merchantId: merchant.ref.id,
          label: merchant.name, observedAt: row.evidence.observedAt, sourceRevision: unknown, provenance: unknown, listedPrice: unknown, workflowPaths: unknown, deleted: unknown,
          classification: { state: 'known', evidence: row.evidence, value: { sourceCategoryRefs: [],
            sourceSubcategoryRefs: [{ ownerId: this.provider.ownerId, id: group }], evidenceRef: { ownerId: this.provider.ownerId, id: merchant.ref.id } } } });
      }
      budget.assertOpen();
      return { kind: 'snapshot', source: { ownerId: this.provider.ownerId, scopeId: `legacy-category:${this.categoryId}`, snapshotId: null,
        checkpoint: null, asOf: new Date().toISOString(), complete: false, deletions: 'unknown' },
        records: [...state.values()].map(projection => ({ projection, sequence: null })) };
    } finally { budget.dispose(); }
  }
}
