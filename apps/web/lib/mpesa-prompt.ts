import 'server-only';

import { darajaConfigured, stkPush, stkQuery } from '@/lib/daraja';
import { createPublicClient } from '@/lib/supabase/public';
import type { createClient } from '@/lib/supabase/server';

/*
 * Sending an M-Pesa prompt, and finding out what came of it, for orders and
 * stays alike. Every prompt is recorded (payment_prompt), so a guest who is
 * sent a second one can pay either and nothing is lost; see
 * supabase/migrations/20261127000100_mpesa_prompts.sql.
 */

type Client = ReturnType<typeof createClient>;

/* Not in the generated types until they are regenerated with these RPCs. */
type LooseRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;
const loose = (client: { rpc: unknown }) =>
  ((fn: string, args: Record<string, unknown>) =>
    Promise.resolve(
      (client.rpc as (f: never, a: never) => PromiseLike<unknown>)(fn as never, args as never),
    )) as LooseRpc;

export type PromptOutcome =
  | { ok: true; message: string }
  | { ok: false; status: number; message: string; pending?: boolean; waitSeconds?: number };

/** Sends the PIN prompt for a payment the caller has just begun or reused. */
export async function sendMpesaPrompt(input: {
  supabase: Client;
  reference: string;
  /* The account the customer's M-Pesa SMS names; defaults to the payment reference. */
  accountReference?: string;
  amountCents: number;
  phone: string;
  origin: string;
  description: string;
  notReadyMessage: string;
}): Promise<PromptOutcome> {
  const rpc = loose(input.supabase);

  const wait = await rpc('rpc_payment_mpesa_prompt_wait', { p_reference: input.reference });
  const gate = wait.data as { ok?: boolean; message?: string; wait_seconds?: number } | null;
  if (wait.error) {
    return { ok: false, status: 400, message: wait.error.message.replace(/^.*?:\s*/, '') };
  }
  if (gate && gate.ok === false) {
    return {
      ok: false,
      status: 429,
      message: gate.message ?? 'Check your phone for the prompt already sent.',
      waitSeconds: gate.wait_seconds ?? 0,
    };
  }

  const callbackSecret = process.env.DARAJA_CALLBACK_SECRET?.trim() ?? '';
  const ready =
    darajaConfigured() &&
    (await input.supabase.rpc('rpc_payment_mpesa_ready', { p_callback_secret: callbackSecret }))
      .data;
  if (!ready) {
    return { ok: false, status: 503, pending: true, message: input.notReadyMessage };
  }

  const sent = await stkPush({
    phone: input.phone,
    amountCents: input.amountCents,
    reference: input.reference,
    accountReference: input.accountReference,
    callbackUrl: `${input.origin}/api/payments/mpesa/callback?token=${encodeURIComponent(callbackSecret)}`,
    description: input.description,
  });
  if (!sent.ok || !sent.checkoutRequestId) {
    return { ok: false, status: 502, message: sent.message };
  }

  const back = await rpc('rpc_payment_mpesa_sent', {
    p_reference: input.reference,
    p_checkout_request_id: sent.checkoutRequestId,
    p_merchant_request_id: sent.merchantRequestId ?? '',
    p_phone: input.phone,
    p_callback_secret: callbackSecret,
  });
  if (back.error) {
    return {
      ok: false,
      status: 500,
      message: `Prompt sent but not recorded: ${back.error.message}`,
    };
  }
  return { ok: true, message: sent.message };
}

/**
 * Asks M-Pesa about this payment's prompts that have had no result for 45
 * seconds, and records any final answer exactly as a callback would be.
 * Safe to call on every page view: the database hands each prompt out at
 * most every 20 seconds. Returns true when something was recorded.
 */
export async function reconcileMpesaPrompts(supabase: Client, reference: string): Promise<boolean> {
  if (!darajaConfigured()) return false;

  const open = await loose(supabase)('rpc_payment_mpesa_open_prompts', { p_reference: reference });
  const prompts = (open.data ?? []) as OpenPrompt[];
  if (open.error || prompts.length === 0) return false;

  const outcome = await askAndRecord(prompts);
  return outcome.recorded > 0;
}

type OpenPrompt = { checkout_request_id: string; amount_cents: number };

export interface SweepOutcome {
  asked: number;
  recorded: number;
  stillOpen: number;
  errors: string[];
}

/** Asks M-Pesa about each prompt and records any final answer exactly as a callback would be. */
async function askAndRecord(prompts: OpenPrompt[]): Promise<SweepOutcome> {
  const callbackSecret = process.env.DARAJA_CALLBACK_SECRET?.trim() ?? '';
  const record = loose(createPublicClient());
  const outcome: SweepOutcome = { asked: 0, recorded: 0, stillOpen: 0, errors: [] };
  for (const prompt of prompts) {
    outcome.asked += 1;
    const answer = await stkQuery(prompt.checkout_request_id);
    if (answer.status !== 'paid' && answer.status !== 'failed') {
      outcome.stillOpen += 1;
      if (answer.status === 'error') outcome.errors.push(answer.message);
      continue;
    }
    const { error } = await record('rpc_payment_mpesa_callback', {
      p_checkout_request_id: prompt.checkout_request_id,
      p_result_code: answer.resultCode,
      p_result_desc: answer.resultDesc,
      p_callback_secret: callbackSecret,
      p_payload: {
        source: 'stk_query',
        ResultCode: answer.resultCode,
        ResultDesc: answer.resultDesc,
      },
      /* The query does not repeat the amount; it settles the one we asked for. */
      ...(answer.status === 'paid'
        ? { p_amount_kes: Math.ceil(Number(prompt.amount_cents) / 100) }
        : {}),
    });
    if (error) outcome.errors.push(error.message);
    else outcome.recorded += 1;
  }
  return outcome;
}

/**
 * The background half of the same job, for when nobody is on the pay page:
 * every prompt across every payment that is due another question, or just
 * one payment's prompts when staff press "Check with M-Pesa". The database
 * decides what is due and spaces the questions out; the Vault token proves
 * the caller is this server.
 */
export async function settleDuePrompts(input: { reference?: string } = {}): Promise<SweepOutcome> {
  if (!darajaConfigured()) {
    return { asked: 0, recorded: 0, stillOpen: 0, errors: ['M-Pesa is not configured.'] };
  }
  const callbackSecret = process.env.DARAJA_CALLBACK_SECRET?.trim() ?? '';
  const due = await loose(createPublicClient())('rpc_payment_mpesa_due_prompts', {
    p_callback_secret: callbackSecret,
    p_reference: input.reference ?? null,
    p_limit: 15,
  });
  if (due.error) return { asked: 0, recorded: 0, stillOpen: 0, errors: [due.error.message] };
  return askAndRecord((due.data ?? []) as OpenPrompt[]);
}
