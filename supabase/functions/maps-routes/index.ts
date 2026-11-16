import { createRoutesHandler } from './handler.ts';

function readPublicSupabaseKey() {
  const publishableKeys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (publishableKeys) {
    try {
      const key = JSON.parse(publishableKeys)?.default;
      if (typeof key === 'string' && key.trim()) return key;
    } catch {
      // Local and older hosted runtimes may still use the public legacy key.
    }
  }
  return Deno.env.get('SUPABASE_ANON_KEY');
}

Deno.serve(
  createRoutesHandler({
    enabled: Deno.env.get('MAPS_ROUTES_ENABLED'),
    googleApiKey: Deno.env.get('GOOGLE_ROUTES_API_KEY'),
    supabaseUrl: Deno.env.get('SUPABASE_URL'),
    supabaseAnonKey: readPublicSupabaseKey(),
  }),
);
