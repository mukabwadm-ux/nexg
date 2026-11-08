import type { EngineRequest } from '../src/contracts/index.js';
import type { CatalogFetch } from '../src/adapters/platform/httpTransport.js';
import { ReadBudget } from '../src/orchestrator/readBudget.js';
import { release, request } from './helpers.js';

// Protocol controls only: no real businesses, catalog seeds or fallback inventory.
export function sourceControl(id = 'protocol-control') {
  return { id, name: 'Protocol control', nairobiArea: 'protocol-area', status: 'active',
    items: [{ id: `${id}-item`, merchantId: id, name: 'Protocol item', price: 0, isAvailable: true }],
    isOpen: true, rating: 5, commerceMode: 'purchase' };
}
export const jsonResponse = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...headers } });

export function merchantRequest(): EngineRequest {
  const node = release.nodes.find(node => node.kind === 'subcategory' && node.parentId === 'beauty-wellness'
    && release.mappings.find(mapping => mapping.nodeId === node.id)?.sourceSubcategoryIds.length === 1)!;
  return { ...request(), mode: 'merchant', selection: { categoryId: node.parentId!, subcategoryId: node.id } };
}
export const sourceGroup = release.mappings.find(mapping => mapping.nodeId === merchantRequest().selection.subcategoryId)!.sourceSubcategoryIds[0]!;

export function controlFetch(observe?: (url: URL, init: Parameters<CatalogFetch>[1]) => void): CatalogFetch {
  return async (url, init) => {
    observe?.(url, init);
    if (url.pathname === '/api/areas') return jsonResponse({ areas: ['protocol-area'] });
    if (url.pathname === '/api/merchants') return jsonResponse({ merchants: [sourceControl()], total: 9000 });
    return jsonResponse(sourceControl(decodeURIComponent(url.pathname.split('/').at(-1)!)));
  };
}
export async function withBudget<T>(operation: (budget: ReadBudget) => Promise<T>, timeoutMs = 1000): Promise<T> {
  const budget = new ReadBudget({ timeoutMs });
  try { return await operation(budget); } finally { budget.dispose(); }
}
