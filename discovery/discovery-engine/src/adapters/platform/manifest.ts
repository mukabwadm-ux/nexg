import { deepFreeze } from '../../shared/immutable.js';

export const catalogAdapterManifest = deepFreeze({
  id: 'website-public-catalog', version: '1', ownerId: 'platform-catalog',
  authority: 'READ_ONLY_EXTERNAL',
  dataClasses: ['public_merchant_identity', 'public_catalog_preview', 'catalog_area'],
  methods: ['GET'], paths: ['/api/merchants', '/api/merchants/{id}', '/api/areas'],
  credentials: 'none_forwarded', redirects: 'forbidden', maxResponseBytes: 2 * 1024 * 1024,
  operationalCapabilities: [], snapshots: 'unknown', itemPreviewCompleteness: 'bounded_window',
});
