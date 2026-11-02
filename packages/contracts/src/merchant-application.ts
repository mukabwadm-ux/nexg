import { z } from 'zod';
import { MERCHANT_TAXONOMY } from './taxonomy';

const text = (max: number) => z.string().trim().max(max);
const phone = z.string().regex(/^$|^\+254[17]\d{8}$/);
const specialtyParents = new Map(
  MERCHANT_TAXONOMY.flatMap((category) =>
    category.subcategories.map((specialty) => [specialty.id, category.id] as const),
  ),
);
const categoryIds = new Set(MERCHANT_TAXONOMY.map((category) => category.id));

// Limits apply to retained inactive answers as well as the active selection.
function safeAnswer(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 4096;
  if (Array.isArray(value))
    return value.length <= 128 && value.every((item) => safeAnswer(item, depth + 1));
  if (typeof value !== 'object' || !value) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= 128 &&
    entries.every(
      ([key, item]) =>
        key.length <= 128 &&
        !/^(?:__proto__|constructor|prototype|password|secret|token|file|api_key)$/i.test(key) &&
        safeAnswer(item, depth + 1),
    )
  );
}

export const MerchantApplicationCapture = z
  .object({
    registryRevision: text(100).min(1),
    business: z
      .object({
        name: text(200),
        firstName: text(100),
        lastName: text(100),
        email: z.union([z.literal(''), z.string().trim().email().max(320)]),
        phone,
        branchCount: z.number().int().min(1).max(10000).nullable(),
        registered: z.boolean().nullable(),
        sameBusinessPhone: z.boolean(),
        businessPhone: phone,
        marketing: z.boolean(),
      })
      .strict(),
    categoryId: text(100).nullable(),
    subcategories: z.array(text(100).min(1)).max(128),
    answersBySubcategory: z.record(z.record(z.unknown())),
    policies: z.object({ terms: z.boolean() }).strict(),
  })
  .strict()
  .superRefine((capture, ctx) => {
    if (capture.categoryId !== null && !categoryIds.has(capture.categoryId))
      ctx.addIssue({
        code: 'custom',
        path: ['categoryId'],
        message: 'Choose a canonical merchant category.',
      });
    if (new Set(capture.subcategories).size !== capture.subcategories.length)
      ctx.addIssue({
        code: 'custom',
        path: ['subcategories'],
        message: 'A specialty may be selected only once.',
      });
    for (const id of capture.subcategories)
      if (specialtyParents.get(id) !== capture.categoryId)
        ctx.addIssue({
          code: 'custom',
          path: ['subcategories'],
          message: 'Specialty does not belong to this category.',
        });
    for (const id of Object.keys(capture.answersBySubcategory))
      if (!specialtyParents.has(id))
        ctx.addIssue({
          code: 'custom',
          path: ['answersBySubcategory', id],
          message: 'Unknown retained specialty.',
        });
    if (
      !safeAnswer(capture.answersBySubcategory) ||
      new TextEncoder().encode(JSON.stringify(capture)).length > 65536
    )
      ctx.addIssue({ code: 'custom', message: 'Application exceeds the supported draft limits.' });
  });
export type MerchantApplicationCapture = z.infer<typeof MerchantApplicationCapture>;

const Id = z.string().uuid();
const Revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const MerchantPayoutDeclaration = z.discriminatedUnion('rail', [
  z.object({ rail: z.literal('mpesa_till'), tillNumber: z.string().regex(/^\d{1,20}$/) }).strict(),
  z
    .object({
      rail: z.literal('mpesa_paybill'),
      paybillNumber: z.string().regex(/^\d{1,20}$/),
      accountReference: text(100).min(1),
    })
    .strict(),
  z
    .object({
      rail: z.literal('bank'),
      bankName: text(100).min(1),
      accountName: text(200).min(1),
      accountNumber: text(100).min(1),
    })
    .strict(),
]);
export type MerchantPayoutDeclaration = z.infer<typeof MerchantPayoutDeclaration>;
export const MerchantPayoutRecord = z
  .object({
    merchant_id: Id,
    version: z.number().int().nonnegative(),
    payout: MerchantPayoutDeclaration.nullable(),
    verification: z.literal('declared'),
  })
  .passthrough();
export type MerchantPayoutRecord = z.infer<typeof MerchantPayoutRecord>;

export const MerchantApplicationCommand = z.discriminatedUnion('command', [
  z
    .object({
      command: z.literal('start'),
      operationId: Id,
      merchantId: Id.optional(),
      capture: MerchantApplicationCapture,
    })
    .strict(),
  z
    .object({
      command: z.literal('save'),
      operationId: Id,
      merchantId: Id,
      expectedRevision: Revision,
      capture: MerchantApplicationCapture,
    })
    .strict(),
  z
    .object({
      command: z.literal('submit'),
      operationId: Id,
      merchantId: Id,
      expectedRevision: Revision,
    })
    .strict(),
  z.object({ command: z.literal('activity'), merchantId: Id }).strict(),
  z
    .object({
      command: z.literal('payout'),
      operationId: Id,
      merchantId: Id,
      expectedVersion: z.number().int().nonnegative(),
      payout: MerchantPayoutDeclaration,
    })
    .strict(),
]);
export type MerchantApplicationCommand = z.infer<typeof MerchantApplicationCommand>;

export const MerchantApplicationRecord = z
  .object({
    merchant_id: Id,
    revision: Revision,
    payload: MerchantApplicationCapture,
    review: z
      .object({
        state: z.enum(['draft', 'pending', 'changes_requested', 'approved', 'rejected']),
        submitted_revision: Revision.nullable(),
        submitted_at: z.string().nullable(),
        needs_resubmission: z.boolean(),
      })
      .passthrough(),
    access: z
      .object({ state: z.string(), setup: z.boolean(), operations: z.boolean() })
      .passthrough(),
    publication: z.object({ status: z.string() }).passthrough(),
    operation_id: Id.optional(),
  })
  .passthrough();
export type MerchantApplicationRecord = z.infer<typeof MerchantApplicationRecord>;
