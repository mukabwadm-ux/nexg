/**
 * @nexg/contracts — the shapes that cross a boundary.
 *
 * Everything in `@nexg/db` describes what the database holds.
 * This describes what one process promises another: a request
 * body, a webhook payload, an idempotency key. The distinction
 * matters because a database column can be changed with a
 * migration and a contract cannot — somebody else's code is
 * already sending the old shape.
 *
 * Three rules this package is built on.
 *
 * **Parse, do not validate.** Every schema here returns a typed
 * value or throws. Nothing returns a boolean, because a boolean
 * leaves the caller holding `unknown` and trusting itself.
 *
 * **Refuse the unknown field.** Every object is `.strict()`. A
 * caller sending `{ amount_cents, amount }` has a bug, and
 * silently ignoring the second one means it is found when the
 * money is wrong rather than when the request arrives.
 *
 * **Money is integer cents, always.** There is one `Money` type
 * and it is a non-negative integer. A float that has been
 * through JSON is not a quantity of shillings, it is
 * approximately a quantity of shillings.
 */
import { z } from 'zod';

/* ════════════════════════════════════════════════ primitives */

/**
 * Cents, never shillings, never a float.
 *
 * `1250` is twelve shillings fifty. The rejection of a
 * non-integer is deliberate and load-bearing: `12.5` here
 * almost always means somebody passed shillings, and accepting
 * it would charge a hundredth of the intended amount.
 */
export const Money = z
  .number()
  .int('Money is in whole cents — 1250 is twelve shillings fifty, not 12.5.')
  .nonnegative();
export type Money = z.infer<typeof Money>;

/** A signed amount, for anything that can go either way. */
export const SignedMoney = z.number().int();

export const Uuid = z.string().uuid();

/**
 * Kenyan numbers in E.164.
 *
 * Stored and transmitted in one shape so that two records of
 * the same person are the same string. `0712…`, `+254712…` and
 * `254712…` are three spellings of one number and have been
 * three rows more than once.
 */
export const Msisdn = z
  .string()
  .regex(/^\+254[17]\d{8}$/, 'A Kenyan mobile number in full international form, like +254712345678.');

export const Email = z.string().email().max(320);

/** ISO 8601 with an offset. A timestamp without one is a guess. */
export const Timestamp = z.string().datetime({ offset: true });

export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date as YYYY-MM-DD.');

/**
 * A caller-supplied key that makes a retry safe.
 *
 * Required on every write that moves money. Long enough that a
 * careless implementation cannot collide by accident, and
 * bounded so it cannot be used as a storage field.
 */
export const IdempotencyKey = z.string().min(16).max(128);

/**
 * A point on the earth.
 *
 * `[0, 0]` is rejected by name. It is in the Gulf of Guinea, it
 * is what a missing header coerces to, and this system has
 * already shipped it once as a confident answer about where
 * somebody was standing.
 */
export const LatLng = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .strict()
  .refine((p) => !(p.lat === 0 && p.lng === 0), {
    message: 'Null Island is not a location. This is almost always a missing value coerced to 0.',
  });
export type LatLng = z.infer<typeof LatLng>;

/* ═══════════════════════════════════════════════ envelopes */

/**
 * What every endpoint returns.
 *
 * `ok: false` carries a message written for the person who will
 * read it, not a stack trace. The database already raises its
 * exceptions this way and the API should not undo that on the
 * way out.
 */
export const Failure = z
  .object({
    ok: z.literal(false),
    message: z.string(),
    code: z.string().optional(),
    /** Field-level problems, keyed by the field name. */
    fields: z.record(z.string()).optional(),
  })
  .strict();
export type Failure = z.infer<typeof Failure>;

export function success<T extends z.ZodTypeAny>(data: T) {
  return z.object({ ok: z.literal(true), data }).strict();
}

/**
 * A page of results.
 *
 * Cursor, not offset. An offset page re-reads rows that have
 * shifted under it and will silently skip one when something is
 * inserted between requests — which, on a list of orders, means
 * an order nobody ever sees.
 */
export function page<T extends z.ZodTypeAny>(item: T) {
  return z
    .object({
      items: z.array(item),
      next_cursor: z.string().nullable(),
    })
    .strict();
}

export const PageRequest = z
  .object({
    cursor: z.string().nullish(),
    limit: z.number().int().min(1).max(100).default(25),
  })
  .strict();

/* ═══════════════════════════════════════════════ webhooks */

/**
 * What a provider sends us.
 *
 * Every one of these is parsed before it is acted on, and the
 * signature is checked before it is parsed. The ordering is the
 * contract: an unverified payload is bytes, not a payment.
 */
export const PaystackEvent = z
  .object({
    event: z.string(),
    data: z.object({
      reference: z.string(),
      amount: z.number().int(),
      currency: z.string(),
      status: z.string(),
    }),
  })
  .passthrough();

export const WhatsAppInbound = z
  .object({
    from: z.string(),
    id: z.string(),
    timestamp: z.string(),
    type: z.string(),
    text: z.object({ body: z.string() }).optional(),
  })
  .passthrough();

/* ════════════════════════════════════════════════ requests */

export const StartConversation = z
  .object({
    name: z.string().max(120).optional(),
    contact: z.union([Msisdn, Email]),
    topic: z.string().min(1).max(64),
    body: z.string().min(1).max(4000),
    city_slug: z.string().max(64).optional(),
    consent: z.literal(true, {
      errorMap: () => ({
        message: 'We need your agreement to reply to you before we can take this.',
      }),
    }),
  })
  .strict();
export type StartConversation = z.infer<typeof StartConversation>;

export const CreateRefund = z
  .object({
    order_id: Uuid,
    amount_cents: Money,
    reason_code: z.string().min(1).max(64),
    reason_text: z.string().max(1000).optional(),
    idempotency_key: IdempotencyKey,
  })
  .strict();
export type CreateRefund = z.infer<typeof CreateRefund>;

export const ResolveLocation = z
  .object({
    point: LatLng.optional(),
    text: z.string().max(240).optional(),
    city_slug: z.string().max(64).optional(),
  })
  .strict()
  .refine((v) => v.point !== undefined || v.text !== undefined, {
    message: 'Give either a point or an address.',
  });

/* ═════════════════════════════════════════════════ helpers */

/**
 * Parse, with the error already shaped for a response.
 *
 * The alternative — letting ZodError escape to a catch-all —
 * produces a 500 for what is a 400, and tells the caller
 * nothing about which field was wrong.
 */
export function parse<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
): { ok: true; data: z.infer<T> } | { ok: false; failure: Failure } {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.') || '_';
    /* First problem per field. A list of four complaints about
       one field is not four things to fix. */
    if (!(path in fields)) fields[path] = issue.message;
  }

  return {
    ok: false,
    failure: {
      ok: false,
      message: result.error.issues[0]?.message ?? 'That request was not in a shape we understand.',
      code: 'invalid_request',
      fields,
    },
  };
}

/**
 * The one spelling of a Kenyan number.
 *
 * Call this at every edge. `0712345678`, `254712345678` and
 * `+254 712 345 678` are the same person, and storing them
 * differently is how one person becomes three support tickets.
 */
export function normaliseMsisdn(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  let n = digits.startsWith('+') ? digits.slice(1) : digits;

  if (n.startsWith('0')) n = `254${n.slice(1)}`;
  else if (n.length === 9 && /^[17]/.test(n)) n = `254${n}`;

  const candidate = `+${n}`;
  return Msisdn.safeParse(candidate).success ? candidate : null;
}
