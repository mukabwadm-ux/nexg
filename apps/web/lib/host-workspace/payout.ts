import 'server-only';

import { z } from 'zod';

import { HostWorkspaceError, type HostWorkspaceAccess } from './access';

/*
 * Where NexG pays a host, as the host's owner sets it (owner, 24 Nov 2026).
 *
 * The details live in public.host_payout, the row Finance verifies. The host
 * only ever reads them back masked (rpc_host_payout_mine); the full number
 * goes one way, from the form to rpc_host_payout_declare_mine
 * (20270315000200). Saving again clears Finance's check and holds the host's
 * waiting payouts until the new details are checked; the function's own note
 * says so.
 *
 * The checks here mirror the function's so a host sees a plain message before
 * the round trip. The function stays the authority: its refusals are passed
 * through word for word.
 */

export const PAYOUT_RAILS = ['mpesa_phone', 'mpesa_till', 'mpesa_paybill', 'bank'] as const;
export type PayoutRail = (typeof PAYOUT_RAILS)[number];

const text = (max: number, message: string) =>
  z.string({ required_error: message }).trim().min(1, message).max(max, message);
/* KRA PIN: A or P, nine digits, a letter (A123456789B), as the function checks it. */
const PIN_MESSAGE = 'Enter your KRA PIN as it is on your certificate, such as A123456789B.';
const kraPin = z
  .string()
  .transform((value) => value.replace(/\s/g, '').toUpperCase())
  .pipe(z.string().regex(/^(?:[AP]\d{9}[A-Z])?$/, PIN_MESSAGE))
  .optional();
const phone = z
  .string({ required_error: 'Enter your M-PESA number.' })
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .pipe(
    z
      .string()
      .regex(/^(?:0|\+?254)[17]\d{8}$/, 'Enter a Kenyan M-PESA number, such as 0712 345 678.'),
  );
const digits = (what: string) =>
  z
    .string({ required_error: `Enter the ${what} number.` })
    .trim()
    .regex(/^\d{1,20}$/, 'A till or paybill number is digits only.');

export const payoutInput = z.discriminatedUnion('rail', [
  z
    .object({
      rail: z.literal('mpesa_phone'),
      phoneNumber: phone,
      accountName: text(200, 'Enter the name on the M-PESA account.'),
      kraPin,
    })
    .strict(),
  z.object({ rail: z.literal('mpesa_till'), tillNumber: digits('till'), kraPin }).strict(),
  z
    .object({
      rail: z.literal('mpesa_paybill'),
      paybillNumber: digits('paybill'),
      accountReference: text(100, 'Enter your account number at the paybill.'),
      kraPin,
    })
    .strict(),
  z
    .object({
      rail: z.literal('bank'),
      bankName: text(100, 'Enter the name of your bank.'),
      accountName: text(200, 'Enter the name on the bank account.'),
      accountNumber: z
        .string({ required_error: 'Enter the bank account number.' })
        .transform((value) => value.replace(/[\s-]/g, ''))
        .pipe(z.string().regex(/^[0-9A-Za-z]{4,34}$/, 'Enter the bank account number.')),
      kraPin,
    })
    .strict(),
]);
export type PayoutInput = z.infer<typeof payoutInput>;

/** The first plain message from a failed parse, for the host. */
export function payoutInputMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue?.code === 'invalid_union_discriminator')
    return 'Choose how you want to be paid: M-PESA number, till, paybill or bank.';
  if (issue?.code === 'unrecognized_keys')
    return 'Fill in the fields for that payout method, and only those.';
  if (issue && !/^(Required|Invalid|Expected|String must)/.test(issue.message))
    return issue.message;
  return 'Complete every payout field.';
}

/** The jsonb rpc_host_payout_declare_mine takes: the rail's keys, plus kraPin when one was typed. */
export function toDeclarePayload(input: PayoutInput): Record<string, string> {
  const { kraPin: pin, ...rest } = input;
  const payload: Record<string, string> = { ...rest };
  /* An empty PIN field keeps the PIN NexG already holds (the key is left out). */
  if (pin) payload.kraPin = pin;
  return payload;
}

/** What the host sees. Never the full number or the PIN. */
export interface HostPayoutView {
  rail: PayoutRail;
  destinationMasked: string;
  accountName: string | null;
  bankName: string | null;
  kraPinSet: boolean;
  version: number;
  verified: boolean;
  declaredAt: string;
  statusNote: string;
}

const viewSchema = z.object({
  rail: z.enum(PAYOUT_RAILS),
  destination_masked: z.string(),
  account_name: z.string().nullable().optional(),
  bank_name: z.string().nullable().optional(),
  kra_pin_set: z.boolean().optional(),
  version: z.number().int().positive(),
  verified: z.boolean(),
  declared_at: z.string(),
  status_note: z.string().nullable().optional(),
});

/** Reads the payout part of rpc_host_payout_mine's answer; null when nothing is on file. */
export function toPayoutView(payout: unknown): HostPayoutView | null {
  if (payout === null) return null;
  const parsed = viewSchema.safeParse(payout);
  if (!parsed.success) throw new HostWorkspaceError(503, 'Your payout details could not be read.');
  const row = parsed.data;
  return {
    rail: row.rail,
    destinationMasked: row.destination_masked,
    accountName: row.account_name ?? null,
    bankName: row.bank_name ?? null,
    kraPinSet: row.kra_pin_set ?? false,
    version: row.version,
    verified: row.verified,
    declaredAt: row.declared_at,
    statusNote: row.status_note ?? '',
  };
}

/** The whole answer: { payout } on a read, plus { note } after a declaration. */
export function toPayoutAnswer(data: unknown): { payout: HostPayoutView | null; note?: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !('payout' in data))
    throw new HostWorkspaceError(503, 'Your payout details could not be read.');
  const answer = data as { payout: unknown; note?: unknown };
  const payout = toPayoutView(answer.payout);
  return typeof answer.note === 'string' && answer.note
    ? { payout, note: answer.note }
    : { payout };
}

/* Generated types do not list these functions yet; CI provides them. */
type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{
  data: unknown;
  error: { code?: string; message?: string } | null;
}>;
const rpc = (db: HostWorkspaceAccess['db']) => (db as unknown as { rpc: Rpc }).rpc.bind(db);

/** Only the account-wide owner sees or sets where the money goes, as the function requires. */
export function requirePayoutOwner(access: HostWorkspaceAccess) {
  if (access.role !== 'Owner' || access.unitScope)
    throw new HostWorkspaceError(
      403,
      'Only the owner of this host account can see or change where NexG pays you.',
    );
}

/** A refusal the function words for the host is shown as it is; anything else is generic. */
function refusal(
  error: { code?: string; message?: string },
  fallback: HostWorkspaceError,
): HostWorkspaceError {
  const status =
    error.code === '22023'
      ? 400
      : error.code === '42501'
        ? 403
        : error.code === 'P0002'
          ? 404
          : null;
  return status && error.message ? new HostWorkspaceError(status, error.message) : fallback;
}

export async function readHostPayout(access: HostWorkspaceAccess) {
  requirePayoutOwner(access);
  const { data, error } = await rpc(access.db)('rpc_host_payout_mine', {
    p_host_id: access.hostId,
  });
  if (error)
    throw refusal(error, new HostWorkspaceError(503, 'Your payout details could not be loaded.'));
  return { payout: toPayoutAnswer(data).payout };
}

export async function declareHostPayout(access: HostWorkspaceAccess, input: PayoutInput) {
  requirePayoutOwner(access);
  const { data, error } = await rpc(access.db)('rpc_host_payout_declare_mine', {
    p_host_id: access.hostId,
    p_payout: toDeclarePayload(input),
  });
  /* After an unknown failure the save may still have happened, so the host refreshes first. */
  if (error)
    throw refusal(
      error,
      new HostWorkspaceError(503, 'Saving could not be confirmed. Refresh before trying again.'),
    );
  let answer: ReturnType<typeof toPayoutAnswer>;
  try {
    answer = toPayoutAnswer(data);
  } catch {
    throw new HostWorkspaceError(
      503,
      'Saving could not be confirmed. Refresh before trying again.',
    );
  }
  return {
    payout: answer.payout,
    note: answer.note ?? 'Saved. NexG checks new payout details before paying you.',
  };
}
