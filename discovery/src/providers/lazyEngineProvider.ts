import type { DiscoveryProvider } from './DiscoveryProvider';

/** Keep schema compilation and engine code outside the legacy provider's bundle. */
export function lazyEngineProvider(): DiscoveryProvider {
  let provider: Promise<DiscoveryProvider> | undefined;
  const load = () => provider ??= import('./engineProvider').then(module => new module.EngineDiscoveryProvider()).catch(error => { provider = undefined; throw error; });
  return {
    version: 'discovery-provider/bounded-v2',
    capabilities: { availabilityFilter: false, nearestSort: false, priceRangeFilter: false, transactions: false,
      resultSemantics: 'bounded/v2', supportedSorts: ['recommended'] },
    restart(query) { void provider?.then(value => value.restart?.(query), () => {}); },
    async observe(event) { return (await load()).observe!(event); },
    async getMerchants(query, signal) { return (await load()).getMerchants(query, signal); },
    async getExperienceOfferings(query, signal) { return (await load()).getExperienceOfferings(query, signal); },
    async getTourOfferings(query, signal) { return (await load()).getTourOfferings(query, signal); },
    async getCollections(category, query, signal) { return (await load()).getCollections(category, query, signal); },
    async getMerchant(id, signal) { return (await load()).getMerchant(id, signal); },
    async getAreas(signal) { return (await load()).getAreas(signal); },
  };
}
