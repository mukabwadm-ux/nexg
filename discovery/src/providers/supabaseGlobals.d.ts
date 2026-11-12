/** Settings read by the Supabase provider (plan step E2). Values live in .env.local and are never committed. */
interface ImportMetaEnv {
  readonly VITE_DISCOVERY_PROVIDER?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_NEXG_CHECKOUT_URL?: string;
  /** "stand-in": sample showtimes and seats for the local demo cinemas (src/data/cinema/standInCinema.ts). Unset: no cinema system yet. */
  readonly VITE_CINEMA_SOURCE?: string;
}

/** Demo photos for the Supabase provider, packed by vite.config.ts from demo-seed/source/demo-api-snapshot.json. */
declare module 'virtual:nexg-demo-media' {
  const packed: import('./demoMedia').PackedDemoMedia;
  export default packed;
}
