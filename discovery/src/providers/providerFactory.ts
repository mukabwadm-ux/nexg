import type { DiscoveryProvider } from './DiscoveryProvider';
import { lazySupabaseProvider } from './lazySupabaseProvider';

/** Selection is explicit. A failed request never changes provider authority. */
export function createDiscoveryProvider(selection: string | undefined, providers: { platform: DiscoveryProvider; engine: () => DiscoveryProvider; supabase?: () => DiscoveryProvider }): DiscoveryProvider {
  if (!selection || selection === 'platform') return providers.platform;
  if (selection === 'engine') return providers.engine();
  if (selection === 'supabase') return (providers.supabase ?? lazySupabaseProvider)();
  throw new Error('VITE_DISCOVERY_PROVIDER must be platform or engine or supabase');
}
