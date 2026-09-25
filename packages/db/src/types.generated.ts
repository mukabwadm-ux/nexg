/**
 * PLACEHOLDER — replaced by `pnpm db:types` in M2.
 *
 * The real file is generated from the local Supabase instance:
 *   supabase gen types typescript --local --schema public --schema audit
 *
 * Until the migrations in spec section 3 exist there is nothing to generate,
 * so this stub keeps the workspace type-checking. Do not hand-edit it.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
