import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@nexg/db';

import { noStoreFetch } from './no-store';

/**
 * A merchant's own catalogue through the API: GET /v1/catalog/items lists
 * every item, sold-out ones included, and PATCH /v1/catalog/items/{id}
 * changes an item's price or availability.
 *
 * The database holds every rule (rpc_catalogue_items_api and
 * rpc_catalogue_item_update_api): the key decides the merchant, only
 * price_kes and available change, a live key saves and audits, and a test
 * key saves nothing. This module only names the functions and checks the
 * request's shape first, so a malformed body is refused without a database
 * round trip.
 */

export const CATALOGUE_FUNCTIONS = {
  list: 'rpc_catalogue_items_api',
  update: 'rpc_catalogue_item_update_api',
} as const;

type CatalogueFunction = (typeof CATALOGUE_FUNCTIONS)[keyof typeof CATALOGUE_FUNCTIONS];
type RpcResult = Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

/**
 * Service role, because both functions are granted to service_role only:
 * they read and write rows that row security keeps closed to the anonymous
 * key. Each function resolves the API key and decides the merchant, so this
 * client never chooses whose catalogue is read or changed. Server only.
 */
export function catalogueClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: noStoreFetch } },
  ) as unknown as {
    rpc: (name: CatalogueFunction, args: Record<string, unknown>) => RpcResult;
  };
}

export const PRICE_HELP = 'Whole shillings, from 1 to 1,000,000.';

/** The body of PATCH /v1/catalog/items/{id}: a price, availability, or both. */
export const CatalogueItemChange = z
  .object({
    price_kes: z
      .number({ invalid_type_error: PRICE_HELP })
      .int(PRICE_HELP)
      .min(1, PRICE_HELP)
      .max(1_000_000, PRICE_HELP)
      .optional(),
    available: z.boolean({ invalid_type_error: 'true or false.' }).optional(),
  })
  .strict()
  .refine((change) => change.price_kes !== undefined || change.available !== undefined, {
    message: 'Send price_kes, available, or both.',
  });

export type CatalogueItemChange = z.infer<typeof CatalogueItemChange>;
