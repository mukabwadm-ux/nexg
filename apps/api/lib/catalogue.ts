import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@nexg/db';

import { noStoreFetch } from './no-store';

/**
 * A merchant's own catalogue through the API: GET /v1/catalog/items lists
 * every item, sold-out ones included, PATCH /v1/catalog/items/{id} changes
 * an item's price or availability, and PATCH /v1/catalog/items changes up to
 * 100 items in one call.
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
  bulk: 'rpc_catalogue_items_update_api',
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

/** The most items one PATCH /v1/catalog/items may change. */
export const BULK_LIMIT = 100;

const CHANGE_FIELDS = {
  price_kes: z
    .number({ invalid_type_error: PRICE_HELP })
    .int(PRICE_HELP)
    .min(1, PRICE_HELP)
    .max(1_000_000, PRICE_HELP)
    .optional(),
  available: z.boolean({ invalid_type_error: 'true or false.' }).optional(),
};

const changesSomething = (change: { price_kes?: number; available?: boolean }) =>
  change.price_kes !== undefined || change.available !== undefined;

const CHANGE_HELP = 'Send price_kes, available, or both.';

/** The body of PATCH /v1/catalog/items/{id}: a price, availability, or both. */
export const CatalogueItemChange = z
  .object(CHANGE_FIELDS)
  .strict()
  .refine(changesSomething, { message: CHANGE_HELP });

export type CatalogueItemChange = z.infer<typeof CatalogueItemChange>;

const LIST_HELP = `Send from 1 to ${BULK_LIMIT} items.`;

/**
 * The body of PATCH /v1/catalog/items: up to 100 changes, each naming its
 * item by id, each item once. The database checks the same again and saves
 * all of them or none.
 */
export const CatalogueItemsChange = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z
              .string({ required_error: 'The id of the item to change.' })
              .uuid('An item id is a UUID: the id from GET /v1/catalog/items.'),
            ...CHANGE_FIELDS,
          })
          .strict()
          .refine(changesSomething, { message: CHANGE_HELP }),
        { required_error: 'A list of changes.', invalid_type_error: 'A list of changes.' },
      )
      .min(1, LIST_HELP)
      .max(BULK_LIMIT, LIST_HELP)
      .superRefine((items, ctx) => {
        const seen = new Map<string, number>();
        items.forEach((item, index) => {
          const id = item.id.toLowerCase();
          const first = seen.get(id);
          if (first === undefined) {
            seen.set(id, index);
          } else {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [index, 'id'],
              message: `Already in this list at items.${first}. Each item can appear once.`,
            });
          }
        });
      }),
  })
  .strict();

export type CatalogueItemsChange = z.infer<typeof CatalogueItemsChange>;
