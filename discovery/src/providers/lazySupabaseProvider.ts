import type { DiscoveryProvider } from './DiscoveryProvider';
import { SUPABASE_PROVIDER_VERSION, supabaseCapabilities } from './supabaseSettings';

interface SupabaseEnv { VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string }

/**
 * VITE_DISCOVERY_PROVIDER=supabase (plan step E2). The provider, its subcategory map and the demo photos
 * load on first use, so the other providers' bundle stays as it was. A settings error fails each read
 * ("temporarily unavailable"), never the page; vite.config.ts also refuses to start without the settings.
 */
export function lazySupabaseProvider(env: SupabaseEnv = import.meta.env): DiscoveryProvider {
  let provider: Promise<DiscoveryProvider> | undefined;
  const media = () => Promise.all([import('virtual:nexg-demo-media'), import('./demoMedia')]).then(([data, codec]) => codec.unpackDemoMedia(data.default));
  const load = () => provider ??= import('./supabaseProvider')
    .then((module) => new module.SupabaseDiscoveryProvider({ url: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY, media }))
    .catch((error: unknown) => { provider = undefined; throw error; });
  // Start loading now, while the app renders, so the first read doesn't wait for the module chain. A failure
  // here is retried by the first read, which reports it.
  void load().catch(() => {});
  return {
    version: SUPABASE_PROVIDER_VERSION,
    capabilities: supabaseCapabilities,
    async getMerchants(query, signal) { return (await load()).getMerchants(query, signal); },
    async getExperienceOfferings(query, signal) { return (await load()).getExperienceOfferings(query, signal); },
    async getTourOfferings(query, signal) { return (await load()).getTourOfferings(query, signal); },
    async getCollections(category, query, signal) { return (await load()).getCollections(category, query, signal); },
    async getMerchant(id, signal) { return (await load()).getMerchant(id, signal); },
    async getAreas(signal) { return (await load()).getAreas(signal); },
  };
}
