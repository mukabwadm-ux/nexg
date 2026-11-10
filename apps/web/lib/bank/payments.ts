import 'server-only';

import { bankProvider, bankWebhookSecret, type BankProvider } from '@/lib/bank';
import { createPublicClient } from '@/lib/supabase/public';
import type { createClient } from '@/lib/supabase/server';

/*
 * Starting a bank payment for an order, and recording what the bank says.
 * See supabase/migrations/20261130000100_bank_collections.sql for the rules
 * the database applies.
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

export type BankStart =
  | { ok: true; reference: string; authorization_url: string }
  | { ok: true; reference: string; paid: true }
  | { ok: false; status: number; message: string; reference?: string };

interface Begun {
  payment_id: string;
  reference: string;
  amount_cents: number;
  currency: string;
  order_reference?: string;
}

interface PaymentRow {
  state: string;
  provider: string | null;
  provider_ref: string | null;
  authorization_url: string | null;
}

/**
 * Ask the bank to record its latest signed event for a collection. Returns
 * the bank's status, or null when the bank could not be asked.
 */
export async function recordLatestBankEvent(provider: BankProvider, collectionId: string) {
  const latest = await provider.latestEvent(collectionId);
  if (!latest.ok || !latest.data) return null;
  if (!['succeeded', 'failed', 'expired', 'cancelled'].includes(latest.data.status ?? '')) {
    return latest.data.status;
  }
  const { error } = await loose(createPublicClient())('rpc_payment_bank_webhook', {
    p_provider: provider.id,
    p_raw_body: latest.data.body,
    p_signature_header: latest.data.signature,
  });
  return error ? null : latest.data.status;
}

/** On the pay page: a bank payment still waiting is checked with the bank. */
export async function reconcileBankPayment(payment: {
  state: string;
  provider: string | null;
  provider_ref: string | null;
}) {
  const provider = bankProvider();
  if (!provider || payment.state !== 'authorised' || payment.provider !== provider.id) return false;
  if (!payment.provider_ref) return false;
  const status = await recordLatestBankEvent(provider, payment.provider_ref);
  return status !== null && status !== 'pending' && status !== 'processing';
}

/**
 * Open (or reopen) a bank collection for what is owed on an order. The amount
 * always comes from the database, never from the request.
 */
export async function startBankPayment(
  supabase: Client,
  input: { orderId: string; origin: string; email?: string | null; name?: string | null },
): Promise<BankStart> {
  const provider = bankProvider();
  const proof = bankWebhookSecret();
  if (!provider || !proof) {
    return { ok: false, status: 503, message: 'Paying by bank is not available right now.' };
  }
  const rpc = loose(supabase);

  const begin = async (): Promise<{ error: string } | { error: null; payment: Begun }> => {
    const begun = await rpc('rpc_payment_begin_order', { p_order_id: input.orderId });
    if (begun.error) {
      return { error: begun.error.message.replace(/^.*?:\s*/, '') };
    }
    return { error: null, payment: begun.data as Begun };
  };

  let started = await begin();
  if (started.error !== null) return { ok: false, status: 400, message: started.error };
  let payment = started.payment;

  // An open payment may already have a bank collection waiting.
  const { data: existing } = await supabase
    .from('payment')
    .select('state, provider, provider_ref, authorization_url')
    .eq('reference', payment.reference)
    .maybeSingle();
  const row = existing as PaymentRow | null;
  if (row?.provider === provider.id && row.provider_ref) {
    const status = await recordLatestBankEvent(provider, row.provider_ref);
    if ((status === 'pending' || status === 'processing') && row.authorization_url) {
      return { ok: true, reference: payment.reference, authorization_url: row.authorization_url };
    }
    if (status === 'succeeded') return { ok: true, reference: payment.reference, paid: true };
    if (status === null) {
      return {
        ok: false,
        status: 502,
        message: 'The bank could not be reached. Try again in a moment.',
        reference: payment.reference,
      };
    }
    // That collection failed or expired, so the payment did too: start a new one.
    started = await begin();
    if (started.error !== null) return { ok: false, status: 400, message: started.error };
    payment = started.payment;
  }

  const opened = await provider.openCollection({
    reference: payment.reference,
    amountCents: payment.amount_cents,
    currency: payment.currency,
    description: payment.order_reference ? `NexG order ${payment.order_reference}` : 'NexG payment',
    customer: { name: input.name ?? null, email: input.email ?? null },
    callbackUrl: `${input.origin}/api/payments/bank/webhook`,
    returnUrl: `${input.origin}/pay/${payment.reference}`,
  });
  if (!opened.ok || !opened.data) {
    return { ok: false, status: 502, message: opened.message, reference: payment.reference };
  }

  const recorded = await rpc('rpc_payment_bank_started', {
    p_reference: payment.reference,
    p_provider: provider.id,
    p_collection_id: opened.data.id,
    p_checkout_url: opened.data.checkoutUrl,
    p_proof: proof,
  });
  if (recorded.error) {
    return {
      ok: false,
      status: 500,
      message: `The bank opened the payment but we could not record it: ${recorded.error.message}`,
      reference: payment.reference,
    };
  }
  return { ok: true, reference: payment.reference, authorization_url: opened.data.checkoutUrl };
}
