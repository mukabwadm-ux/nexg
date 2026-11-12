/** Settings read by the Supabase provider (plan step E2). Values live in .env.local and are never committed. */
interface ImportMetaEnv {
  readonly VITE_DISCOVERY_PROVIDER?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_NEXG_CHECKOUT_URL?: string;
  /** "supabase": published cinema showings and seats. "stand-in": local sample programme. */
  readonly VITE_CINEMA_SOURCE?: string;
}

/** Demo photos for the Supabase provider, packed by vite.config.ts from demo-seed/source/demo-api-snapshot.json. */
declare module 'virtual:nexg-demo-media' {
  const packed: import('./demoMedia').PackedDemoMedia;
  export default packed;
}
