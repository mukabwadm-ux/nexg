/**
 * @nexg/contracts/api — the public API surface.
 *
 * The public API reads what the `_public` views already allow
 * a visitor to see. It adds no new permission: every field here
 * is a field the view already publishes, and the view is what
 * decides that. The API's job is a stable, versioned, paginated
 * shape over that, not a second set of rules.
 *
 * Three decisions worth writing down.
 *
 * **The view is the permission, the schema is the promise.**
 * `merchant_public` is `security_invoker = false` and filters
 * to `status = 'live'`, and it deliberately omits legal name,
 * contact details and settlement account. A schema that named
 * those fields would be a schema asking to be violated by the
 * next person to write a query. So the schemas below name only
 * what the views publish, and the API reads the views.
 *
 * **Every list is a cursor, and every cursor has a tiebreak.**
 * `page()` in this package already refuses offsets, because an
 * offset page re-reads rows that have shifted under it and skips
 * one silently. That needs a stable sort to be true, so each
 * list below is sorted by a time column, then the id. Two rows
 * that land in the same millisecond still have an order, so no
 * row is skipped and none is returned twice.
 *
 * **Money crosses as an integer.** `Money` is cents, and a
 * `price_kes` column is whole shillings. Both are integers, and
 * neither is ever a float. That is the same rule the ledger
 * holds, and it is why the API does not need a separate money
 * type for each.
 */
import { z } from 'zod';

import { Money, PageRequest, Uuid } from './index';

/* ════════════════════════════════════════════════════════════════════════════ the envelope */

/**
 * A page of results, as it goes over the wire.
 *
 * `next_cursor` is null when there is no next page, rather than
 * an empty string, because "there is no next page" and "the next
 * page is the one you just had" are different and a client that
 * cannot tell them apart will loop.
 */
export const PageEnvelope = <T extends z.ZodTypeAny>(item: T) =>
  z
    .object({
      ok: z.literal(true),
      data: z
        .object({
          items: z.array(item),
          next_cursor: z.string().nullable(),
        })
        .strict(),
      meta: z
        .object({
          api_version: z.literal('v1'),
          /** The limit the server actually applied, after clamping. */
          limit: z.number().int().positive(),
        })
        .strict(),
    })
    .strict();

export type PageEnvelope<T extends z.ZodTypeAny> = z.infer<ReturnType<typeof PageEnvelope<T>>>;

/**
 * What every endpoint returns when it cannot.
 *
 * `code` is the part a program branches on and `message` is the
 * part a person reads. The database raises its exceptions as
 * prose — "A phone number is how we reach you about your
 * guests." — and that prose must not be the only thing a client
 * has to work with, or every client ends up matching on English.
 */
export const ApiError = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        /** A stable, machine-readable code. See `ERROR_CODES`. */
        code: z.string(),
        /** A sentence for the person reading it. */
        message: z.string(),
        /** Field-level problems, keyed by field name. */
        fields: z.record(z.string()).optional(),
      })
      .strict(),
    meta: z
      .object({
        api_version: z.literal('v1'),
      })
      .strict(),
  })
  .strict();

export type ApiError = z.infer<typeof ApiError>;

/**
 * The codes a client may branch on.
 *
 * A small closed set on purpose. A code that is invented per
 * endpoint is a code no client can rely on, and the moment a
 * client starts matching on the message instead, the message
 * becomes an API it cannot change.
 */
export const ERROR_CODES = {
  invalid_request: 'The request was not in a shape we understand.',
  not_found: 'That does not exist.',
  method_not_allowed: 'That is not something this endpoint does.',
  rate_limited: 'Too many requests. Give it a moment.',
  internal_error: 'Something went wrong on our side.',
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/* ════════════════════════════════════════════════════════════════════════════ the resources */

/**
 * A merchant, as the public is allowed to see it.
 *
 * Every field here is a column of `merchant_public`. There is
 * no legal name, no contact phone, no contact email and no
 * settlement account, because the view does not publish them.
 * 
 * `listed_at` is guaranteed non-null: a merchant has status='live'
 * if and only if went_live_at is set (DB constraint).
 */
export const PublicMerchant = z
  .object({
    id: Uuid,
    trading_name: z.string(),
    /** The taxonomy vertical. `other` carries the free text beside it. */
    category: z.string(),
    category_other: z.string().nullable(),
    cover_photo_path: z.string().nullable(),
    featured: z.boolean(),
    city_slug: z.string(),
    city_name: z.string(),
    branch_name: z.string().nullable(),
    branch_address: z.string().nullable(),
    branch_latitude: z.number().nullable(),
    branch_longitude: z.number().nullable(),
    /** When it went live, which is when a visitor could first see it. */
    listed_at: z.string(),
    explore_visible: z.boolean().nullable(),
    concierge_pick: z.boolean().nullable(),
    accepting_orders: z.boolean().nullable(),
    pay_on_delivery_enabled: z.boolean().nullable(),
    pay_on_delivery_cap_kes: z.number().int().nullable(),
    prep_minutes: z.number().int().nullable(),
    busy_mode_until: z.string().nullable(),
    closed_early_at: z.string().nullable(),
    /** The merchant this one replicates (for chains). */
    parent_merchant_id: Uuid.nullable(),
    /** Subcategory within the main taxonomy. */
    subcategory: z.string().nullable(),
  })
  .strict();

export type PublicMerchant = z.infer<typeof PublicMerchant>;

/**
 * One item on a merchant's menu.
 *
 * `price_kes` is whole shillings, which is an integer. A float
 * here would be approximately a price, and the difference between
 * approximately and exactly is the difference between a
 * merchant being paid the right amount.
 */
export const CatalogueItem = z
  .object({
    id: Uuid,
    merchant_id: Uuid,
    section_id: Uuid.nullable(),
    name: z.string(),
    description: z.string().nullable(),
    price_kes: z.number().int().nonnegative(),
    available: z.boolean().nullable(),
    age_restricted: z.boolean().nullable(),
    highlighted: z.boolean().nullable(),
    sort: z.number().int().nullable(),
  })
  .strict();

export type CatalogueItem = z.infer<typeof CatalogueItem>;

/**
 * A delivery zone, as the public is allowed to see it.
 *
 * Note: `zone_bounds` is security_invoker (the RLS policy decides),
 * while the others are security_definer (the view's WHERE is the rule).
 */
export const PublicZone = z
  .object({
    id: Uuid,
    city_id: Uuid,
    name: z.string(),
    tier: z.string().nullable(),
    eta_min: z.number().int().nullable(),
    eta_max: z.number().int().nullable(),
    cod_allowed: z.boolean().nullable(),
    west: z.number().nullable(),
    south: z.number().nullable(),
    east: z.number().nullable(),
    north: z.number().nullable(),
  })
  .strict();

export type PublicZone = z.infer<typeof PublicZone>;

/**
 * An experience (event), as the public is allowed to see it.
 *
 * Sorted by starts_at. Events in the past are filtered out by the view.
 */
export const PublicEvent = z
  .object({
    id: Uuid,
    city_id: Uuid,
    name: z.string().nullable(),
    category: z.string().nullable(),
    venue_name: z.string().nullable(),
    venue_address: z.string().nullable(),
    starts_at: z.string().nullable(),
    ends_at: z.string().nullable(),
    doors_at: z.string().nullable(),
    cover_path: z.string().nullable(),
    featured: z.boolean().nullable(),
    anchor_slot: z.string().nullable(),
    organiser_name: z.string().nullable(),
    organiser_url: z.string().nullable(),
    ticket_url: z.string().nullable(),
    ticket_bands: z.record(z.string()).nullable(),
    nexg_can_hold_tickets: z.boolean().nullable(),
    practical_note: z.string().nullable(),
    suggested_blocks: z.record(z.string()).nullable(),
  })
  .strict();

export type PublicEvent = z.infer<typeof PublicEvent>;

/* ════════════════════════════════════════════════════════════════════════════ the requests */

/**
 * The query a list endpoint accepts.
 *
 * Reuses `PageRequest` from this package so that every list in
 * the system takes the same two parameters, whatever it is
 * listing. The API adds filters on top, one at a time, and only
 * where the view can answer them.
 */
export const ListRequest = PageRequest.extend({
  /** A city slug. Omit for every city. */
  city: z.string().max(64).optional(),
  /** A taxonomy vertical, e.g. `pharmacy`. */
  category: z.string().max(64).optional(),
  /** A free-text search over the fields the view publishes. */
  q: z.string().max(120).optional(),
}).strict();

export type ListRequest = z.infer<typeof ListRequest>;

export { PageRequest };