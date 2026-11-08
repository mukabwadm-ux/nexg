import type { DiscoveryQuery } from '../providers/DiscoveryProvider';

export interface RouteState extends DiscoveryQuery {
  view?: 'results' | 'experience' | 'tour'; merchantId?: string; itemId?: string; operatorSearch?: string; operatorOffset?: number;
}
export function parseRoute(search: string, state?: { discoveryRequest?: DiscoveryQuery['engineRequest'] }): RouteState {
  const params = new URLSearchParams(search);
  const offset = Number(params.get('offset')); const operatorOffset = Number(params.get('operatorOffset'));
  const allowedSorts = ['recommended', 'rating', 'delivery', 'price_low', 'price_high'] as const;
  return {
    // Keep obsolete IDs for typed server recovery; dropping them could broaden scope.
    categoryId: params.get('category') || undefined, subcategoryId: params.get('subcategory') || undefined, optionId: params.get('option') || undefined,
    search: params.get('q') || undefined, area: params.get('area') || undefined, openNow: params.get('open') === '1' ? true : undefined,
    sort: allowedSorts.find(value => value === params.get('sort')) ?? 'recommended',
    offset: Number.isSafeInteger(offset) && offset >= 0 ? offset : 0,
    cursor: params.get('cursor') || undefined,
    contextRequired: params.get('context') === 'required' ? true : undefined,
    view: params.get('view') === 'tour' && params.get('merchant') && params.get('item') ? 'tour'
      : params.get('view') === 'experience' && params.get('merchant') && params.get('item') ? 'experience'
      : params.get('view') === 'results' || params.get('subcategory') || params.get('option') ? 'results' : undefined,
    merchantId: params.get('merchant') || undefined, itemId: params.get('item') || undefined,
    operatorSearch: params.get('merchant') ? params.get('operatorSearch') || undefined : undefined,
    operatorOffset: params.get('merchant') && Number.isSafeInteger(operatorOffset) && operatorOffset >= 0 ? operatorOffset : 0,
    ...(state?.discoveryRequest ? { engineRequest: state.discoveryRequest, limit: state.discoveryRequest.limit } : {}),
  };
}
export function routeUrl(route: RouteState): string {
  const params = new URLSearchParams();
  const values = { category: route.categoryId, subcategory: route.subcategoryId, option: route.optionId, q: route.search, area: route.area,
    open: route.openNow ? '1' : undefined, sort: route.sort && route.sort !== 'recommended' ? route.sort : undefined,
    offset: route.offset || undefined, cursor: route.cursor, context: route.engineRequest || route.contextRequired ? 'required' : undefined, view: route.view, merchant: route.merchantId, item: route.itemId,
    operatorSearch: route.operatorSearch, operatorOffset: route.operatorOffset || undefined };
  for (const [key, value] of Object.entries(values)) if (value !== undefined) params.set(key, String(value));
  return params.size ? `/?${params}` : '/';
}
/** Pagination can reuse context. Changing semantics always starts a new window. */
export function applyQueryChange(route: RouteState, change: Partial<DiscoveryQuery>): RouteState {
  const pagingOnly = Object.keys(change).every(key => key === 'offset' || key === 'cursor');
  if (pagingOnly) return { ...route, ...change };
  const next = { ...route, ...change, cursor: undefined, offset: 0 };
  if (route.engineRequest) {
    const request = structuredClone(route.engineRequest);
    request.selection = { ...(next.categoryId ? { categoryId: next.categoryId } : {}), ...(next.subcategoryId ? { subcategoryId: next.subcategoryId } : {}), ...(next.optionId ? { optionId: next.optionId } : {}) };
    if ('search' in change) { delete request.query; if (next.search?.trim()) request.query = next.search.trim(); }
    if ('area' in change) {
      request.filters = request.filters.filter(filter => filter.kind !== 'catalog_area');
      if (next.area) request.filters.push({ kind: 'catalog_area', areaId: next.area });
    }
    if ('openNow' in change) {
      request.filters = request.filters.filter(filter => filter.kind !== 'merchant_open');
      if (next.openNow) request.filters.push({ kind: 'merchant_open', value: true });
    }
    request.sort = next.sort ?? 'recommended'; request.limit = next.limit ?? request.limit;
    delete request.cursor; delete request.offset;
    next.engineRequest = request;
  }
  return next;
}
